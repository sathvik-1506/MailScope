"""
Exhaustive unit tests for the dns_checker service.

Network calls are mocked so the test suite runs deterministically offline.
Covers:
- Valid MX response
- Multiple MX records with preference priority
- NXDOMAIN (domain nonexistence vs temporary error)
- NODATA (missing MX records with no A/AAAA fallback vs domain nonexistence)
- Null MX (RFC 7505 explicit non-acceptance of email)
- Implicit MX fallback (RFC 5321 § 5.1 A / AAAA direct delivery)
- SERVFAIL (nameserver failure)
- Resolver timeout
- Invalid MX target (direct IP literal or malformed hostname)
- Unresolvable MX target (NXDOMAIN or NODATA on MX exchange)
- Unexpected resolver exception
- Mixed MX records (one resolvable, one unresolvable)
- MX target resolution timeout (inconclusive, never bounce)
- Domain normalization and timeout bounding
- Verification of both raw evidence model and final classification
"""

from unittest.mock import MagicMock, patch
import pytest
import dns.resolver
import dns.exception

from backend.services.dns_checker import (
    check_dns,
    normalize_domain,
    validate_mx_hostname,
    DNSStatus,
    DNSResult,
)
from backend.services.syntax_checker import SyntaxResult
from backend.services.classifier import classify, Verdict, ReasonCode


class _MockMXRecord:
    def __init__(self, exchange: str, preference: int = 10) -> None:
        self.exchange = exchange
        self.preference = preference


def _syntax_for(domain: str) -> SyntaxResult:
    return SyntaxResult(
        valid=True,
        normalized=f"test@{domain}",
        original=f"test@{domain}",
        reason="Syntax valid.",
        local_part="test",
        domain=domain,
    )


# ========================================================================= #
# 1. Valid MX Response                                                      #
# ========================================================================= #
@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_valid_mx_response(MockResolver: MagicMock) -> None:
    instance = MockResolver.return_value

    def _resolve(target: str, rtype: str):
        if rtype == "MX":
            return [_MockMXRecord("mail.example.com.", preference=10)]
        if rtype == "A" and target == "mail.example.com":
            return [MagicMock()]
        raise dns.resolver.NoAnswer()

    instance.resolve.side_effect = _resolve

    result = check_dns("example.com")
    assert result.status == DNSStatus.HAS_MX
    assert result.state == "passed"
    assert result.mx_hosts == ["mail.example.com"]
    assert result.invalid_mx_hosts == []
    assert result.unresolvable_mx_hosts == []
    assert not result.has_implicit_mx
    assert not result.is_nxdomain
    assert not result.is_null_mx

    # Classification check: positive domain routing without SMTP returns UNKNOWN (MAILBOX_UNCONFIRMED)
    c_res = classify(_syntax_for("example.com"), dns=result)
    assert c_res.verdict == Verdict.UNKNOWN
    assert c_res.reason_code == ReasonCode.MAILBOX_UNCONFIRMED.value
    assert "syntax" in c_res.checks_run
    assert "dns" in c_res.checks_run
    assert c_res.dns_evidence["state"] == "passed"


# ========================================================================= #
# 2. Multiple MX Records (Ordered by Preference)                            #
# ========================================================================= #
@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_multiple_mx_records_ordered_by_priority(MockResolver: MagicMock) -> None:
    instance = MockResolver.return_value

    def _resolve(target: str, rtype: str):
        if rtype == "MX":
            # Return in reverse preference order to verify sorting
            return [
                _MockMXRecord("backup.example.com.", preference=20),
                _MockMXRecord("primary.example.com.", preference=10),
            ]
        if rtype in ("A", "AAAA"):
            return [MagicMock()]
        raise dns.resolver.NoAnswer()

    instance.resolve.side_effect = _resolve

    result = check_dns("example.com")
    assert result.status == DNSStatus.HAS_MX
    assert result.state == "passed"
    assert result.mx_hosts == ["primary.example.com", "backup.example.com"]

    c_res = classify(_syntax_for("example.com"), dns=result)
    assert c_res.verdict == Verdict.UNKNOWN
    assert c_res.reason_code == ReasonCode.MAILBOX_UNCONFIRMED.value


