"""
DNS-based deliverability check service with comprehensive DNS/MX auditing.

Queries MX records for a domain, validates and resolves MX target hostnames to IPv4 and IPv6,
inspects SPF and DMARC authentication policies, and falls back to A/AAAA records when no
MX records are published (RFC 5321 § 5.1 implicit MX fallback).

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
6. Mailbox Existence Caveat: Positive DNS routing evidence and email authentication
   records (SPF/DMARC) alone DO NOT prove individual mailbox existence.
7. Null MX (RFC 7505): Detected when a single MX exchange of '.' is published,
   explicitly indicating the domain does not accept email.
8. MX Target Host Validation & Resolution: MX exchange hostnames are syntax-checked
   (rejecting IP literals per RFC 2181 § 10.3) and resolved to active IPv4 and IPv6 addresses.
   Unresolvable or invalid routing targets are isolated and reported accurately.
9. Email Authentication Records (SPF & DMARC): Inspects SPF (RFC 7208) and DMARC
   (RFC 7489) TXT records to report domain-level sender security policies.
10. Inconclusive Handling: Timeouts, SERVFAIL, and resolver exceptions produce
    inconclusive states (mapping to Unknown verdicts, never bounces).
"""

from __future__ import annotations

import ipaddress
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

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
    # Structured DNS / MX Audit fields:
    mx_status: str = "not_checked"  # "found" | "no_record" | "nxdomain" | "timeout" | "dns_error" | "not_checked"
    mx_records: list[dict[str, Any]] = field(default_factory=list)
    mx_hosts_resolve: bool = False
    spf_status: str = "not_checked"  # "found" | "no_record" | "invalid" | "timeout" | "dns_error" | "not_checked"
    spf_record: str | None = None
    dmarc_status: str = "not_checked"  # "found" | "no_record" | "invalid" | "timeout" | "dns_error" | "not_checked"
    dmarc_record: str | None = None
    dns_error: str | None = None
    checked_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Returns structured DNS audit evidence matching Mailora schemas."""
        return {
            "status": self.status.value if hasattr(self.status, "value") else str(self.status),
            "state": self.state,
            "domain": self.domain,
            "mx_hosts": self.mx_hosts,
            "invalid_mx_hosts": self.invalid_mx_hosts,
            "unresolvable_mx_hosts": self.unresolvable_mx_hosts,
            "has_implicit_mx": self.has_implicit_mx,
            "is_nxdomain": self.is_nxdomain,
            "is_nodata": self.is_nodata,
            "is_null_mx": self.is_null_mx,
            "reason": self.reason,
            "mx_status": self.mx_status,
            "mx_records": self.mx_records,
            "mx_hosts_resolve": self.mx_hosts_resolve,
            "spf_status": self.spf_status,
            "spf_record": self.spf_record,
            "dmarc_status": self.dmarc_status,
            "dmarc_record": self.dmarc_record,
            "dns_error": self.dns_error,
            "checked_at": self.checked_at,
        }


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
) -> tuple[str, str, list[str], list[str]]:
    """Resolve an MX hostname to verify active A (IPv4) or AAAA (IPv6) address records.

    Returns:
        (outcome, detail, ipv4_addresses, ipv6_addresses)
        where outcome is one of:
            - 'resolvable': Host has at least one valid address record.
            - 'unresolvable': Host does not exist (NXDOMAIN) or has no address records (NODATA).
            - 'timeout': Resolver timed out querying host.
            - 'servfail': Resolver encountered nameserver failure / SERVFAIL.
            - 'error': Unexpected resolver exception.
    """
    ipv4_addresses: list[str] = []
    ipv6_addresses: list[str] = []
    is_nxdomain = False
    timeout_occurred = False
    servfail_occurred = False
    last_err = ""

    for record_type in ("A", "AAAA"):
        try:
            answers = resolver.resolve(hostname, record_type)
            if answers:
                for rdata in answers:
                    ip_str = str(rdata).strip()
                    if record_type == "A":
                        ipv4_addresses.append(ip_str)
                    else:
                        ipv6_addresses.append(ip_str)
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

    if ipv4_addresses or ipv6_addresses:
        return "resolvable", f"Host '{hostname}' resolved with active address records.", ipv4_addresses, ipv6_addresses
    if is_nxdomain:
        return "unresolvable", f"Target host '{hostname}' does not exist (NXDOMAIN).", [], []
    if timeout_occurred:
        return "timeout", f"Target host '{hostname}' resolution timed out: {last_err}", [], []
    if servfail_occurred:
        return "servfail", f"Target host '{hostname}' nameserver failure (SERVFAIL): {last_err}", [], []
    if last_err:
        return "error", f"Error resolving target host '{hostname}': {last_err}", [], []
    return "unresolvable", f"Target host '{hostname}' has no A or AAAA address records (NODATA).", [], []


def _check_spf(
    resolver: dns.resolver.Resolver,
    clean_domain: str,
) -> tuple[str, str | None, str | None]:
    """Inspect SPF TXT records on *clean_domain* (RFC 7208).

    Returns:
        (spf_status, spf_record, error_detail)
        where spf_status is one of:
            - 'found': Single valid SPF record published.
            - 'no_record': No TXT record or no SPF policy published.
            - 'invalid': Multiple SPF records found (RFC 7208 § 3 violation).
            - 'timeout': Resolver timed out querying SPF TXT records.
            - 'dns_error': Resolver error / SERVFAIL querying SPF TXT records.
    """
    try:
        answers = resolver.resolve(clean_domain, "TXT")
        spf_candidates: list[str] = []
        for rdata in answers:
            txt_parts = [
                s.decode("utf-8", errors="replace") if isinstance(s, bytes) else str(s)
                for s in getattr(rdata, "strings", [str(rdata)])
            ]
            txt_content = "".join(txt_parts).strip()
            if txt_content.lower().startswith("v=spf1 ") or txt_content.lower() == "v=spf1":
                spf_candidates.append(txt_content)

        if not spf_candidates:
            return "no_record", None, None
        if len(spf_candidates) > 1:
            return "invalid", spf_candidates[0], "Multiple SPF records published (RFC 7208 § 3 violation)."
        return "found", spf_candidates[0], None
    except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
        return "no_record", None, None
    except (dns.exception.Timeout, dns.resolver.LifetimeTimeout) as exc:
        return "timeout", None, f"SPF lookup timed out: {exc}"
    except dns.resolver.NoNameservers as exc:
        return "dns_error", None, f"SPF lookup nameserver failure (SERVFAIL): {exc}"
    except Exception as exc:  # noqa: BLE001
        return "dns_error", None, f"SPF lookup error: {exc}"


def _check_dmarc(
    resolver: dns.resolver.Resolver,
    clean_domain: str,
) -> tuple[str, str | None, str | None]:
    """Inspect DMARC TXT records under _dmarc.<clean_domain> (RFC 7489).

    Returns:
        (dmarc_status, dmarc_record, error_detail)
        where dmarc_status is one of:
            - 'found': Valid DMARC record published.
            - 'no_record': No DMARC TXT record published under _dmarc.<domain>.
            - 'invalid': Multiple DMARC records published (RFC 7489 § 6.6.3 violation).
            - 'timeout': Resolver timed out querying DMARC TXT record.
            - 'dns_error': Resolver error / SERVFAIL querying DMARC TXT record.
    """
    dmarc_domain = f"_dmarc.{clean_domain}"
    try:
        answers = resolver.resolve(dmarc_domain, "TXT")
        dmarc_candidates: list[str] = []
        for rdata in answers:
            txt_parts = [
                s.decode("utf-8", errors="replace") if isinstance(s, bytes) else str(s)
                for s in getattr(rdata, "strings", [str(rdata)])
            ]
            txt_content = "".join(txt_parts).strip()
            if txt_content.lower().startswith("v=dmarc1") or "v=dmarc1;" in txt_content.lower():
                dmarc_candidates.append(txt_content)

        if not dmarc_candidates:
            return "no_record", None, None
        if len(dmarc_candidates) > 1:
            return "invalid", dmarc_candidates[0], "Multiple DMARC records published (RFC 7489 violation)."
        return "found", dmarc_candidates[0], None
    except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
        return "no_record", None, None
    except (dns.exception.Timeout, dns.resolver.LifetimeTimeout) as exc:
        return "timeout", None, f"DMARC lookup timed out: {exc}"
    except dns.resolver.NoNameservers as exc:
        return "dns_error", None, f"DMARC lookup nameserver failure (SERVFAIL): {exc}"
    except Exception as exc:  # noqa: BLE001
        return "dns_error", None, f"DMARC lookup error: {exc}"


def check_dns(domain: str, timeout: float = _DEFAULT_TIMEOUT_SECONDS) -> DNSResult:
    """Query MX (and fallback A/AAAA) records, SPF, and DMARC for *domain* with bounded timeouts.

    Args:
        domain: The email domain to inspect (e.g. ``"example.com"``).
        timeout: DNS query timeout in seconds (bounded between 1.0s and 10.0s).

    Returns:
        A :class:`DNSResult` with the observed status, explicit evidence state,
        and supporting routing details.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    is_valid_domain, clean_domain, domain_err = normalize_domain(domain)
    if not is_valid_domain:
        return DNSResult(
            status=DNSStatus.NO_RECORDS,
            state="unavailable",
            domain=domain,
            reason=domain_err,
            mx_status="not_checked",
            spf_status="not_checked",
            dmarc_status="not_checked",
            mx_hosts_resolve=False,
            checked_at=now_iso,
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
                    mx_status="no_record",
                    mx_hosts_resolve=False,
                    spf_status="no_record",
                    dmarc_status="no_record",
                    checked_at=now_iso,
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
        mx_records: list[dict[str, Any]] = []

        for r in sorted_answers:
            raw_host = str(r.exchange)
            pref = getattr(r, "preference", 0)
            is_valid_host, clean_host, host_err = validate_mx_hostname(raw_host)
            if not is_valid_host:
                invalid_mx_hosts.append(raw_host.rstrip("."))
                continue

            outcome, detail, ipv4_addrs, ipv6_addrs = _resolve_target_host(resolver, clean_host)
            if outcome == "resolvable":
                valid_mx_hosts.append(clean_host)
                mx_records.append({
                    "preference": pref,
                    "host": clean_host,
                    "ipv4": ipv4_addrs,
                    "ipv6": ipv6_addrs,
                })
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
            spf_status, spf_rec, spf_err = _check_spf(resolver, clean_domain)
            dmarc_status, dmarc_rec, dmarc_err = _check_dmarc(resolver, clean_domain)

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
                mx_status="found",
                mx_records=mx_records,
                mx_hosts_resolve=True,
                spf_status=spf_status,
                spf_record=spf_rec,
                dmarc_status=dmarc_status,
                dmarc_record=dmarc_rec,
                dns_error=None,
                checked_at=now_iso,
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
                mx_status="timeout",
                mx_hosts_resolve=False,
                dns_error=f"DNS query timed out resolving MX target host(s) ({', '.join(timeout_mx_hosts)})",
                checked_at=now_iso,
                reason=f"DNS query timed out resolving MX target host(s) ({', '.join(timeout_mx_hosts)}) – result is inconclusive.",
            )

        if servfail_mx_hosts:
            return DNSResult(
                status=DNSStatus.SERVFAIL,
                state="inconclusive",
                domain=clean_domain,
                invalid_mx_hosts=invalid_mx_hosts,
                unresolvable_mx_hosts=unresolvable_mx_hosts,
                mx_status="dns_error",
                mx_hosts_resolve=False,
                dns_error=f"Nameserver failure (SERVFAIL) resolving MX target host(s) ({', '.join(servfail_mx_hosts)})",
                checked_at=now_iso,
                reason=f"Nameserver failure (SERVFAIL) resolving MX target host(s) ({', '.join(servfail_mx_hosts)}) – result is inconclusive.",
            )

        if error_mx_hosts:
            return DNSResult(
                status=DNSStatus.ERROR,
                state="inconclusive",
                domain=clean_domain,
                invalid_mx_hosts=invalid_mx_hosts,
                unresolvable_mx_hosts=unresolvable_mx_hosts,
                mx_status="dns_error",
                mx_hosts_resolve=False,
                dns_error=f"Resolver error resolving MX target host(s) ({', '.join(error_mx_hosts)})",
                checked_at=now_iso,
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
            mx_status="no_record",
            mx_hosts_resolve=False,
            checked_at=now_iso,
            reason=f"Domain '{clean_domain}' publishes MX records, but all routing targets are invalid or unresolvable ({', '.join(all_unusable)}).",
        )

    except dns.resolver.NXDOMAIN:
        # Definitive domain nonexistence; RFC 5321 fallback does not apply
        return DNSResult(
            status=DNSStatus.NO_RECORDS,
            state="failed",
            domain=clean_domain,
            is_nxdomain=True,
            mx_status="nxdomain",
            mx_hosts_resolve=False,
            spf_status="no_record",
            dmarc_status="no_record",
            checked_at=now_iso,
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
            mx_status="dns_error",
            mx_hosts_resolve=False,
            dns_error=f"Nameserver failure or SERVFAIL for domain '{clean_domain}'",
            checked_at=now_iso,
            reason=f"DNS query failed due to nameserver failure or SERVFAIL for domain '{clean_domain}'; result is inconclusive.",
        )
    except (dns.exception.Timeout, dns.resolver.LifetimeTimeout):
        return DNSResult(
            status=DNSStatus.TIMEOUT,
            state="inconclusive",
            domain=clean_domain,
            mx_status="timeout",
            mx_hosts_resolve=False,
            dns_error=f"DNS query timed out for domain '{clean_domain}'",
            checked_at=now_iso,
            reason=f"DNS query timed out for domain '{clean_domain}' – result is inconclusive.",
        )
    except Exception as exc:  # noqa: BLE001
        return DNSResult(
            status=DNSStatus.ERROR,
            state="inconclusive",
            domain=clean_domain,
            mx_status="dns_error",
            mx_hosts_resolve=False,
            dns_error=str(exc),
            checked_at=now_iso,
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
                ipv4_list = [str(r).strip() for r in answers] if record_type == "A" else []
                ipv6_list = [str(r).strip() for r in answers] if record_type == "AAAA" else []
                if record_type == "A":
                    try:
                        aaaa_ans = resolver.resolve(clean_domain, "AAAA")
                        ipv6_list = [str(r).strip() for r in aaaa_ans]
                    except Exception:
                        pass
                spf_status, spf_rec, _ = _check_spf(resolver, clean_domain)
                dmarc_status, dmarc_rec, _ = _check_dmarc(resolver, clean_domain)
                return DNSResult(
                    status=DNSStatus.HAS_A,
                    state="passed",
                    domain=clean_domain,
                    mx_hosts=[clean_domain],
                    has_implicit_mx=True,
                    mx_status="no_record",
                    mx_records=[{
                        "preference": 0,
                        "host": clean_domain,
                        "ipv4": ipv4_list,
                        "ipv6": ipv6_list,
                    }],
                    mx_hosts_resolve=True,
                    spf_status=spf_status,
                    spf_record=spf_rec,
                    dmarc_status=dmarc_status,
                    dmarc_record=dmarc_rec,
                    dns_error=None,
                    checked_at=now_iso,
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
                mx_status="dns_error",
                mx_hosts_resolve=False,
                dns_error=f"Nameserver failure or SERVFAIL during fallback resolution for '{clean_domain}'",
                checked_at=now_iso,
                reason=f"DNS query failed due to nameserver failure or SERVFAIL during fallback resolution for '{clean_domain}'.",
            )
        except (dns.exception.Timeout, dns.resolver.LifetimeTimeout):
            return DNSResult(
                status=DNSStatus.TIMEOUT,
                state="inconclusive",
                domain=clean_domain,
                mx_status="timeout",
                mx_hosts_resolve=False,
                dns_error=f"DNS query timed out during fallback resolution for '{clean_domain}'",
                checked_at=now_iso,
                reason=f"DNS query timed out during fallback resolution for '{clean_domain}' – result is inconclusive.",
            )
        except Exception as exc:  # noqa: BLE001
            return DNSResult(
                status=DNSStatus.ERROR,
                state="inconclusive",
                domain=clean_domain,
                mx_status="dns_error",
                mx_hosts_resolve=False,
                dns_error=str(exc),
                checked_at=now_iso,
                reason=f"Unexpected DNS error during fallback resolution for '{clean_domain}': {exc}",
            )

    return DNSResult(
        status=DNSStatus.NO_RECORDS,
        state="failed",
        domain=clean_domain,
        is_nodata=True,
        mx_status="no_record",
        mx_hosts_resolve=False,
        spf_status="no_record",
        dmarc_status="no_record",
        checked_at=now_iso,
        reason=f"Domain '{clean_domain}' exists in DNS (NODATA on MX), but has no MX or fallback A/AAAA records. No mail routing destination exists.",
    )
