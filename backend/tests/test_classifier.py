"""
Comprehensive unit tests for the classifier service and decision policy.

Verifies:
- All decision policy rules via table-driven testing.
- Absence of heuristic confidence fields from serialization.
- Temporary DNS/SMTP errors return UNKNOWN and never bounce.
- SMTP acceptance includes catch-all and delivery limitations.
- Positive domain routing alone returns UNKNOWN (does not prove mailbox existence).
- Missing MX records follow RFC fallback rules.
- Contradictory evidence returns UNKNOWN (AMBIGUOUS_EVIDENCE).
- Consistency across verdict, reason code, and explanation.
"""

from typing import NamedTuple
import pytest

from backend.services.syntax_checker import SyntaxResult
from backend.services.dns_checker import DNSResult, DNSStatus
from backend.services.smtp_checker import SMTPResult, SMTPStatus
from backend.services.classifier import classify, Verdict, ReasonCode, ClassificationResult


def _valid_syntax(address: str = "user@example.com") -> SyntaxResult:
    return SyntaxResult(
        valid=True,
        normalized=address,
        original=address,
        reason="Address satisfies RFC 5321/5322 syntax specifications.",
        local_part="user",
        domain="example.com",
    )


def _invalid_syntax(address: str = "bad@@syntax..com") -> SyntaxResult:
    return SyntaxResult(
        valid=False,
        normalized=None,
        original=address,
        reason="Address contains redundant @ symbol and consecutive dots.",
    )


def _mx_dns(domain: str = "example.com") -> DNSResult:
    return DNSResult(
        status=DNSStatus.HAS_MX,
        domain=domain,
        mx_hosts=["mail.example.com"],
        reason="Found 1 MX record: mail.example.com",
    )


def _implicit_mx_dns(domain: str = "example.com") -> DNSResult:
    return DNSResult(
        status=DNSStatus.HAS_A,
        domain=domain,
        mx_hosts=[domain],
        has_implicit_mx=True,
        reason="No MX records found; fallback A/AAAA record provides implicit MX.",
    )


def _null_mx_dns(domain: str = "nullmx.example") -> DNSResult:
    return DNSResult(
        status=DNSStatus.NO_RECORDS,
        domain=domain,
        is_null_mx=True,
        reason="Domain publishes Null MX record (RFC 7505).",
    )


def _nxdomain_dns(domain: str = "nodomain.invalid") -> DNSResult:
    return DNSResult(
        status=DNSStatus.NO_RECORDS,
        domain=domain,
        is_nxdomain=True,
        reason="Domain does not exist (NXDOMAIN).",
    )


def _no_routing_dns(domain: str = "norouting.example") -> DNSResult:
    return DNSResult(
        status=DNSStatus.NO_RECORDS,
        domain=domain,
        is_nxdomain=False,
        reason="No MX or A records found.",
    )


def _timeout_dns(domain: str = "example.com") -> DNSResult:
    return DNSResult(
        status=DNSStatus.TIMEOUT,
        domain=domain,
        reason="Nameserver query timed out after 5.0s.",
    )


def _servfail_dns(domain: str = "example.com") -> DNSResult:
    return DNSResult(
        status=DNSStatus.SERVFAIL,
        domain=domain,
        reason="Nameserver returned SERVFAIL.",
    )


def _error_dns(domain: str = "example.com") -> DNSResult:
    return DNSResult(
        status=DNSStatus.ERROR,
        domain=domain,
        reason="Unexpected socket error communicating with resolver.",
    )


class RuleTestCase(NamedTuple):
    name: str
    syntax: SyntaxResult
    dns: DNSResult | None
    smtp: SMTPResult | None
    expected_verdict: Verdict
    expected_reason_code: str


