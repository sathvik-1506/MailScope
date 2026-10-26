"""
Tests for the classifier service and reason codes.
"""

from backend.services.syntax_checker import SyntaxResult
from backend.services.dns_checker import DNSResult, DNSStatus
from backend.services.smtp_checker import SMTPResult, SMTPStatus
from backend.services.classifier import classify, Verdict, ReasonCode


def _valid_syntax(address: str = "user@example.com") -> SyntaxResult:
    return SyntaxResult(
        valid=True,
        normalized=address,
        original=address,
        reason="OK",
        local_part="user",
        domain="example.com",
    )


def _invalid_syntax(address: str = "bad") -> SyntaxResult:
    return SyntaxResult(valid=False, normalized=None, original=address, reason="Invalid syntax")


def _mx_dns(domain: str = "example.com") -> DNSResult:
    return DNSResult(status=DNSStatus.HAS_MX, domain=domain, mx_hosts=["mail.example.com"], reason="MX found")


def _nxdomain_dns(domain: str = "nodomain.invalid") -> DNSResult:
    return DNSResult(status=DNSStatus.NO_RECORDS, domain=domain, is_nxdomain=True, reason="NXDOMAIN")


def _no_routing_dns(domain: str = "norouting.example") -> DNSResult:
    return DNSResult(status=DNSStatus.NO_RECORDS, domain=domain, is_nxdomain=False, reason="No MX or A records")


def _timeout_dns(domain: str = "example.com") -> DNSResult:
    return DNSResult(status=DNSStatus.TIMEOUT, domain=domain, reason="Timeout")


class TestInvalidSyntax:
    def test_invalid_syntax_is_likely_bounce(self) -> None:
        result = classify(_invalid_syntax())
        assert result.verdict == Verdict.LIKELY_BOUNCE
        assert result.confidence >= 0.9
        assert result.reason_code == ReasonCode.INVALID_SYNTAX.value
        assert "dns" in result.checks_skipped
        assert "smtp" in result.checks_skipped


class TestDNSClassification:
    def test_nxdomain_is_domain_not_found(self) -> None:
        result = classify(_valid_syntax(), dns=_nxdomain_dns())
        assert result.verdict == Verdict.LIKELY_BOUNCE
        assert result.reason_code == ReasonCode.DOMAIN_NOT_FOUND.value

    def test_no_routing_is_no_mail_routing(self) -> None:
        result = classify(_valid_syntax(), dns=_no_routing_dns())
        assert result.verdict == Verdict.LIKELY_BOUNCE
        assert result.reason_code == ReasonCode.NO_MAIL_ROUTING.value

    def test_dns_timeout_is_dns_temporary_failure(self) -> None:
        result = classify(_valid_syntax(), dns=_timeout_dns())
        assert result.verdict == Verdict.UNKNOWN
        assert result.reason_code == ReasonCode.DNS_TEMPORARY_FAILURE.value

    def test_dns_none_is_unknown(self) -> None:
        result = classify(_valid_syntax(), dns=None)
        assert result.verdict == Verdict.UNKNOWN
        assert result.reason_code == ReasonCode.DNS_TEMPORARY_FAILURE.value


class TestNoSMTP:
    def test_mx_without_smtp_is_unknown(self) -> None:
        """Without SMTP, we cannot confirm mailbox; result should be UNKNOWN."""
        result = classify(_valid_syntax(), dns=_mx_dns())
        assert result.verdict == Verdict.UNKNOWN
        assert result.reason_code == ReasonCode.MAILBOX_UNCONFIRMED.value
        assert any("unconfirmed" in lim.lower() for lim in result.limitations)


class TestWithSMTP:
    def test_smtp_accepted_is_likely_delivered(self) -> None:
        smtp = SMTPResult(status=SMTPStatus.ACCEPTED, address="user@example.com", smtp_code=250, reason="OK")
        result = classify(_valid_syntax(), dns=_mx_dns(), smtp=smtp)
        assert result.verdict == Verdict.LIKELY_DELIVERED
        assert result.reason_code == ReasonCode.MAILBOX_ACCEPTED.value
        # catch-all limitation must be mentioned
        assert any("catch-all" in lim.lower() for lim in result.limitations)

    def test_smtp_rejected_is_likely_bounce(self) -> None:
        smtp = SMTPResult(status=SMTPStatus.REJECTED, address="user@example.com", smtp_code=550, reason="No such user")
        result = classify(_valid_syntax(), dns=_mx_dns(), smtp=smtp)
        assert result.verdict == Verdict.LIKELY_BOUNCE
        assert result.reason_code == ReasonCode.MAILBOX_REJECTED.value

    def test_smtp_timeout_is_smtp_timeout(self) -> None:
        smtp = SMTPResult(status=SMTPStatus.INCONCLUSIVE, address="user@example.com", is_timeout=True, reason="Timed out")
        result = classify(_valid_syntax(), dns=_mx_dns(), smtp=smtp)
        assert result.verdict == Verdict.UNKNOWN
        assert result.reason_code == ReasonCode.SMTP_TIMEOUT.value

    def test_smtp_unavailable_is_smtp_unavailable(self) -> None:
        smtp = SMTPResult(status=SMTPStatus.INCONCLUSIVE, address="user@example.com", is_blocked=True, reason="Port 25 blocked")
        result = classify(_valid_syntax(), dns=_mx_dns(), smtp=smtp)
        assert result.verdict == Verdict.UNKNOWN
        assert result.reason_code == ReasonCode.SMTP_UNAVAILABLE.value

    def test_smtp_inconclusive_is_unknown(self) -> None:
        smtp = SMTPResult(status=SMTPStatus.INCONCLUSIVE, address="user@example.com", reason="Greylisting 451")
        result = classify(_valid_syntax(), dns=_mx_dns(), smtp=smtp)
        assert result.verdict == Verdict.UNKNOWN
        assert result.reason_code == ReasonCode.SMTP_INCONCLUSIVE.value

    def test_smtp_disabled_treated_as_no_smtp(self) -> None:
        smtp = SMTPResult(status=SMTPStatus.DISABLED, address="user@example.com", reason="Disabled")
        result = classify(_valid_syntax(), dns=_mx_dns(), smtp=smtp)
        assert result.verdict == Verdict.UNKNOWN
        assert result.reason_code == ReasonCode.MAILBOX_UNCONFIRMED.value


class TestStructuredResultSerialization:
    def test_to_dict_includes_all_fields(self) -> None:
        result = classify(_valid_syntax(), dns=_mx_dns())
        d = result.to_dict()
        assert d["address"] == "user@example.com"
        assert d["verdict"] == "unknown"
        assert d["reason_code"] == "MAILBOX_UNCONFIRMED"
        assert "syntax_evidence" in d
        assert "dns_evidence" in d
        assert "smtp_evidence" in d
        assert "checks_run" in d
        assert "checks_skipped" in d
        assert "evidence" in d
        assert "limitations" in d
        assert "analysed_at" in d
