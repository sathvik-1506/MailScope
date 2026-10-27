"""
Classification service.

Combines evidence from syntax, DNS, and (optionally) SMTP checks into
a final verdict with an explanation of the evidence and its limitations.

=============================================================================
DECISION POLICY SPECIFICATION
=============================================================================
The classification engine supports exactly three primary classifications:
- LIKELY_DELIVERED ("Likely delivered")
- LIKELY_BOUNCE    ("Likely bounce")
- UNKNOWN          ("Unknown / Insufficient evidence")

Heuristic confidence percentages have been audited and completely removed.
Decisions are deterministic, explainable, and grounded in technical evidence.

CRITERIA FOR LIKELY_DELIVERED:
------------------------------
An address is classified as LIKELY_DELIVERED if and only if ALL of the following hold:
1. Syntax is RFC 5321/5322 compliant (SyntaxValidation.VALID).
2. Domain resolves in authoritative DNS and publishes usable mail routing (DNSValidation.CONFIGURED).
3. Active MX target or fallback A/AAAA record is identified.
4. Target mail server explicitly acknowledges the recipient probe with a 2xx status code
   during the SMTP RCPT TO handshake (SMTPProbeStatus.SUCCESS, MailboxExistence.CONFIRMED).
* Caution & Limitations: Envelope acceptance is strong technical evidence of mailbox existence,
  but catch-all configurations or post-handshake policy discards mean deliverability is high-confidence,
  not an unconditional guarantee.

CRITERIA FOR LIKELY_BOUNCE:
---------------------------
An address is classified as LIKELY_BOUNCE if ANY of the following definitive negative signals occurs:
1. Syntax Failure: Address violates RFC 5321/5322 syntax specifications (reason: INVALID_SYNTAX).
2. Non-existent Domain: Domain returns NXDOMAIN from authoritative DNS (reason: DOMAIN_NOT_FOUND).
3. No Mail Routing: Domain exists but publishes no MX and no fallback A/AAAA records, or publishes
   an explicit Null MX record (RFC 7505) (reason: NO_MAIL_ROUTING).
4. Explicit SMTP Rejection: Target mail server explicitly rejects recipient during SMTP handshake
   with a 5xx permanent failure code (550, 551, 552, 553, 554) (reason: MAILBOX_REJECTED).

CRITERIA FOR UNKNOWN / INSUFFICIENT EVIDENCE:
---------------------------------------------
An address is classified as UNKNOWN if the available evidence is inconclusive, incomplete, or restricted:
1. Valid syntax and configured MX records, but SMTP connection cannot connect due to hosting
   environment port 25 restrictions or network unreachability (reason: SMTP_UNAVAILABLE).
   * RULE: A network error or port 25 block must NEVER produce an invalid-email or bounce verdict.
2. Valid syntax and configured MX records, but SMTP probe timed out (reason: SMTP_TIMEOUT).
   * RULE: A timeout must NEVER produce an invalid-email or bounce verdict.
3. Temporary DNS failures (DNS_TIMEOUT, DNS_TEMPORARY_FAILURE).
4. Temporary SMTP failures (4xx greylisting, rate limits, deferred responses) (reason: AMBIGUOUS_EVIDENCE).
5. Valid syntax and configured MX records, but SMTP probing was not tested (reason: MAILBOX_UNCONFIRMED).
   * RULE: Valid syntax + configured MX records alone does NOT confirm mailbox existence.

Classification Rules:
---------------------
1. INVALID_SYNTAX (Verdict: LIKELY_BOUNCE)
   Address violates RFC 5321/5322 syntax specifications.
   DNS and SMTP checks are skipped.

2. CHECKS_NOT_ATTEMPTED (Verdict: UNKNOWN)
   Syntax is valid, but DNS resolution checks were not attempted or omitted.

3. CONTRADICTORY / AMBIGUOUS EVIDENCE (Verdict: UNKNOWN, Reason: AMBIGUOUS_EVIDENCE)
   Contradictory evidence across checks (e.g. DNS reports no domain or resolution
   failure, yet an external SMTP probe claims recipient acceptance or rejection).
   Inconclusive signals never produce an unjustified positive verdict.

4. DOMAIN_NOT_FOUND (Verdict: LIKELY_BOUNCE)
   Domain does not exist in authoritative DNS (NXDOMAIN).
   SMTP probing is skipped.

5. NO_MAIL_ROUTING (Verdict: LIKELY_BOUNCE)
   Domain exists in DNS but publishes no MX records and no fallback A/AAAA records
   (RFC 5321 § 5.1), or publishes an explicit Null MX record (RFC 7505).
   SMTP probing is skipped.

6. DNS_TIMEOUT (Verdict: UNKNOWN)
   DNS queries timed out waiting for authoritative nameservers.
   Temporary timeouts must never be classified as definitive bounces.

7. DNS_TEMPORARY_FAILURE (Verdict: UNKNOWN)
   DNS queries failed due to nameserver failure (SERVFAIL) or network errors.
   Temporary failures must never be classified as definitive bounces.

8. MAILBOX_UNCONFIRMED (Verdict: UNKNOWN)
   Domain exists and publishes valid mail routing (MX or implicit fallback),
   but SMTP verification was not enabled or was unattempted.
   Positive domain routing alone DOES NOT prove mailbox existence.

9. MAILBOX_ACCEPTED (Verdict: LIKELY_DELIVERED)
   Target mail server acknowledged recipient probe (2xx response to RCPT TO).
   Limitations must explicitly state that catch-all configurations and post-handshake
   discards mean envelope acceptance is not a guarantee of mailbox existence.

10. MAILBOX_REJECTED (Verdict: LIKELY_BOUNCE)
    Target mail server explicitly rejected recipient address (5xx permanent failure).

11. SMTP_TIMEOUT (Verdict: UNKNOWN)
    SMTP connection or response timed out.
    Timeouts must never be classified as definitive bounces.

12. SMTP_UNAVAILABLE (Verdict: UNKNOWN)
    SMTP server unreachable or outbound port 25 connection refused/blocked.
    Must never be classified as a definitive bounce.

13. AMBIGUOUS_EVIDENCE (Verdict: UNKNOWN)
    SMTP server issued temporary failure (e.g. 451 greylisting, rate-limiting)
    or unexpected response codes that cannot conclusively confirm deliverability.
=============================================================================
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from .syntax_checker import SyntaxResult
from .dns_checker import DNSResult, DNSStatus
from .smtp_checker import SMTPResult, SMTPStatus


class Verdict(str, Enum):
    LIKELY_DELIVERED = "likely_delivered"
    LIKELY_BOUNCE = "likely_bounce"
    UNKNOWN = "unknown"


class ReasonCode(str, Enum):
    INVALID_SYNTAX = "INVALID_SYNTAX"
    DOMAIN_NOT_FOUND = "DOMAIN_NOT_FOUND"
    NO_MAIL_ROUTING = "NO_MAIL_ROUTING"
    DNS_TIMEOUT = "DNS_TIMEOUT"
    DNS_TEMPORARY_FAILURE = "DNS_TEMPORARY_FAILURE"
    SMTP_TIMEOUT = "SMTP_TIMEOUT"
    SMTP_UNAVAILABLE = "SMTP_UNAVAILABLE"
    SMTP_INCONCLUSIVE = "AMBIGUOUS_EVIDENCE"
    AMBIGUOUS_EVIDENCE = "AMBIGUOUS_EVIDENCE"
    CHECKS_NOT_ATTEMPTED = "CHECKS_NOT_ATTEMPTED"
    MAILBOX_UNCONFIRMED = "MAILBOX_UNCONFIRMED"
    MAILBOX_ACCEPTED = "MAILBOX_ACCEPTED"
    MAILBOX_REJECTED = "MAILBOX_REJECTED"


class SyntaxValidation(str, Enum):
    VALID = "VALID"
    INVALID = "INVALID"


class DNSValidation(str, Enum):
    CONFIGURED = "CONFIGURED"
    NOT_CONFIGURED = "NOT_CONFIGURED"
    UNKNOWN = "UNKNOWN"


class SMTPProbeStatus(str, Enum):
    SUCCESS = "SUCCESS"
    UNAVAILABLE = "UNAVAILABLE"
    TIMEOUT = "TIMEOUT"
    REJECTED = "REJECTED"
    NOT_TESTED = "NOT_TESTED"


class MailboxExistence(str, Enum):
    CONFIRMED = "CONFIRMED"
    REJECTED = "REJECTED"
    UNCONFIRMED = "UNCONFIRMED"
    INVALID = "INVALID"
    UNKNOWN = "UNKNOWN"


@dataclass
class ClassificationResult:
    address: str
    verdict: Verdict
    reason_code: str
    explanation: str
    normalized_address: str | None = None
    syntax_validation: str = "VALID"
    dns_mx_validation: str = "CONFIGURED"
    smtp_probe: str = "NOT_TESTED"
    mailbox_existence: str = "UNCONFIRMED"
    syntax_evidence: dict[str, Any] = field(default_factory=dict)
    dns_evidence: dict[str, Any] = field(default_factory=dict)
    smtp_evidence: dict[str, Any] = field(default_factory=dict)
    checks_run: list[str] = field(default_factory=list)
    checks_skipped: list[str] = field(default_factory=list)
    evidence: list[str] = field(default_factory=list)
    limitations: list[str] = field(default_factory=list)
    analysed_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict[str, Any]:
        """Returns a JSON-serializable structured result.

        Confidence fields have been removed per correctness audit.
        """
        return {
            "address": self.address,
            "original_input": self.address,
            "normalized_address": self.normalized_address,
            "verdict": self.verdict.value if isinstance(self.verdict, Verdict) else str(self.verdict),
            "reason_code": self.reason_code,
            "explanation": self.explanation,
            "syntax_validation": self.syntax_validation,
            "dns_mx_validation": self.dns_mx_validation,
            "smtp_probe": self.smtp_probe,
            "mailbox_existence": self.mailbox_existence,
            "syntax_evidence": self.syntax_evidence,
            "dns_evidence": self.dns_evidence,
            "smtp_evidence": self.smtp_evidence,
            "checks_run": self.checks_run,
            "checks_skipped": self.checks_skipped,
            "evidence": self.evidence,
            "limitations": self.limitations,
            "analysed_at": self.analysed_at,
        }


def classify(
    syntax: SyntaxResult,
    dns: DNSResult | None = None,
    smtp: SMTPResult | None = None,
) -> ClassificationResult:
    """Produce a :class:`ClassificationResult` from available evidence according
    to the single documented decision policy.

    Args:
        syntax: Result from :func:`~services.syntax_checker.check_syntax`.
        dns:    Result from :func:`~services.dns_checker.check_dns`, or ``None``.
        smtp:   Result from :func:`~services.smtp_checker.check_smtp`, or ``None``.

    Returns:
        A :class:`ClassificationResult` with verdict, reason code, and explanation.
    """
    evidence: list[str] = []
    limitations: list[str] = []
    checks_run: list[str] = ["syntax"]
    checks_skipped: list[str] = []

    syntax_evidence: dict[str, Any] = {
        "valid": syntax.valid,
        "normalized": syntax.normalized,
        "reason": syntax.reason,
    }
    dns_evidence: dict[str, Any] = {}
    smtp_evidence: dict[str, Any] = {}

    # ------------------------------------------------------------------ #
    # Rule 1. Invalid Syntax                                             #
    # ------------------------------------------------------------------ #
    if not syntax.valid:
        evidence.append(f"Syntax invalid: {syntax.reason}")
        checks_skipped.extend(["dns", "smtp"])
        return ClassificationResult(
            address=syntax.original,
            normalized_address=None,
            verdict=Verdict.LIKELY_BOUNCE,
            reason_code=ReasonCode.INVALID_SYNTAX.value,
            explanation=f"Email address syntax violates RFC specifications: {syntax.reason}",
            syntax_validation=SyntaxValidation.INVALID.value,
            dns_mx_validation=DNSValidation.NOT_CONFIGURED.value,
            smtp_probe=SMTPProbeStatus.NOT_TESTED.value,
            mailbox_existence=MailboxExistence.INVALID.value,
            syntax_evidence=syntax_evidence,
            dns_evidence=dns_evidence,
            smtp_evidence=smtp_evidence,
            checks_run=checks_run,
            checks_skipped=checks_skipped,
            evidence=evidence,
            limitations=["Syntactically invalid addresses cannot be delivered."],
        )

    evidence.append(syntax.reason)

    # ------------------------------------------------------------------ #
    # Rule 2. Checks Not Attempted (DNS check was omitted or not run)     #
    # ------------------------------------------------------------------ #
    if dns is None:
        checks_skipped.extend(["dns", "smtp"])
        limitations.append("DNS check was not performed; deliverability cannot be determined.")
        return ClassificationResult(
            address=syntax.original,
            normalized_address=syntax.normalized,
            verdict=Verdict.UNKNOWN,
            reason_code=ReasonCode.CHECKS_NOT_ATTEMPTED.value,
            explanation="DNS check was not performed; domain resolution and routing were not attempted.",
            syntax_validation=SyntaxValidation.VALID.value,
            dns_mx_validation=DNSValidation.UNKNOWN.value,
            smtp_probe=SMTPProbeStatus.NOT_TESTED.value,
            mailbox_existence=MailboxExistence.UNKNOWN.value,
            syntax_evidence=syntax_evidence,
            dns_evidence=dns_evidence,
            smtp_evidence=smtp_evidence,
            checks_run=checks_run,
            checks_skipped=checks_skipped,
            evidence=evidence,
            limitations=limitations,
        )

    checks_run.append("dns")
    dns_evidence = {
        "status": dns.status.value if hasattr(dns.status, "value") else str(dns.status),
        "state": getattr(dns, "state", "passed" if dns.status in (DNSStatus.HAS_MX, DNSStatus.HAS_A) else "failed" if dns.status == DNSStatus.NO_RECORDS else "inconclusive"),
        "domain": dns.domain,
        "mx_hosts": dns.mx_hosts,
        "invalid_mx_hosts": getattr(dns, "invalid_mx_hosts", []),
        "unresolvable_mx_hosts": getattr(dns, "unresolvable_mx_hosts", []),
        "has_implicit_mx": getattr(dns, "has_implicit_mx", False),
        "is_nxdomain": getattr(dns, "is_nxdomain", False),
        "is_nodata": getattr(dns, "is_nodata", False),
        "is_null_mx": getattr(dns, "is_null_mx", False),
        "reason": dns.reason,
        "mx_status": getattr(dns, "mx_status", "found" if dns.status == DNSStatus.HAS_MX else "no_record"),
        "mx_records": getattr(dns, "mx_records", []),
        "mx_hosts_resolve": getattr(dns, "mx_hosts_resolve", bool(dns.mx_hosts)),
        "spf_status": getattr(dns, "spf_status", "not_checked"),
        "spf_record": getattr(dns, "spf_record", None),
        "dmarc_status": getattr(dns, "dmarc_status", "not_checked"),
        "dmarc_record": getattr(dns, "dmarc_record", None),
        "dns_error": getattr(dns, "dns_error", None),
        "checked_at": getattr(dns, "checked_at", ""),
    }

    # ------------------------------------------------------------------ #
    # Rule 3. Contradictory / Conflicting Evidence                       #
    # ------------------------------------------------------------------ #
    # If DNS indicates negative or inconclusive status, but an external
    # SMTP result reports affirmative acceptance or explicit rejection,
    # the evidence is contradictory and must not produce an unjustified verdict.
    has_dns_routing = dns.status in (DNSStatus.HAS_MX, DNSStatus.HAS_A)
    if not has_dns_routing and smtp is not None and smtp.status in (SMTPStatus.ACCEPTED, SMTPStatus.REJECTED):
        checks_run.append("smtp")
        smtp_evidence = {
            "status": smtp.status.value if hasattr(smtp.status, "value") else str(smtp.status),
            "smtp_code": smtp.smtp_code,
            "reason": smtp.reason,
        }
        evidence.append(f"DNS status: {dns.status.value}")
        evidence.append(f"SMTP status: {smtp.status.value}")
        limitations.append("Contradictory evidence: DNS routing records conflict with SMTP probe response.")
        return ClassificationResult(
            address=syntax.original,
            normalized_address=syntax.normalized,
            verdict=Verdict.UNKNOWN,
            reason_code=ReasonCode.AMBIGUOUS_EVIDENCE.value,
            explanation=f"Conflicting technical evidence: DNS reported '{dns.status.value}' but SMTP reported '{smtp.status.value}'.",
            syntax_validation=SyntaxValidation.VALID.value,
            dns_mx_validation=DNSValidation.UNKNOWN.value,
            smtp_probe=SMTPProbeStatus.SUCCESS.value if smtp.status == SMTPStatus.ACCEPTED else SMTPProbeStatus.REJECTED.value,
            mailbox_existence=MailboxExistence.UNKNOWN.value,
            syntax_evidence=syntax_evidence,
            dns_evidence=dns_evidence,
            smtp_evidence=smtp_evidence,
            checks_run=checks_run,
            checks_skipped=checks_skipped,
            evidence=evidence,
            limitations=limitations,
        )

    # ------------------------------------------------------------------ #
    # Rule 4 & 5. DNS NO_RECORDS (NXDOMAIN or Missing Mail Routing)       #
    # ------------------------------------------------------------------ #
    if dns.status == DNSStatus.NO_RECORDS:
        checks_skipped.append("smtp")
        evidence.append(f"DNS: {dns.reason}")
        if getattr(dns, "is_nxdomain", False):
            reason_code = ReasonCode.DOMAIN_NOT_FOUND.value
            explanation = f"Domain '{dns.domain}' does not exist in authoritative DNS (NXDOMAIN)."
            limitations.append("DNS propagation delays may cause recently registered domains to appear nonexistent.")
        elif getattr(dns, "is_null_mx", False):
            reason_code = ReasonCode.NO_MAIL_ROUTING.value
            explanation = f"Domain '{dns.domain}' publishes a Null MX record (RFC 7505) explicitly declaring it does not accept email."
            limitations.append("Domains publishing Null MX records reject all inbound email by design.")
        elif getattr(dns, "invalid_mx_hosts", None) or getattr(dns, "unresolvable_mx_hosts", None):
            reason_code = ReasonCode.NO_MAIL_ROUTING.value
            explanation = f"Domain '{dns.domain}' publishes MX records, but all routing targets are invalid or unresolvable."
            limitations.append("Mail transfer agents cannot route email to unresolvable or invalid destination hosts.")
        elif getattr(dns, "is_nodata", False):
            reason_code = ReasonCode.NO_MAIL_ROUTING.value
            explanation = f"Domain '{dns.domain}' exists in DNS (NODATA on MX), but has no MX or fallback A/AAAA records."
            limitations.append("Domains without mail routing targets cannot receive email under RFC 5321.")
        else:
            reason_code = ReasonCode.NO_MAIL_ROUTING.value
            explanation = f"No mail routing targets (MX or fallback A/AAAA) found for domain '{dns.domain}'."
            limitations.append("Domains without mail routing targets cannot receive email under RFC 5321.")

        return ClassificationResult(
            address=syntax.original,
            normalized_address=syntax.normalized,
            verdict=Verdict.LIKELY_BOUNCE,
            reason_code=reason_code,
            explanation=explanation,
            syntax_validation=SyntaxValidation.VALID.value,
            dns_mx_validation=DNSValidation.NOT_CONFIGURED.value,
            smtp_probe=SMTPProbeStatus.NOT_TESTED.value,
            mailbox_existence=MailboxExistence.INVALID.value,
            syntax_evidence=syntax_evidence,
            dns_evidence=dns_evidence,
            smtp_evidence=smtp_evidence,
            checks_run=checks_run,
            checks_skipped=checks_skipped,
            evidence=evidence,
            limitations=limitations,
        )

    # ------------------------------------------------------------------ #
    # Rule 6. DNS Timeout (Inconclusive)                                 #
    # ------------------------------------------------------------------ #
    if dns.status == DNSStatus.TIMEOUT:
        checks_skipped.append("smtp")
        evidence.append(f"DNS timeout: {dns.reason}")
        limitations.append("DNS query timed out; temporary DNS timeouts must never be treated as bounces.")
        return ClassificationResult(
            address=syntax.original,
            normalized_address=syntax.normalized,
            verdict=Verdict.UNKNOWN,
            reason_code=ReasonCode.DNS_TIMEOUT.value,
            explanation=f"DNS resolution timed out for domain '{dns.domain}': {dns.reason}",
            syntax_validation=SyntaxValidation.VALID.value,
            dns_mx_validation=DNSValidation.UNKNOWN.value,
            smtp_probe=SMTPProbeStatus.NOT_TESTED.value,
            mailbox_existence=MailboxExistence.UNKNOWN.value,
            syntax_evidence=syntax_evidence,
            dns_evidence=dns_evidence,
            smtp_evidence=smtp_evidence,
            checks_run=checks_run,
            checks_skipped=checks_skipped,
            evidence=evidence,
            limitations=limitations,
        )

    # ------------------------------------------------------------------ #
    # Rule 7. Temporary DNS Failure (SERVFAIL, ERROR)                    #
    # ------------------------------------------------------------------ #
    if dns.status in (DNSStatus.SERVFAIL, DNSStatus.ERROR):
        checks_skipped.append("smtp")
        evidence.append(f"DNS temporary failure: {dns.reason}")
        limitations.append("DNS resolver encountered a temporary error; verdict may change once DNS is reachable.")
        return ClassificationResult(
            address=syntax.original,
            normalized_address=syntax.normalized,
            verdict=Verdict.UNKNOWN,
            reason_code=ReasonCode.DNS_TEMPORARY_FAILURE.value,
            explanation=f"DNS resolution encountered a temporary failure: {dns.reason}",
            syntax_validation=SyntaxValidation.VALID.value,
            dns_mx_validation=DNSValidation.UNKNOWN.value,
            smtp_probe=SMTPProbeStatus.NOT_TESTED.value,
            mailbox_existence=MailboxExistence.UNKNOWN.value,
            syntax_evidence=syntax_evidence,
            dns_evidence=dns_evidence,
            smtp_evidence=smtp_evidence,
            checks_run=checks_run,
            checks_skipped=checks_skipped,
            evidence=evidence,
            limitations=limitations,
        )

    # DNS routing confirmed
    if dns.status == DNSStatus.HAS_MX:
        evidence.append(f"DNS: {dns.reason}")
    elif dns.status == DNSStatus.HAS_A:
        evidence.append(f"DNS (A record fallback): {dns.reason}")
        limitations.append("Domain lacks dedicated MX records; delivery relies on implicit MX fallback (RFC 5321 § 5.1).")

    # Record SPF / DMARC authentication findings in evidence ledger
    spf_status = getattr(dns, "spf_status", "not_checked")
    spf_record = getattr(dns, "spf_record", None)
    if spf_status == "found" and spf_record:
        evidence.append(f"SPF record published: {spf_record}")
    elif spf_status == "no_record":
        evidence.append("No SPF record published for domain.")
    elif spf_status == "invalid":
        evidence.append("Invalid SPF configuration (multiple SPF records published).")

    dmarc_status = getattr(dns, "dmarc_status", "not_checked")
    dmarc_record = getattr(dns, "dmarc_record", None)
    if dmarc_status == "found" and dmarc_record:
        evidence.append(f"DMARC policy published: {dmarc_record}")
    elif dmarc_status == "no_record":
        evidence.append("No DMARC policy published for domain (_dmarc).")
    elif dmarc_status == "invalid":
        evidence.append("Invalid DMARC configuration (multiple DMARC records published).")

    if spf_status == "found" or dmarc_status == "found":
        limitations.append(
            "Email authentication records (SPF, DMARC) provide domain-level sender validation and policy enforcement, but do not verify whether an individual mailbox exists."
        )

    # ------------------------------------------------------------------ #
    # Rule 8. Valid Domain, but SMTP Check Not Performed or Disabled     #
    # ------------------------------------------------------------------ #
    if smtp is None or smtp.status == SMTPStatus.DISABLED:
        checks_skipped.append("smtp")
        limitations.append(
            "Mailbox existence remains unconfirmed without direct SMTP probing. "
            "Positive domain-level evidence alone does not prove mailbox existence."
        )
        explanation = (
            f"Domain '{dns.domain}' exists and publishes valid MX records, but mailbox existence cannot be confirmed without SMTP probing."
            if dns.status == DNSStatus.HAS_MX
            else f"Domain '{dns.domain}' exists with fallback A/AAAA routing, but mailbox existence cannot be confirmed without SMTP probing."
        )
        return ClassificationResult(
            address=syntax.original,
            normalized_address=syntax.normalized,
            verdict=Verdict.UNKNOWN,
            reason_code=ReasonCode.MAILBOX_UNCONFIRMED.value,
            explanation=explanation,
            syntax_validation=SyntaxValidation.VALID.value,
            dns_mx_validation=DNSValidation.CONFIGURED.value,
            smtp_probe=SMTPProbeStatus.NOT_TESTED.value,
            mailbox_existence=MailboxExistence.UNCONFIRMED.value,
            syntax_evidence=syntax_evidence,
            dns_evidence=dns_evidence,
            smtp_evidence={"status": "disabled", "reason": "SMTP verification was not enabled."},
            checks_run=checks_run,
            checks_skipped=checks_skipped,
            evidence=evidence,
            limitations=limitations,
        )

    checks_run.append("smtp")
    smtp_evidence = {
        "status": smtp.status.value if hasattr(smtp.status, "value") else str(smtp.status),
        "smtp_code": smtp.smtp_code,
        "reason": smtp.reason,
    }

    # ------------------------------------------------------------------ #
    # Rule 9. SMTP Recipient Accepted                                    #
    # ------------------------------------------------------------------ #
    if smtp.status == SMTPStatus.ACCEPTED:
        evidence.append(f"SMTP accepted: {smtp.reason}")
        return ClassificationResult(
            address=syntax.original,
            normalized_address=syntax.normalized,
            verdict=Verdict.LIKELY_DELIVERED,
            reason_code=ReasonCode.MAILBOX_ACCEPTED.value,
            explanation=f"Target mail server accepted recipient probe: {smtp.reason}",
            syntax_validation=SyntaxValidation.VALID.value,
            dns_mx_validation=DNSValidation.CONFIGURED.value,
            smtp_probe=SMTPProbeStatus.SUCCESS.value,
            mailbox_existence=MailboxExistence.CONFIRMED.value,
            syntax_evidence=syntax_evidence,
            dns_evidence=dns_evidence,
            smtp_evidence=smtp_evidence,
            checks_run=checks_run,
            checks_skipped=checks_skipped,
            evidence=evidence,
            limitations=[
                "SMTP RCPT TO acceptance does not guarantee mailbox existence or delivery; "
                "catch-all servers accept all recipients, and mail servers may reject or drop messages post-handshake."
            ],
        )

    # ------------------------------------------------------------------ #
    # Rule 10. SMTP Recipient Rejected                                   #
    # ------------------------------------------------------------------ #
    if smtp.status == SMTPStatus.REJECTED:
        evidence.append(f"SMTP rejection: {smtp.reason}")
        return ClassificationResult(
            address=syntax.original,
            normalized_address=syntax.normalized,
            verdict=Verdict.LIKELY_BOUNCE,
            reason_code=ReasonCode.MAILBOX_REJECTED.value,
            explanation=f"Target mail server explicitly rejected recipient during SMTP probe: {smtp.reason}",
            syntax_validation=SyntaxValidation.VALID.value,
            dns_mx_validation=DNSValidation.CONFIGURED.value,
            smtp_probe=SMTPProbeStatus.REJECTED.value,
            mailbox_existence=MailboxExistence.REJECTED.value,
            syntax_evidence=syntax_evidence,
            dns_evidence=dns_evidence,
            smtp_evidence=smtp_evidence,
            checks_run=checks_run,
            checks_skipped=checks_skipped,
            evidence=evidence,
            limitations=["Some mail servers may incorrectly reject valid addresses due to strict anti-spam filters."],
        )

    # ------------------------------------------------------------------ #
    # Rule 11. SMTP Server Unavailable or Blocked (Egress port 25)      #
    # ------------------------------------------------------------------ #
    is_blocked = getattr(smtp, "is_blocked", False)
    is_unreachable = getattr(smtp, "is_network_unreachable", False)
    error_code = getattr(smtp, "error_code", "")
    reason_lower = smtp.reason.lower()

    if (
        is_blocked
        or is_unreachable
        or error_code in ("SMTP_BLOCKED", "SMTP_NETWORK_UNREACHABLE", "SMTP_UNAVAILABLE")
        or any(term in reason_lower for term in ("blocked", "unreachable", "refused", "no route to host"))
    ):
        evidence.append(f"SMTP unavailable: {smtp.reason}")
        limitations.append(
            "SMTP port 25 was unreachable or blocked by hosting environment policy (such as Render egress restrictions); mailbox existence could not be probed."
        )
        return ClassificationResult(
            address=syntax.original,
            normalized_address=syntax.normalized,
            verdict=Verdict.UNKNOWN,
            reason_code=ReasonCode.SMTP_UNAVAILABLE.value,
            explanation=(
                smtp.reason
                if smtp.reason.startswith("SMTP verification is unavailable")
                else (
                    "SMTP verification is unavailable from the current hosting environment. "
                    f"Syntax and DNS/MX checks were completed ({smtp.reason})."
                )
            ),
            syntax_validation=SyntaxValidation.VALID.value,
            dns_mx_validation=DNSValidation.CONFIGURED.value,
            smtp_probe=SMTPProbeStatus.UNAVAILABLE.value,
            mailbox_existence=MailboxExistence.UNCONFIRMED.value,
            syntax_evidence=syntax_evidence,
            dns_evidence=dns_evidence,
            smtp_evidence=smtp_evidence,
            checks_run=checks_run,
            checks_skipped=checks_skipped,
            evidence=evidence,
            limitations=limitations,
        )

    # ------------------------------------------------------------------ #
    # Rule 12. SMTP Connection Timeout                                   #
    # ------------------------------------------------------------------ #
    if getattr(smtp, "is_timeout", False) or error_code == "SMTP_TIMEOUT" or "timed out" in reason_lower or "timeout" in reason_lower:
        evidence.append(f"SMTP timeout: {smtp.reason}")
        limitations.append("SMTP connection timed out; temporary network timeouts must never be treated as bounces.")
        return ClassificationResult(
            address=syntax.original,
            normalized_address=syntax.normalized,
            verdict=Verdict.UNKNOWN,
            reason_code=ReasonCode.SMTP_TIMEOUT.value,
            explanation=f"SMTP connection or response timed out: {smtp.reason}",
            syntax_validation=SyntaxValidation.VALID.value,
            dns_mx_validation=DNSValidation.CONFIGURED.value,
            smtp_probe=SMTPProbeStatus.TIMEOUT.value,
            mailbox_existence=MailboxExistence.UNCONFIRMED.value,
            syntax_evidence=syntax_evidence,
            dns_evidence=dns_evidence,
            smtp_evidence=smtp_evidence,
            checks_run=checks_run,
            checks_skipped=checks_skipped,
            evidence=evidence,
            limitations=limitations,
        )

    # ------------------------------------------------------------------ #
    # Rule 13. Ambiguous / Inconclusive SMTP Probe (e.g. Greylisting)    #
    # ------------------------------------------------------------------ #
    evidence.append(f"SMTP ambiguous: {smtp.reason}")
    limitations.append("SMTP probe returned an inconclusive response (such as greylisting or rate-limiting); mailbox existence cannot be confirmed.")
    return ClassificationResult(
        address=syntax.original,
        normalized_address=syntax.normalized,
        verdict=Verdict.UNKNOWN,
        reason_code=ReasonCode.AMBIGUOUS_EVIDENCE.value,
        explanation=f"SMTP probe response was ambiguous or inconclusive: {smtp.reason}",
        syntax_validation=SyntaxValidation.VALID.value,
        dns_mx_validation=DNSValidation.CONFIGURED.value,
        smtp_probe=SMTPProbeStatus.TIMEOUT.value if getattr(smtp, "is_timeout", False) else (
            SMTPProbeStatus.UNAVAILABLE.value if getattr(smtp, "is_blocked", False) else SMTPProbeStatus.NOT_TESTED.value
        ),
        mailbox_existence=MailboxExistence.UNCONFIRMED.value,
        syntax_evidence=syntax_evidence,
        dns_evidence=dns_evidence,
        smtp_evidence=smtp_evidence,
        checks_run=checks_run,
        checks_skipped=checks_skipped,
        evidence=evidence,
        limitations=limitations,
    )