DECISION_POLICY_TABLE = [
    # Rule 1: Invalid syntax
    RuleTestCase(
        name="Rule 1: Invalid syntax -> LIKELY_BOUNCE (INVALID_SYNTAX)",
        syntax=_invalid_syntax(),
        dns=None,
        smtp=None,
        expected_verdict=Verdict.LIKELY_BOUNCE,
        expected_reason_code=ReasonCode.INVALID_SYNTAX.value,
    ),
    # Rule 2: Checks not attempted (DNS omitted)
    RuleTestCase(
        name="Rule 2: Checks not attempted -> UNKNOWN (CHECKS_NOT_ATTEMPTED)",
        syntax=_valid_syntax(),
        dns=None,
        smtp=None,
        expected_verdict=Verdict.UNKNOWN,
        expected_reason_code=ReasonCode.CHECKS_NOT_ATTEMPTED.value,
    ),
    # Rule 3: Contradictory evidence (DNS failure but SMTP accepted)
    RuleTestCase(
        name="Rule 3a: Contradictory evidence (NXDOMAIN but SMTP accepted) -> UNKNOWN (AMBIGUOUS_EVIDENCE)",
        syntax=_valid_syntax(),
        dns=_nxdomain_dns(),
        smtp=SMTPResult(status=SMTPStatus.ACCEPTED, address="user@example.com", smtp_code=250, reason="OK"),
        expected_verdict=Verdict.UNKNOWN,
        expected_reason_code=ReasonCode.AMBIGUOUS_EVIDENCE.value,
    ),
    RuleTestCase(
        name="Rule 3b: Contradictory evidence (DNS Timeout but SMTP accepted) -> UNKNOWN (AMBIGUOUS_EVIDENCE)",
        syntax=_valid_syntax(),
        dns=_timeout_dns(),
        smtp=SMTPResult(status=SMTPStatus.ACCEPTED, address="user@example.com", smtp_code=250, reason="OK"),
        expected_verdict=Verdict.UNKNOWN,
        expected_reason_code=ReasonCode.AMBIGUOUS_EVIDENCE.value,
    ),
    RuleTestCase(
        name="Rule 3c: Contradictory evidence (DNS SERVFAIL but SMTP rejected) -> UNKNOWN (AMBIGUOUS_EVIDENCE)",
        syntax=_valid_syntax(),
        dns=_servfail_dns(),
        smtp=SMTPResult(status=SMTPStatus.REJECTED, address="user@example.com", smtp_code=550, reason="550 No such user"),
        expected_verdict=Verdict.UNKNOWN,
        expected_reason_code=ReasonCode.AMBIGUOUS_EVIDENCE.value,
    ),
    # Rule 4: Definitive domain nonexistence (NXDOMAIN)
    RuleTestCase(
        name="Rule 4: Definitive domain nonexistence -> LIKELY_BOUNCE (DOMAIN_NOT_FOUND)",
        syntax=_valid_syntax(),
        dns=_nxdomain_dns(),
        smtp=None,
        expected_verdict=Verdict.LIKELY_BOUNCE,
        expected_reason_code=ReasonCode.DOMAIN_NOT_FOUND.value,
    ),
    # Rule 5: Missing mail routing (Null MX or No MX/A/AAAA)
    RuleTestCase(
        name="Rule 5a: Null MX (RFC 7505) -> LIKELY_BOUNCE (NO_MAIL_ROUTING)",
        syntax=_valid_syntax(),
        dns=_null_mx_dns(),
        smtp=None,
        expected_verdict=Verdict.LIKELY_BOUNCE,
        expected_reason_code=ReasonCode.NO_MAIL_ROUTING.value,
    ),
    RuleTestCase(
        name="Rule 5b: Missing MX and A/AAAA -> LIKELY_BOUNCE (NO_MAIL_ROUTING)",
        syntax=_valid_syntax(),
        dns=_no_routing_dns(),
        smtp=None,
        expected_verdict=Verdict.LIKELY_BOUNCE,
        expected_reason_code=ReasonCode.NO_MAIL_ROUTING.value,
    ),
    # Rule 6: DNS Timeout
    RuleTestCase(
        name="Rule 6: DNS Timeout -> UNKNOWN (DNS_TIMEOUT)",
        syntax=_valid_syntax(),
        dns=_timeout_dns(),
        smtp=None,
        expected_verdict=Verdict.UNKNOWN,
        expected_reason_code=ReasonCode.DNS_TIMEOUT.value,
    ),
    # Rule 7: Temporary DNS failure (SERVFAIL / ERROR)
    RuleTestCase(
        name="Rule 7a: DNS SERVFAIL -> UNKNOWN (DNS_TEMPORARY_FAILURE)",
        syntax=_valid_syntax(),
        dns=_servfail_dns(),
        smtp=None,
        expected_verdict=Verdict.UNKNOWN,
        expected_reason_code=ReasonCode.DNS_TEMPORARY_FAILURE.value,
    ),
    RuleTestCase(
        name="Rule 7b: DNS resolver error -> UNKNOWN (DNS_TEMPORARY_FAILURE)",
        syntax=_valid_syntax(),
        dns=_error_dns(),
        smtp=None,
        expected_verdict=Verdict.UNKNOWN,
        expected_reason_code=ReasonCode.DNS_TEMPORARY_FAILURE.value,
    ),
    # Rule 8: Valid domain with routing, SMTP disabled or None
    RuleTestCase(
        name="Rule 8a: Valid MX, SMTP None -> UNKNOWN (MAILBOX_UNCONFIRMED)",
        syntax=_valid_syntax(),
        dns=_mx_dns(),
        smtp=None,
        expected_verdict=Verdict.UNKNOWN,
        expected_reason_code=ReasonCode.MAILBOX_UNCONFIRMED.value,
    ),
    RuleTestCase(
        name="Rule 8b: Valid MX, SMTP Disabled -> UNKNOWN (MAILBOX_UNCONFIRMED)",
        syntax=_valid_syntax(),
        dns=_mx_dns(),
        smtp=SMTPResult(status=SMTPStatus.DISABLED, address="user@example.com", reason="SMTP disabled"),
        expected_verdict=Verdict.UNKNOWN,
        expected_reason_code=ReasonCode.MAILBOX_UNCONFIRMED.value,
    ),
    RuleTestCase(
        name="Rule 8c: Implicit MX (A record fallback), SMTP Disabled -> UNKNOWN (MAILBOX_UNCONFIRMED)",
        syntax=_valid_syntax(),
        dns=_implicit_mx_dns(),
        smtp=SMTPResult(status=SMTPStatus.DISABLED, address="user@example.com", reason="SMTP disabled"),
        expected_verdict=Verdict.UNKNOWN,
        expected_reason_code=ReasonCode.MAILBOX_UNCONFIRMED.value,
    ),
    # Rule 9: SMTP Recipient Accepted
    RuleTestCase(
        name="Rule 9: SMTP Accepted -> LIKELY_DELIVERED (MAILBOX_ACCEPTED)",
        syntax=_valid_syntax(),
        dns=_mx_dns(),
        smtp=SMTPResult(status=SMTPStatus.ACCEPTED, address="user@example.com", smtp_code=250, reason="250 2.1.5 Recipient OK"),
        expected_verdict=Verdict.LIKELY_DELIVERED,
        expected_reason_code=ReasonCode.MAILBOX_ACCEPTED.value,
    ),
    # Rule 10: SMTP Recipient Rejected
    RuleTestCase(
        name="Rule 10: SMTP Rejected -> LIKELY_BOUNCE (MAILBOX_REJECTED)",
        syntax=_valid_syntax(),
        dns=_mx_dns(),
        smtp=SMTPResult(status=SMTPStatus.REJECTED, address="user@example.com", smtp_code=550, reason="550 5.1.1 User unknown"),
        expected_verdict=Verdict.LIKELY_BOUNCE,
        expected_reason_code=ReasonCode.MAILBOX_REJECTED.value,
    ),
    # Rule 11: SMTP Connection Timeout
    RuleTestCase(
        name="Rule 11a: SMTP Timeout flag -> UNKNOWN (SMTP_TIMEOUT)",
        syntax=_valid_syntax(),
        dns=_mx_dns(),
        smtp=SMTPResult(status=SMTPStatus.INCONCLUSIVE, address="user@example.com", is_timeout=True, reason="Timed out"),
        expected_verdict=Verdict.UNKNOWN,
        expected_reason_code=ReasonCode.SMTP_TIMEOUT.value,
    ),
    RuleTestCase(
        name="Rule 11b: SMTP Timeout in reason text -> UNKNOWN (SMTP_TIMEOUT)",
        syntax=_valid_syntax(),
        dns=_mx_dns(),
        smtp=SMTPResult(status=SMTPStatus.INCONCLUSIVE, address="user@example.com", reason="Connection to host:25 timed out"),
        expected_verdict=Verdict.UNKNOWN,
        expected_reason_code=ReasonCode.SMTP_TIMEOUT.value,
    ),
    # Rule 12: SMTP Server Unavailable / Blocked
    RuleTestCase(
        name="Rule 12a: SMTP Blocked flag -> UNKNOWN (SMTP_UNAVAILABLE)",
        syntax=_valid_syntax(),
        dns=_mx_dns(),
        smtp=SMTPResult(status=SMTPStatus.INCONCLUSIVE, address="user@example.com", is_blocked=True, reason="Port 25 blocked"),
        expected_verdict=Verdict.UNKNOWN,
        expected_reason_code=ReasonCode.SMTP_UNAVAILABLE.value,
    ),
    RuleTestCase(
        name="Rule 12b: SMTP Connection Refused -> UNKNOWN (SMTP_UNAVAILABLE)",
        syntax=_valid_syntax(),
        dns=_mx_dns(),
        smtp=SMTPResult(status=SMTPStatus.INCONCLUSIVE, address="user@example.com", reason="Connection refused on port 25"),
        expected_verdict=Verdict.UNKNOWN,
        expected_reason_code=ReasonCode.SMTP_UNAVAILABLE.value,
    ),
    # Rule 13: Ambiguous / Inconclusive SMTP Probe (greylisting 451)
    RuleTestCase(
        name="Rule 13: SMTP Greylisting 451 -> UNKNOWN (AMBIGUOUS_EVIDENCE)",
        syntax=_valid_syntax(),
        dns=_mx_dns(),
        smtp=SMTPResult(status=SMTPStatus.INCONCLUSIVE, address="user@example.com", smtp_code=451, reason="451 4.7.1 Greylisting in action"),
        expected_verdict=Verdict.UNKNOWN,
        expected_reason_code=ReasonCode.AMBIGUOUS_EVIDENCE.value,
    ),
]


