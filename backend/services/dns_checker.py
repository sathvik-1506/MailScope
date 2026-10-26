"""
DNS-based deliverability check service.

Queries MX records for a domain and falls back to A/AAAA records when
no MX records are published (RFC 5321 § 5.1 implicit MX fallback).
All timeouts and resolver errors are treated as inconclusive rather
than definitive bounce failures.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

import dns.resolver
import dns.exception


class DNSStatus(str, Enum):
    HAS_MX = "has_mx"          # at least one valid MX record found
    HAS_A = "has_a"            # no MX but A/AAAA record exists (implicit MX fallback)
    NO_RECORDS = "no_records"  # NXDOMAIN, Null MX (RFC 7505), or no routing targets
    TIMEOUT = "timeout"        # resolver timed out – inconclusive
    SERVFAIL = "servfail"      # nameserver failure / SERVFAIL – inconclusive
    ERROR = "error"            # unexpected resolver or network error


@dataclass(frozen=True)
class DNSResult:
    status: DNSStatus
    domain: str
    mx_hosts: list[str] = field(default_factory=list)
    has_implicit_mx: bool = False
    is_nxdomain: bool = False
    is_null_mx: bool = False
    reason: str = ""


def check_dns(domain: str, timeout: float = 5.0) -> DNSResult:
    """Query MX (and fallback A/AAAA) records for *domain*.

    Args:
        domain: The email domain to inspect (e.g. ``"example.com"``).
        timeout: DNS query timeout in seconds.

    Returns:
        A :class:`DNSResult` with the observed status and supporting evidence.
    """
    clean_domain = domain.strip().lower()
    if not clean_domain:
        return DNSResult(
            status=DNSStatus.NO_RECORDS,
            domain=domain,
            reason="Domain name is empty.",
        )

    resolver = dns.resolver.Resolver()
    resolver.lifetime = timeout
    resolver.timeout = timeout

    # 1. Query MX records
    try:
        answers = resolver.resolve(clean_domain, "MX")
        # Check for Null MX (RFC 7505: single MX with exchange '.' indicates domain rejects all mail)
        for r in answers:
            exchange_str = str(r.exchange).rstrip(".")
            if exchange_str == "" or exchange_str == ".":
                return DNSResult(
                    status=DNSStatus.NO_RECORDS,
                    domain=clean_domain,
                    is_null_mx=True,
                    reason=f"Domain '{clean_domain}' publishes a Null MX record (RFC 7505) explicitly rejecting all email.",
                )

        # Sort MX records by preference / priority (lowest preference number first)
        sorted_answers = sorted(answers, key=lambda rec: getattr(rec, "preference", 0))
        mx_hosts = [str(r.exchange).rstrip(".") for r in sorted_answers if str(r.exchange).rstrip(".")]

        if mx_hosts:
            return DNSResult(
                status=DNSStatus.HAS_MX,
                domain=clean_domain,
                mx_hosts=mx_hosts,
                reason=f"Found {len(mx_hosts)} MX record(s): {', '.join(mx_hosts)}",
            )
        # If answers was somehow empty, fall through to fallback check
    except dns.resolver.NXDOMAIN:
        return DNSResult(
            status=DNSStatus.NO_RECORDS,
            domain=clean_domain,
            is_nxdomain=True,
            reason=f"Domain '{clean_domain}' does not exist (NXDOMAIN).",
        )
    except dns.resolver.NoAnswer:
        # Domain exists but has no MX records; fall through to implicit MX check
        pass
    except dns.resolver.NoNameservers:
        return DNSResult(
            status=DNSStatus.SERVFAIL,
            domain=clean_domain,
            reason="DNS query failed due to nameserver failure or SERVFAIL; result is inconclusive.",
        )
    except (dns.exception.Timeout, dns.resolver.LifetimeTimeout):
        return DNSResult(
            status=DNSStatus.TIMEOUT,
            domain=clean_domain,
            reason="DNS query timed out – result is inconclusive.",
        )
    except Exception as exc:  # noqa: BLE001
        return DNSResult(
            status=DNSStatus.ERROR,
            domain=clean_domain,
            reason=f"DNS query error: {exc}",
        )

    # 2. RFC 5321 § 5.1 Implicit MX Fallback (A / AAAA)
    # If no MX records are published, an A or AAAA record acts as an implicit MX pointing to that host.
    for record_type in ("A", "AAAA"):
        try:
            resolver.resolve(clean_domain, record_type)
            return DNSResult(
                status=DNSStatus.HAS_A,
                domain=clean_domain,
                mx_hosts=[clean_domain],
                has_implicit_mx=True,
                reason=(
                    f"No MX records found, but domain has {record_type} records. "
                    "Implicit MX fallback (RFC 5321 § 5.1) may accept direct delivery."
                ),
            )
        except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
            continue
        except dns.resolver.NoNameservers:
            return DNSResult(
                status=DNSStatus.SERVFAIL,
                domain=clean_domain,
                reason="DNS query failed due to nameserver failure or SERVFAIL during fallback resolution.",
            )
        except (dns.exception.Timeout, dns.resolver.LifetimeTimeout):
            return DNSResult(
                status=DNSStatus.TIMEOUT,
                domain=clean_domain,
                reason="DNS query timed out during fallback resolution – result is inconclusive.",
            )
        except Exception as exc:  # noqa: BLE001
            return DNSResult(
                status=DNSStatus.ERROR,
                domain=clean_domain,
                reason=f"Unexpected DNS error during fallback resolution: {exc}",
            )

    return DNSResult(
        status=DNSStatus.NO_RECORDS,
        domain=clean_domain,
        reason=f"No MX or fallback A/AAAA records found for domain '{clean_domain}'. No mail routing destination exists.",
    )
