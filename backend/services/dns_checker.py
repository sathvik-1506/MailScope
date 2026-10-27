"""
DNS-based deliverability check service.

Queries MX records for a domain, validates and resolves MX target hostnames,
and falls back to A/AAAA records when no MX records are published
(RFC 5321 § 5.1 implicit MX fallback).

Key Behaviors & Invariants:
----------------------------
1. Safe Domain Normalization: Domain names are validated, trimmed, and normalized
   to lowercase without trailing dots. IP literals and illegal characters are rejected.
2. Bounded Timeouts: Queries use finite, strictly bounded timeouts (1.0s to 10.0s).
3. NXDOMAIN vs. Temporary Errors: Authoritative domain nonexistence (NXDOMAIN)
   is strictly separated from transient nameserver errors (SERVFAIL) and timeouts.
4. NODATA vs. NXDOMAIN: Missing MX records on an existing domain (NODATA / NoAnswer)
   are distinguished from domain nonexistence, triggering RFC 5321 § 5.1 fallback.
5. Implicit MX Fallback: Handled when MX returns NoAnswer (NODATA). A and AAAA
   records act as implicit mail routing targets.
6. Mailbox Existence Caveat: Positive DNS routing evidence alone DOES NOT prove
   individual mailbox existence.
7. Null MX (RFC 7505): Detected when a single MX exchange of '.' is published,
   explicitly indicating the domain does not accept email.
8. MX Target Host Validation & Resolution: MX exchange hostnames are syntax-checked
   (rejecting IP literals per RFC 2181 § 10.3) and resolved to active A/AAAA addresses.
   Unresolvable or invalid routing targets are isolated and reported accurately.
9. DNSSEC: Not claimed or asserted unless cryptographically validated.
10. Inconclusive Handling: Timeouts, SERVFAIL, and resolver exceptions produce
    inconclusive states (mapping to Unknown verdicts, never bounces).
"""

from __future__ import annotations

import ipaddress
from dataclasses import dataclass, field
from enum import Enum

import dns.resolver
import dns.exception


class DNSStatus(str, Enum):
    HAS_MX = "has_mx"          # at least one valid, resolvable MX target found
    HAS_A = "has_a"            # no MX but A/AAAA record exists (implicit MX fallback)
    NO_RECORDS = "no_records"  # NXDOMAIN, Null MX (RFC 7505), or no usable routing targets
    TIMEOUT = "timeout"        # resolver timed out – inconclusive
    SERVFAIL = "servfail"      # nameserver failure / SERVFAIL – inconclusive
    ERROR = "error"            # unexpected resolver or network error


_DEFAULT_TIMEOUT_SECONDS = 5.0
_MIN_TIMEOUT_SECONDS = 1.0
_MAX_TIMEOUT_SECONDS = 10.0


@dataclass(frozen=True)
class DNSResult:
    status: DNSStatus
    domain: str
    state: str = "inconclusive"  # "passed" | "failed" | "inconclusive" | "unavailable"
    mx_hosts: list[str] = field(default_factory=list)
    invalid_mx_hosts: list[str] = field(default_factory=list)
    unresolvable_mx_hosts: list[str] = field(default_factory=list)
    has_implicit_mx: bool = False
    is_nxdomain: bool = False
    is_nodata: bool = False
    is_null_mx: bool = False
    reason: str = ""


def normalize_domain(domain: str) -> tuple[bool, str, str]:
    """Validate and normalize a domain name extracted from an email address.

    Returns:
        (is_valid, clean_domain, error_reason)
    """
    clean = (domain or "").strip().lower().rstrip(".")
    if not clean:
        return False, "", "Domain name is empty."

    # Reject control chars, spaces, URIs, IP literal brackets, or illegal characters
    if any(char in clean for char in (":", "/", "\\", " ", "?", "#", "@", "[", "]", "\t", "\r", "\n")):
        return False, clean, f"Domain '{clean}' contains invalid characters or IP literal format."

    if len(clean) > 253:
        return False, clean, f"Domain '{clean}' exceeds maximum allowed length of 253 characters."

    # Direct IP literal rejection
    try:
        ipaddress.ip_address(clean)
        return False, clean, f"Direct IP address '{clean}' is not a valid domain name."
    except ValueError:
        pass

    labels = clean.split(".")
    for label in labels:
        if not label:
            return False, clean, f"Domain '{clean}' contains an empty label."
        if len(label) > 63:
            return False, clean, f"Domain label '{label}' exceeds 63 characters."
        if label.startswith("-") or label.endswith("-"):
            return False, clean, f"Domain label '{label}' has leading or trailing hyphen."

    return True, clean, ""