class TestTableDrivenDecisionPolicy:
    @pytest.mark.parametrize("case", DECISION_POLICY_TABLE, ids=[c.name for c in DECISION_POLICY_TABLE])
    def test_decision_policy_rule(self, case: RuleTestCase) -> None:
        result = classify(case.syntax, dns=case.dns, smtp=case.smtp)
        assert result.verdict == case.expected_verdict, (
            f"Expected verdict {case.expected_verdict.value}, got {result.verdict.value} for {case.name}"
        )
        assert result.reason_code == case.expected_reason_code, (
            f"Expected reason code {case.expected_reason_code}, got {result.reason_code} for {case.name}"
        )


class TestConfidenceFieldAudit:
    """Verifies that heuristic confidence fields (0.65, 0.85, 0.95, etc.) are
    strictly absent from the ClassificationResult model and serialized API dictionaries.
    """

    def test_confidence_attribute_does_not_exist_on_result(self) -> None:
        result = classify(_valid_syntax(), dns=_mx_dns())
        assert not hasattr(result, "confidence")

    def test_confidence_key_absent_from_to_dict(self) -> None:
        result = classify(_valid_syntax(), dns=_mx_dns())
        serialized = result.to_dict()
        assert "confidence" not in serialized

    def test_confidence_absent_across_all_verdicts(self) -> None:
        results = [
            classify(_invalid_syntax()),
            classify(_valid_syntax(), dns=_nxdomain_dns()),
            classify(_valid_syntax(), dns=_timeout_dns()),
            classify(_valid_syntax(), dns=_mx_dns()),
            classify(_valid_syntax(), dns=_mx_dns(), smtp=SMTPResult(status=SMTPStatus.ACCEPTED, address="user@example.com")),
            classify(_valid_syntax(), dns=_mx_dns(), smtp=SMTPResult(status=SMTPStatus.REJECTED, address="user@example.com")),
        ]
        for res in results:
            d = res.to_dict()
            assert "confidence" not in d, f"Found uncalibrated confidence key in result for {res.reason_code}"