# ========================================================================= #
# 3. NXDOMAIN (Definitive Domain Nonexistence)                              #
# ========================================================================= #
@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_nxdomain_distinguished_from_temporary_errors(MockResolver: MagicMock) -> None:
    instance = MockResolver.return_value
    instance.resolve.side_effect = dns.resolver.NXDOMAIN()

    result = check_dns("nonexistent.invalid")
    assert result.status == DNSStatus.NO_RECORDS
    assert result.state == "failed"
    assert result.is_nxdomain is True
    assert not result.is_nodata
    assert "NXDOMAIN" in result.reason

    c_res = classify(_syntax_for("nonexistent.invalid"), dns=result)
    assert c_res.verdict == Verdict.LIKELY_BOUNCE
    assert c_res.reason_code == ReasonCode.DOMAIN_NOT_FOUND.value
    assert "NXDOMAIN" in c_res.explanation


# ========================================================================= #
# 4. NODATA (Missing MX Records with no A/AAAA Fallback)                     #
# ========================================================================= #
@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_nodata_distinguished_from_nxdomain(MockResolver: MagicMock) -> None:
    instance = MockResolver.return_value
    # Domain exists, but MX, A, and AAAA all return NoAnswer (NODATA)
    instance.resolve.side_effect = dns.resolver.NoAnswer()

    result = check_dns("nodata.example")
    assert result.status == DNSStatus.NO_RECORDS
    assert result.state == "failed"
    assert result.is_nodata is True
    assert result.is_nxdomain is False
    assert "NODATA" in result.reason

    c_res = classify(_syntax_for("nodata.example"), dns=result)
    assert c_res.verdict == Verdict.LIKELY_BOUNCE
    assert c_res.reason_code == ReasonCode.NO_MAIL_ROUTING.value
    assert "NODATA" in c_res.explanation or "no MX" in c_res.explanation


# ========================================================================= #
# 5. Null MX (RFC 7505)                                                     #
# ========================================================================= #
@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_null_mx_record_rfc7505(MockResolver: MagicMock) -> None:
    instance = MockResolver.return_value
    instance.resolve.return_value = [_MockMXRecord(".", preference=0)]

    result = check_dns("nomail.example")
    assert result.status == DNSStatus.NO_RECORDS
    assert result.state == "failed"
    assert result.is_null_mx is True
    assert not result.is_nxdomain
    assert "Null MX" in result.reason

    c_res = classify(_syntax_for("nomail.example"), dns=result)
    assert c_res.verdict == Verdict.LIKELY_BOUNCE
    assert c_res.reason_code == ReasonCode.NO_MAIL_ROUTING.value
    assert "Null MX" in c_res.explanation


# ========================================================================= #
# 6. Implicit MX Fallback (RFC 5321 § 5.1)                                  #
# ========================================================================= #
@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_implicit_mx_fallback_a_record(MockResolver: MagicMock) -> None:
    instance = MockResolver.return_value

    def _resolve(domain: str, rtype: str):
        if rtype == "MX":
            raise dns.resolver.NoAnswer()
        if rtype == "A":
            return [MagicMock()]
        raise dns.resolver.NoAnswer()

    instance.resolve.side_effect = _resolve

    result = check_dns("implicit-a.example")
    assert result.status == DNSStatus.HAS_A
    assert result.state == "passed"
    assert result.has_implicit_mx is True
    assert result.mx_hosts == ["implicit-a.example"]
    assert "Implicit MX fallback" in result.reason

    c_res = classify(_syntax_for("implicit-a.example"), dns=result)
    assert c_res.verdict == Verdict.UNKNOWN
    assert c_res.reason_code == ReasonCode.MAILBOX_UNCONFIRMED.value


@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_implicit_mx_fallback_aaaa_record(MockResolver: MagicMock) -> None:
    instance = MockResolver.return_value

    def _resolve(domain: str, rtype: str):
        if rtype in ("MX", "A"):
            raise dns.resolver.NoAnswer()
        if rtype == "AAAA":
            return [MagicMock()]
        raise dns.resolver.NoAnswer()

    instance.resolve.side_effect = _resolve

    result = check_dns("ipv6-only.example")
    assert result.status == DNSStatus.HAS_A
    assert result.state == "passed"
    assert result.has_implicit_mx is True
    assert result.mx_hosts == ["ipv6-only.example"]