def validate_mx_hostname(hostname: str) -> tuple[bool, str, str]:
    """Validate MX target hostname syntax (RFC 1035, RFC 2181 § 10.3, RFC 5321 § 5.1).

    An MX target hostname:
    - Must be a valid domain name.
    - Must NOT be an IP literal (IPv4 or IPv6) or URL.
    - Must NOT contain spaces, slashes, or illegal symbols.
    - Must NOT exceed 253 characters.
    """
    clean = (hostname or "").strip().lower().rstrip(".")
    if not clean:
        return False, "", "MX hostname is empty."

    if any(char in clean for char in (":", "/", "\\", " ", "?", "#", "@", "[", "]")) or clean.startswith("-"):
        return False, clean, f"MX hostname '{clean}' contains invalid characters or URI formatting."

    if len(clean) > 253:
        return False, clean, f"MX hostname '{clean}' exceeds maximum allowed length of 253 characters."

    # Direct IP address literals (IPv4 or IPv6) are prohibited as MX destinations
    try:
        ipaddress.ip_address(clean)
        return False, clean, f"Direct IP address '{clean}' is prohibited as an MX target (RFC 2181 § 10.3)."
    except ValueError:
        pass

    labels = clean.split(".")
    for label in labels:
        if not label:
            return False, clean, f"MX hostname '{clean}' contains an empty label."
        if len(label) > 63:
            return False, clean, f"MX hostname label '{label}' exceeds 63 characters."
        if label.startswith("-") or label.endswith("-"):
            return False, clean, f"MX hostname label '{label}' has leading or trailing hyphen."

    return True, clean, ""


def _resolve_target_host(
    resolver: dns.resolver.Resolver,
    hostname: str,
) -> tuple[str, str]:
    """Resolve an MX hostname to verify active A or AAAA address records.

    Returns:
        (outcome, detail)
        where outcome is one of:
            - 'resolvable': Host has at least one valid address record.
            - 'unresolvable': Host does not exist (NXDOMAIN) or has no address records (NODATA).
            - 'timeout': Resolver timed out querying host.
            - 'servfail': Resolver encountered nameserver failure / SERVFAIL.
            - 'error': Unexpected resolver exception.
    """
    has_address = False
    is_nxdomain = False
    timeout_occurred = False
    servfail_occurred = False
    last_err = ""

    for record_type in ("A", "AAAA"):
        try:
            answers = resolver.resolve(hostname, record_type)
            if answers:
                has_address = True
                break
        except dns.resolver.NXDOMAIN:
            is_nxdomain = True
            break
        except dns.resolver.NoAnswer:
            continue
        except (dns.exception.Timeout, dns.resolver.LifetimeTimeout) as exc:
            timeout_occurred = True
            last_err = str(exc)
        except dns.resolver.NoNameservers as exc:
            servfail_occurred = True
            last_err = str(exc)
        except Exception as exc:  # noqa: BLE001
            last_err = str(exc)

    if has_address:
        return "resolvable", f"Host '{hostname}' resolved with active address records."
    if is_nxdomain:
        return "unresolvable", f"Target host '{hostname}' does not exist (NXDOMAIN)."
    if timeout_occurred:
        return "timeout", f"Target host '{hostname}' resolution timed out: {last_err}"
    if servfail_occurred:
        return "servfail", f"Target host '{hostname}' nameserver failure (SERVFAIL): {last_err}"
    if last_err:
        return "error", f"Error resolving target host '{hostname}': {last_err}"
    return "unresolvable", f"Target host '{hostname}' has no A or AAAA address records (NODATA)."