class TestTemporaryErrorsNeverBounce:
    """Proves that temporary or inconclusive errors are never converted into bounces."""

    def test_dns_timeout_returns_unknown_never_bounce(self) -> None:
        result = classify(_valid_syntax(), dns=_timeout_dns())
        assert result.verdict == Verdict.UNKNOWN
        assert result.verdict != Verdict.LIKELY_BOUNCE
        assert result.reason_code == ReasonCode.DNS_TIMEOUT.value

    def test_dns_servfail_returns_unknown_never_bounce(self) -> None:
        result = classify(_valid_syntax(), dns=_servfail_dns())
        assert result.verdict == Verdict.UNKNOWN
        assert result.verdict != Verdict.LIKELY_BOUNCE
        assert result.reason_code == ReasonCode.DNS_TEMPORARY_FAILURE.value

    def test_smtp_timeout_returns_unknown_never_bounce(self) -> None:
        smtp = SMTPResult(status=SMTPStatus.INCONCLUSIVE, address="user@example.com", is_timeout=True, reason="Timed out")
        result = classify(_valid_syntax(), dns=_mx_dns(), smtp=smtp)
        assert result.verdict == Verdict.UNKNOWN
        assert result.verdict != Verdict.LIKELY_BOUNCE
        assert result.reason_code == ReasonCode.SMTP_TIMEOUT.value

    def test_smtp_unavailable_returns_unknown_never_bounce(self) -> None:
        smtp = SMTPResult(status=SMTPStatus.INCONCLUSIVE, address="user@example.com", is_blocked=True, reason="Port 25 blocked")
        result = classify(_valid_syntax(), dns=_mx_dns(), smtp=smtp)
        assert result.verdict == Verdict.UNKNOWN
        assert result.verdict != Verdict.LIKELY_BOUNCE
        assert result.reason_code == ReasonCode.SMTP_UNAVAILABLE.value

    def test_smtp_greylisting_returns_unknown_never_bounce(self) -> None:
        smtp = SMTPResult(status=SMTPStatus.INCONCLUSIVE, address="user@example.com", smtp_code=451, reason="Greylisted")
        result = classify(_valid_syntax(), dns=_mx_dns(), smtp=smtp)
        assert result.verdict == Verdict.UNKNOWN
        assert result.verdict != Verdict.LIKELY_BOUNCE
        assert result.reason_code == ReasonCode.AMBIGUOUS_EVIDENCE.value