# ========================================================================= #
# 7. SERVFAIL (Temporary Nameserver Failure)                                #
# ========================================================================= #
@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_servfail_returns_inconclusive(MockResolver: MagicMock) -> None:
    instance = MockResolver.return_value
    instance.resolve.side_effect = dns.resolver.NoNameservers()

    result = check_dns("servfail.example")
    assert result.status == DNSStatus.SERVFAIL
    assert result.state == "inconclusive"
    assert "servfail" in result.reason.lower() or "nameserver" in result.reason.lower()

    c_res = classify(_syntax_for("servfail.example"), dns=result)
    assert c_res.verdict == Verdict.UNKNOWN
    assert c_res.verdict != Verdict.LIKELY_BOUNCE
    assert c_res.reason_code == ReasonCode.DNS_TEMPORARY_FAILURE.value


# ========================================================================= #
# 8. Resolver Timeout                                                       #
# ========================================================================= #
@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_resolver_timeout_returns_inconclusive(MockResolver: MagicMock) -> None:
    instance = MockResolver.return_value
    instance.resolve.side_effect = dns.exception.Timeout("Timeout 5.0s")

    result = check_dns("timeout.example")
    assert result.status == DNSStatus.TIMEOUT
    assert result.state == "inconclusive"
    assert "timed out" in result.reason.lower()

    c_res = classify(_syntax_for("timeout.example"), dns=result)
    assert c_res.verdict == Verdict.UNKNOWN
    assert c_res.verdict != Verdict.LIKELY_BOUNCE
    assert c_res.reason_code == ReasonCode.DNS_TIMEOUT.value


# ========================================================================= #
# 9. Invalid MX Target (IP Literal in MX Exchange)                          #
# ========================================================================= #
@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_invalid_mx_target_ip_literal(MockResolver: MagicMock) -> None:
    instance = MockResolver.return_value
    # MX record with direct IP literal (violates RFC 2181 § 10.3 / RFC 5321 § 5.1)
    instance.resolve.return_value = [_MockMXRecord("192.0.2.1.", preference=10)]

    result = check_dns("ip-mx.example")
    assert result.status == DNSStatus.NO_RECORDS
    assert result.state == "failed"
    assert "192.0.2.1" in result.invalid_mx_hosts
    assert len(result.mx_hosts) == 0

    c_res = classify(_syntax_for("ip-mx.example"), dns=result)
    assert c_res.verdict == Verdict.LIKELY_BOUNCE
    assert c_res.reason_code == ReasonCode.NO_MAIL_ROUTING.value


# ========================================================================= #
# 10. Unresolvable MX Target (NXDOMAIN on MX Host)                          #
# ========================================================================= #
@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_unresolvable_mx_target_nxdomain(MockResolver: MagicMock) -> None:
    instance = MockResolver.return_value

    def _resolve(target: str, rtype: str):
        if rtype == "MX":
            return [_MockMXRecord("mail.unresolvable.invalid.", preference=10)]
        if target == "mail.unresolvable.invalid":
            raise dns.resolver.NXDOMAIN()
        raise dns.resolver.NoAnswer()

    instance.resolve.side_effect = _resolve

    result = check_dns("dead-mx.example")
    assert result.status == DNSStatus.NO_RECORDS
    assert result.state == "failed"
    assert "mail.unresolvable.invalid" in result.unresolvable_mx_hosts
    assert len(result.mx_hosts) == 0

    c_res = classify(_syntax_for("dead-mx.example"), dns=result)
    assert c_res.verdict == Verdict.LIKELY_BOUNCE
    assert c_res.reason_code == ReasonCode.NO_MAIL_ROUTING.value


# ========================================================================= #
# 11. Unexpected Resolver Exception                                         #
# ========================================================================= #
@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_unexpected_resolver_exception(MockResolver: MagicMock) -> None:
    instance = MockResolver.return_value
    instance.resolve.side_effect = OSError("Network unreachable")

    result = check_dns("error.example")
    assert result.status == DNSStatus.ERROR
    assert result.state == "inconclusive"
    assert "error" in result.reason.lower()

    c_res = classify(_syntax_for("error.example"), dns=result)
    assert c_res.verdict == Verdict.UNKNOWN
    assert c_res.reason_code == ReasonCode.DNS_TEMPORARY_FAILURE.value