def check_dns(domain: str, timeout: float = _DEFAULT_TIMEOUT_SECONDS) -> DNSResult:
    """Query MX (and fallback A/AAAA) records for *domain* with bounded timeouts.

    Args:
        domain: The email domain to inspect (e.g. ``"example.com"``).
        timeout: DNS query timeout in seconds (bounded between 1.0s and 10.0s).

    Returns:
        A :class:`DNSResult` with the observed status, explicit evidence state,
        and supporting routing details.
    """
    is_valid_domain, clean_domain, domain_err = normalize_domain(domain)
    if not is_valid_domain:
        return DNSResult(
            status=DNSStatus.NO_RECORDS,
            state="unavailable",
            domain=domain,
            reason=domain_err,
        )

    bounded_timeout = max(_MIN_TIMEOUT_SECONDS, min(float(timeout), _MAX_TIMEOUT_SECONDS))

    resolver = dns.resolver.Resolver()
    resolver.lifetime = bounded_timeout
    resolver.timeout = bounded_timeout

    # ------------------------------------------------------------------ #
    # 1. Query MX records                                                #
    # ------------------------------------------------------------------ #
    try:
        answers = resolver.resolve(clean_domain, "MX")

        # Check for Null MX (RFC 7505: exchange '.' explicitly rejects all email)
        for r in answers:
            exchange_str = str(r.exchange).rstrip(".")
            if exchange_str == "" or exchange_str == ".":
                return DNSResult(
                    status=DNSStatus.NO_RECORDS,
                    state="failed",
                    domain=clean_domain,
                    is_null_mx=True,
                    reason=f"Domain '{clean_domain}' publishes a Null MX record (RFC 7505) explicitly rejecting all email.",
                )

        # Sort MX records by preference / priority (lowest preference number first)
        sorted_answers = sorted(answers, key=lambda rec: getattr(rec, "preference", 0))

        valid_mx_hosts: list[str] = []
        invalid_mx_hosts: list[str] = []
        unresolvable_mx_hosts: list[str] = []
        timeout_mx_hosts: list[str] = []
        servfail_mx_hosts: list[str] = []
        error_mx_hosts: list[str] = []

        for r in sorted_answers:
            raw_host = str(r.exchange)
            is_valid_host, clean_host, host_err = validate_mx_hostname(raw_host)
            if not is_valid_host:
                invalid_mx_hosts.append(raw_host.rstrip("."))
                continue

            outcome, detail = _resolve_target_host(resolver, clean_host)
            if outcome == "resolvable":
                valid_mx_hosts.append(clean_host)
            elif outcome == "unresolvable":
                unresolvable_mx_hosts.append(clean_host)
            elif outcome == "timeout":
                timeout_mx_hosts.append(clean_host)
            elif outcome == "servfail":
                servfail_mx_hosts.append(clean_host)
            else:
                error_mx_hosts.append(clean_host)

        # Evaluate MX target validation outcomes
        if valid_mx_hosts:
            reason_parts = [f"Found {len(valid_mx_hosts)} valid, resolvable MX target(s): {', '.join(valid_mx_hosts)}."]
            if invalid_mx_hosts:
                reason_parts.append(f"Ignored invalid MX target(s): {', '.join(invalid_mx_hosts)}.")
            if unresolvable_mx_hosts:
                reason_parts.append(f"Ignored unresolvable MX target(s): {', '.join(unresolvable_mx_hosts)}.")
            return DNSResult(
                status=DNSStatus.HAS_MX,
                state="passed",
                domain=clean_domain,
                mx_hosts=valid_mx_hosts,
                invalid_mx_hosts=invalid_mx_hosts,
                unresolvable_mx_hosts=unresolvable_mx_hosts,
                reason=" ".join(reason_parts),
            )

        # If NO valid MX hosts resolved, determine if failure was temporary or definitive
        if timeout_mx_hosts:
            return DNSResult(
                status=DNSStatus.TIMEOUT,
                state="inconclusive",
                domain=clean_domain,
                invalid_mx_hosts=invalid_mx_hosts,
                unresolvable_mx_hosts=unresolvable_mx_hosts,
                reason=f"DNS query timed out resolving MX target host(s) ({', '.join(timeout_mx_hosts)}) – result is inconclusive.",
            )

        if servfail_mx_hosts:
            return DNSResult(
                status=DNSStatus.SERVFAIL,
                state="inconclusive",
                domain=clean_domain,
                invalid_mx_hosts=invalid_mx_hosts,
                unresolvable_mx_hosts=unresolvable_mx_hosts,
                reason=f"Nameserver failure (SERVFAIL) resolving MX target host(s) ({', '.join(servfail_mx_hosts)}) – result is inconclusive.",
            )

        if error_mx_hosts:
            return DNSResult(
                status=DNSStatus.ERROR,
                state="inconclusive",
                domain=clean_domain,
                invalid_mx_hosts=invalid_mx_hosts,
                unresolvable_mx_hosts=unresolvable_mx_hosts,
                reason=f"Resolver error resolving MX target host(s) ({', '.join(error_mx_hosts)}) – result is inconclusive.",
            )

        # All MX candidates were either invalid format or unresolvable in DNS
        all_unusable = invalid_mx_hosts + unresolvable_mx_hosts
        return DNSResult(
            status=DNSStatus.NO_RECORDS,
            state="failed",
            domain=clean_domain,
            invalid_mx_hosts=invalid_mx_hosts,
            unresolvable_mx_hosts=unresolvable_mx_hosts,
            reason=f"Domain '{clean_domain}' publishes MX records, but all routing targets are invalid or unresolvable ({', '.join(all_unusable)}).",
        )

    except dns.resolver.NXDOMAIN:
        # Definitive domain nonexistence; RFC 5321 fallback does not apply
        return DNSResult(
            status=DNSStatus.NO_RECORDS,
            state="failed",
            domain=clean_domain,
            is_nxdomain=True,
            reason=f"Domain '{clean_domain}' does not exist in authoritative DNS (NXDOMAIN).",
        )
    except dns.resolver.NoAnswer:
        # Domain exists, but has no MX records (NODATA); fall through to RFC 5321 implicit MX fallback
        pass
    except dns.resolver.NoNameservers:
        return DNSResult(
            status=DNSStatus.SERVFAIL,
            state="inconclusive",
            domain=clean_domain,
            reason=f"DNS query failed due to nameserver failure or SERVFAIL for domain '{clean_domain}'; result is inconclusive.",
        )
    except (dns.exception.Timeout, dns.resolver.LifetimeTimeout):
        return DNSResult(
            status=DNSStatus.TIMEOUT,
            state="inconclusive",
            domain=clean_domain,
            reason=f"DNS query timed out for domain '{clean_domain}' – result is inconclusive.",
        )
    except Exception as exc:  # noqa: BLE001
        return DNSResult(
            status=DNSStatus.ERROR,
            state="inconclusive",
            domain=clean_domain,
            reason=f"DNS query error for domain '{clean_domain}': {exc}",
        )

    # ------------------------------------------------------------------ #
    # 2. RFC 5321 § 5.1 Implicit MX Fallback (A / AAAA)                  #
    # ------------------------------------------------------------------ #
    # If no MX records are published (NODATA), an A or AAAA record acts
    # as an implicit MX pointing directly to that host.
    for record_type in ("A", "AAAA"):
        try:
            answers = resolver.resolve(clean_domain, record_type)
            if answers:
                return DNSResult(
                    status=DNSStatus.HAS_A,
                    state="passed",
                    domain=clean_domain,
                    mx_hosts=[clean_domain],
                    has_implicit_mx=True,
                    reason=(
                        f"No MX records found (NODATA), but domain has active {record_type} records. "
                        "Implicit MX fallback (RFC 5321 § 5.1) may accept direct delivery."
                    ),
                )
        except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
            continue
        except dns.resolver.NoNameservers:
            return DNSResult(
                status=DNSStatus.SERVFAIL,
                state="inconclusive",
                domain=clean_domain,
                reason=f"DNS query failed due to nameserver failure or SERVFAIL during fallback resolution for '{clean_domain}'.",
            )
        except (dns.exception.Timeout, dns.resolver.LifetimeTimeout):
            return DNSResult(
                status=DNSStatus.TIMEOUT,
                state="inconclusive",
                domain=clean_domain,
                reason=f"DNS query timed out during fallback resolution for '{clean_domain}' – result is inconclusive.",
            )
        except Exception as exc:  # noqa: BLE001
            return DNSResult(
                status=DNSStatus.ERROR,
                state="inconclusive",
                domain=clean_domain,
                reason=f"Unexpected DNS error during fallback resolution for '{clean_domain}': {exc}",
            )

    return DNSResult(
        status=DNSStatus.NO_RECORDS,
        state="failed",
        domain=clean_domain,
        is_nodata=True,
        reason=f"Domain '{clean_domain}' exists in DNS (NODATA on MX), but has no MX or fallback A/AAAA records. No mail routing destination exists.",
    )