class TestMailboxExistenceVerificationSemantics:
    """Proves that domain evidence alone does not confirm mailbox existence,
    and SMTP acceptance is not treated as guaranteed delivery.
    """

    def test_positive_domain_evidence_alone_does_not_prove_mailbox(self) -> None:
        result = classify(_valid_syntax(), dns=_mx_dns())
        assert result.verdict == Verdict.UNKNOWN
        assert result.reason_code == ReasonCode.MAILBOX_UNCONFIRMED.value
        assert any("unconfirmed" in lim.lower() for lim in result.limitations)

    def test_implicit_mx_alone_does_not_prove_mailbox(self) -> None:
        result = classify(_valid_syntax(), dns=_implicit_mx_dns())
        assert result.verdict == Verdict.UNKNOWN
        assert result.reason_code == ReasonCode.MAILBOX_UNCONFIRMED.value

    def test_smtp_acceptance_notes_catchall_and_delivery_caveats(self) -> None:
        smtp = SMTPResult(status=SMTPStatus.ACCEPTED, address="user@example.com", smtp_code=250, reason="250 Recipient OK")
        result = classify(_valid_syntax(), dns=_mx_dns(), smtp=smtp)
        assert result.verdict == Verdict.LIKELY_DELIVERED
        assert result.reason_code == ReasonCode.MAILBOX_ACCEPTED.value
        # Must document catch-all and non-guarantee limitations
        limitations_text = " ".join(result.limitations).lower()
        assert "catch-all" in limitations_text
        assert "guarantee" in limitations_text or "post-handshake" in limitations_text