# ========================================================================= #
# 12. Mixed MX Targets (One Resolvable, One Unresolvable)                   #
# ========================================================================= #
@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_mixed_mx_targets_preserves_active_routes(MockResolver: MagicMock) -> None:
    instance = MockResolver.return_value

    def _resolve(target: str, rtype: str):
        if rtype == "MX":
            return [
                _MockMXRecord("mx1.example.com.", preference=10),
                _MockMXRecord("dead.example.com.", preference=20),
            ]
        if target == "mx1.example.com" and rtype in ("A", "AAAA"):
            return [MagicMock()]
        if target == "dead.example.com":
            raise dns.resolver.NXDOMAIN()
        raise dns.resolver.NoAnswer()

    instance.resolve.side_effect = _resolve

    result = check_dns("mixed.example")
    assert result.status == DNSStatus.HAS_MX
    assert result.state == "passed"
    assert result.mx_hosts == ["mx1.example.com"]
    assert "dead.example.com" in result.unresolvable_mx_hosts

    c_res = classify(_syntax_for("mixed.example"), dns=result)
    assert c_res.verdict == Verdict.UNKNOWN
    assert c_res.reason_code == ReasonCode.MAILBOX_UNCONFIRMED.value


# ========================================================================= #
# 13. MX Target Resolution Timeout Returns Inconclusive                     #
# ========================================================================= #
@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_mx_target_timeout_returns_inconclusive(MockResolver: MagicMock) -> None:
    instance = MockResolver.return_value

    def _resolve(target: str, rtype: str):
        if rtype == "MX":
            return [_MockMXRecord("slow-host.example.com.", preference=10)]
        if target == "slow-host.example.com":
            raise dns.exception.Timeout("Target timeout")
        raise dns.resolver.NoAnswer()

    instance.resolve.side_effect = _resolve

    result = check_dns("slow.example")
    assert result.status == DNSStatus.TIMEOUT
    assert result.state == "inconclusive"
    assert "timed out" in result.reason.lower()

    c_res = classify(_syntax_for("slow.example"), dns=result)
    assert c_res.verdict == Verdict.UNKNOWN
    assert c_res.verdict != Verdict.LIKELY_BOUNCE
    assert c_res.reason_code == ReasonCode.DNS_TIMEOUT.value


# ========================================================================= #
# 14. Domain Normalization & Validation Helper Tests                        #
# ========================================================================= #
class TestDomainNormalization:
    def test_empty_domain_is_unavailable(self) -> None:
        result = check_dns("")
        assert result.status == DNSStatus.NO_RECORDS
        assert result.state == "unavailable"

    def test_domain_whitespace_and_trailing_dot_normalized(self) -> None:
        valid, clean, err = normalize_domain("  Example.COM.  ")
        assert valid is True
        assert clean == "example.com"

    def test_ip_literal_domain_rejected(self) -> None:
        valid, clean, err = normalize_domain("[192.168.1.1]")
        assert valid is False
        assert "invalid" in err.lower() or "literal" in err.lower()

    def test_domain_with_spaces_or_colons_rejected(self) -> None:
        valid, clean, err = normalize_domain("example.com:25")
        assert valid is False

    def test_domain_over_253_chars_rejected(self) -> None:
        long_domain = "a" * 254 + ".com"
        valid, clean, err = normalize_domain(long_domain)
        assert valid is False

    def test_bounded_timeout_applied(self) -> None:
        with patch("backend.services.dns_checker.dns.resolver.Resolver") as MockResolver:
            instance = MockResolver.return_value
            instance.resolve.side_effect = dns.resolver.NXDOMAIN()

            check_dns("example.com", timeout=999.0)
            assert instance.timeout == 10.0
            assert instance.lifetime == 10.0

            check_dns("example.com", timeout=-5.0)
            assert instance.timeout == 1.0
            assert instance.lifetime == 1.0


class TestMXHostnameValidation:
    def test_valid_hostname(self) -> None:
        valid, clean, err = validate_mx_hostname("mail.example.com.")
        assert valid is True
        assert clean == "mail.example.com"

    def test_ip_address_rejected_as_mx_target(self) -> None:
        valid, clean, err = validate_mx_hostname("93.184.216.34")
        assert valid is False
        assert "prohibited" in err.lower()

    def test_uri_format_rejected_as_mx_target(self) -> None:
        valid, clean, err = validate_mx_hostname("smtp://mail.example.com")
        assert valid is False
