"""
Classification service.

Combines evidence from syntax, DNS, and (optionally) SMTP checks into
a final verdict with an explanation of the evidence and its limitations.

Classifications
---------------
LIKELY_DELIVERED – strong evidence the address has valid routing and passed mailbox probing
LIKELY_BOUNCE    – strong evidence the address is invalid or unreachable
UNKNOWN          – insufficient evidence for a confident verdict (e.g. unconfirmed mailbox, timeout)

Reason Codes
------------
INVALID_SYNTAX         – Address violates RFC 5321/5322 syntax specifications
DOMAIN_NOT_FOUND       – Domain does not exist in authoritative DNS (NXDOMAIN)
NO_MAIL_ROUTING        – Domain lacks MX records and A/AAAA fallback records
DNS_TEMPORARY_FAILURE  – DNS resolution timed out or encountered server failure (SERVFAIL)
SMTP_TIMEOUT           – SMTP connection or response timed out
SMTP_UNAVAILABLE       – SMTP server unreachable or outbound port 25 blocked
SMTP_INCONCLUSIVE      – SMTP server issued temporary failure (greylisting) or ambiguous response
MAILBOX_UNCONFIRMED    – Domain and routing valid, but mailbox existence cannot be confirmed without SMTP
MAILBOX_ACCEPTED       – SMTP server accepted recipient probe (catch-all caveat applies)
MAILBOX_REJECTED       – SMTP server explicitly rejected recipient address (5xx)
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
    DNS_TEMPORARY_FAILURE = "DNS_TEMPORARY_FAILURE"
    SMTP_TIMEOUT = "SMTP_TIMEOUT"
    SMTP_UNAVAILABLE = "SMTP_UNAVAILABLE"
    SMTP_INCONCLUSIVE = "SMTP_INCONCLUSIVE"
    MAILBOX_UNCONFIRMED = "MAILBOX_UNCONFIRMED"
    MAILBOX_ACCEPTED = "MAILBOX_ACCEPTED"
    MAILBOX_REJECTED = "MAILBOX_REJECTED"


@dataclass
class ClassificationResult:
    address: str
    verdict: Verdict
    reason_code: str
    explanation: str
    confidence: float           # 0.0 – 1.0 (heuristic indicator, not statistical probability)
    normalized_address: str | None = None
    syntax_evidence: dict[str, Any] = field(default_factory=dict)
    dns_evidence: dict[str, Any] = field(default_factory=dict)
    smtp_evidence: dict[str, Any] = field(default_factory=dict)
    checks_run: list[str] = field(default_factory=list)
    checks_skipped: list[str] = field(default_factory=list)
    evidence: list[str] = field(default_factory=list)
    limitations: list[str] = field(default_factory=list)
    analysed_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict[str, Any]:
        """Returns a JSON-serializable structured result."""
        return {
            "address": self.address,
            "original_input": self.address,
            "normalized_address": self.normalized_address,
            "verdict": self.verdict.value if isinstance(self.verdict, Verdict) else str(self.verdict),
            "reason_code": self.reason_code,
            "explanation": self.explanation,
            "confidence": self.confidence,
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
    """Produce a :class:`ClassificationResult` from available evidence.

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
    # 1. Syntax Failure                                                    #
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
            confidence=0.95,
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
    # 2. DNS Evaluation                                                    #
    # ------------------------------------------------------------------ #
    if dns is None:
        checks_skipped.extend(["dns", "smtp"])
        limitations.append("DNS check was not performed.")
        return ClassificationResult(
            address=syntax.original,
            normalized_address=syntax.normalized,
            verdict=Verdict.UNKNOWN,
            reason_code=ReasonCode.DNS_TEMPORARY_FAILURE.value,
            explanation="DNS check was not performed.",
            confidence=0.0,
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
        "domain": dns.domain,
        "mx_hosts": dns.mx_hosts,
        "has_implicit_mx": getattr(dns, "has_implicit_mx", False),
        "is_nxdomain": getattr(dns, "is_nxdomain", False),
        "reason": dns.reason,
    }

    if dns.status == DNSStatus.NO_RECORDS:
        checks_skipped.append("smtp")
        evidence.append(f"DNS: {dns.reason}")
        if getattr(dns, "is_nxdomain", False):
            reason_code = ReasonCode.DOMAIN_NOT_FOUND.value
            explanation = f"Domain '{dns.domain}' does not exist (NXDOMAIN)."
        else:
            reason_code = ReasonCode.NO_MAIL_ROUTING.value
            explanation = f"No mail routing targets (MX or fallback A/AAAA) found for domain '{dns.domain}'."

        return ClassificationResult(
            address=syntax.original,
            normalized_address=syntax.normalized,
            verdict=Verdict.LIKELY_BOUNCE,
            reason_code=reason_code,
            explanation=explanation,
            confidence=0.90,
            syntax_evidence=syntax_evidence,
            dns_evidence=dns_evidence,
            smtp_evidence=smtp_evidence,
            checks_run=checks_run,
            checks_skipped=checks_skipped,
            evidence=evidence,
            limitations=["DNS propagation delays may cause false negatives."],
        )

    if dns.status in (DNSStatus.TIMEOUT, DNSStatus.SERVFAIL, DNSStatus.ERROR):
        checks_skipped.append("smtp")
        evidence.append(f"DNS inconclusive: {dns.reason}")
        limitations.append("DNS result was inconclusive; verdict may change once DNS is reachable.")
        return ClassificationResult(
            address=syntax.original,
            normalized_address=syntax.normalized,
            verdict=Verdict.UNKNOWN,
            reason_code=ReasonCode.DNS_TEMPORARY_FAILURE.value,
            explanation=f"DNS resolution was inconclusive: {dns.reason}",
            confidence=0.2,
            syntax_evidence=syntax_evidence,
            dns_evidence=dns_evidence,
            smtp_evidence=smtp_evidence,
            checks_run=checks_run,
            checks_skipped=checks_skipped,
            evidence=evidence,
            limitations=limitations,
        )

    if dns.status == DNSStatus.HAS_MX:
        evidence.append(f"DNS: {dns.reason}")
    elif dns.status == DNSStatus.HAS_A:
        evidence.append(f"DNS (A record fallback): {dns.reason}")
        limitations.append("Domain lacks MX records; delivery behaviour is uncertain.")

    # ------------------------------------------------------------------ #
    # 3. SMTP Evaluation                                                   #
    # ------------------------------------------------------------------ #
    if smtp is None or smtp.status == SMTPStatus.DISABLED:
        checks_skipped.append("smtp")
        limitations.append(
            "Mailbox existence cannot be verified without SMTP probing. "
            "The address domain exists but the specific mailbox is unconfirmed."
        )
        confidence = 0.65 if dns.status == DNSStatus.HAS_MX else 0.45
        return ClassificationResult(
            address=syntax.original,
            normalized_address=syntax.normalized,
            verdict=Verdict.UNKNOWN,
            reason_code=ReasonCode.MAILBOX_UNCONFIRMED.value,
            explanation="Domain exists and publishes valid mail routing, but mailbox existence cannot be confirmed without SMTP probing.",
            confidence=confidence,
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

    if smtp.status == SMTPStatus.ACCEPTED:
        evidence.append(f"SMTP: {smtp.reason}")
        return ClassificationResult(
            address=syntax.original,
            normalized_address=syntax.normalized,
            verdict=Verdict.LIKELY_DELIVERED,
            reason_code=ReasonCode.MAILBOX_ACCEPTED.value,
            explanation=f"Target mail server accepted recipient probe: {smtp.reason}",
            confidence=0.85,
            syntax_evidence=syntax_evidence,
            dns_evidence=dns_evidence,
            smtp_evidence=smtp_evidence,
            checks_run=checks_run,
            checks_skipped=checks_skipped,
            evidence=evidence,
            limitations=[
                "SMTP RCPT TO acceptance does not guarantee delivery; "
                "some servers accept all addresses (catch-all)."
            ],
        )

    if smtp.status == SMTPStatus.REJECTED:
        evidence.append(f"SMTP rejection: {smtp.reason}")
        return ClassificationResult(
            address=syntax.original,
            normalized_address=syntax.normalized,
            verdict=Verdict.LIKELY_BOUNCE,
            reason_code=ReasonCode.MAILBOX_REJECTED.value,
            explanation=f"Target mail server explicitly rejected recipient: {smtp.reason}",
            confidence=0.85,
            syntax_evidence=syntax_evidence,
            dns_evidence=dns_evidence,
            smtp_evidence=smtp_evidence,
            checks_run=checks_run,
            checks_skipped=checks_skipped,
            evidence=evidence,
            limitations=["Some servers incorrectly reject valid addresses."],
        )

    # INCONCLUSIVE SMTP (timeout, blocked port 25, greylisted, or ambiguous code)
    evidence.append(f"SMTP inconclusive: {smtp.reason}")
    if getattr(smtp, "is_timeout", False) or "timeout" in smtp.reason.lower():
        reason_code = ReasonCode.SMTP_TIMEOUT.value
        explanation = f"SMTP connection or response timed out: {smtp.reason}"
        limitations.append("SMTP connection timed out; mailbox existence remains unconfirmed.")
    elif getattr(smtp, "is_blocked", False) or "blocked" in smtp.reason.lower() or "connection" in smtp.reason.lower():
        reason_code = ReasonCode.SMTP_UNAVAILABLE.value
        explanation = f"SMTP connection was blocked or refused: {smtp.reason}"
        limitations.append("SMTP port 25 was unreachable or blocked by policy; mailbox existence is unconfirmed.")
    else:
        reason_code = ReasonCode.SMTP_INCONCLUSIVE.value
        explanation = f"SMTP probe response was inconclusive: {smtp.reason}"
        limitations.append("SMTP probe was blocked or timed out; mailbox existence is unconfirmed.")

    return ClassificationResult(
        address=syntax.original,
        normalized_address=syntax.normalized,
        verdict=Verdict.UNKNOWN,
        reason_code=reason_code,
        explanation=explanation,
        confidence=0.4,
        syntax_evidence=syntax_evidence,
        dns_evidence=dns_evidence,
        smtp_evidence=smtp_evidence,
        checks_run=checks_run,
        checks_skipped=checks_skipped,
        evidence=evidence,
        limitations=limitations,
    )