class TestContradictoryEvidenceProtection:
    """Proves that contradictory evidence never produces an unjustified positive verdict."""

    def test_dns_nxdomain_with_smtp_accepted_is_unknown(self) -> None:
        smtp = SMTPResult(status=SMTPStatus.ACCEPTED, address="user@example.com", smtp_code=250, reason="OK")
        result = classify(_valid_syntax(), dns=_nxdomain_dns(), smtp=smtp)
        assert result.verdict == Verdict.UNKNOWN
        assert result.reason_code == ReasonCode.AMBIGUOUS_EVIDENCE.value
        assert "conflicting" in result.explanation.lower() or "contradictory" in result.explanation.lower()

    def test_dns_timeout_with_smtp_accepted_is_unknown(self) -> None:
        smtp = SMTPResult(status=SMTPStatus.ACCEPTED, address="user@example.com", smtp_code=250, reason="OK")
        result = classify(_valid_syntax(), dns=_timeout_dns(), smtp=smtp)
        assert result.verdict == Verdict.UNKNOWN
        assert result.reason_code == ReasonCode.AMBIGUOUS_EVIDENCE.value


class TestConsistencyAcrossEvidenceStates:
    """Proves that verdict, reason code, and explanation are mutually consistent."""

    def test_smtp_timeout_explanation_never_claims_rejection(self) -> None:
        smtp = SMTPResult(status=SMTPStatus.INCONCLUSIVE, address="user@example.com", is_timeout=True, reason="Timed out")
        result = classify(_valid_syntax(), dns=_mx_dns(), smtp=smtp)
        explanation_lower = result.explanation.lower()
        assert "timeout" in explanation_lower or "timed out" in explanation_lower
        assert "rejected" not in explanation_lower

    def test_smtp_unavailable_explanation_never_claims_mailbox_rejection(self) -> None:
        smtp = SMTPResult(status=SMTPStatus.INCONCLUSIVE, address="user@example.com", is_blocked=True, reason="Port 25 blocked")
        result = classify(_valid_syntax(), dns=_mx_dns(), smtp=smtp)
        explanation_lower = result.explanation.lower()
        assert "blocked" in explanation_lower or "refused" in explanation_lower
        assert "rejected" not in explanation_lower

    def test_invalid_syntax_skips_dns_and_smtp(self) -> None:
        result = classify(_invalid_syntax())
        assert "dns" in result.checks_skipped
        assert "smtp" in result.checks_skipped
        assert result.checks_run == ["syntax"]
        assert result.verdict == Verdict.LIKELY_BOUNCE

    def test_serialization_contains_all_evidence_and_no_confidence(self) -> None:
        result = classify(_valid_syntax(), dns=_mx_dns())
        d = result.to_dict()
        required_keys = {
            "address",
            "original_input",
            "normalized_address",
            "verdict",
            "reason_code",
            "explanation",
            "syntax_evidence",
            "dns_evidence",
            "smtp_evidence",
            "checks_run",
            "checks_skipped",
            "evidence",
            "limitations",
            "analysed_at",
        }
        assert required_keys.issubset(d.keys())
        assert "confidence" not in d
