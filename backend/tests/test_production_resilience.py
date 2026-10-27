"""
Comprehensive tests for production SMTP resilience, DNS/MX auditing,
IPv4/IPv6 fallback, and evidence preservation.

All network operations are strictly mocked with deterministic fixtures.
No real external network calls are performed.
"""

from __future__ import annotations

import socket
import smtplib
from unittest.mock import MagicMock, patch

import pytest
import dns.resolver
import dns.exception

from backend.app import create_app
from backend.services.dns_checker import (
    check_dns,
    DNSStatus,
    DNSResult,
)
from backend.services.smtp_checker import (
    check_smtp,
    SMTPStatus,
    SMTPResult,
    SafeSMTP,
)
from backend.services.syntax_checker import SyntaxResult
from backend.services.classifier import (
    classify,
    Verdict,
    ReasonCode,
)


class _MockMX:
    def __init__(self, exchange: str, preference: int = 10) -> None:
        self.exchange = exchange
        self.preference = preference


class _MockTXT:
    def __init__(self, text: str) -> None:
        self.strings = [text.encode("utf-8")]

    def __str__(self) -> str:
        return self.strings[0].decode("utf-8")


def _build_mock_socket(peer_ip: str = "93.184.216.34", response_code: int = 250):
    """Build mock socket for SMTP conversation."""
    sock = MagicMock()
    sock.getpeername.return_value = (peer_ip, 25)

    responses = [
        b"220 mail.example.com ESMTP Mailora\r\n",
        b"250 mail.example.com\r\n",
        b"250 2.1.0 Sender OK\r\n",
        f"{response_code} Recipient result\r\n".encode("utf-8"),
        b"221 2.0.0 Bye\r\n",
    ]
    file_mock = MagicMock()
    file_mock.readline.side_effect = responses
    sock.makefile.return_value = file_mock
    return sock


def _make_syntax(domain: str = "example.com") -> SyntaxResult:
    return SyntaxResult(
        valid=True,
        normalized=f"user@{domain}",
        original=f"user@{domain}",
        reason="RFC syntax format valid.",
        local_part="user",
        domain=domain,
    )


# ========================================================================= #
# 1. DNS/MX Auditing Scenarios                                              #
# ========================================================================= #

@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_valid_domain_with_one_mx_record_and_ip_resolution(mock_resolver_cls: MagicMock) -> None:
    """Valid domain with one MX record resolving to IPv4 and IPv6, plus SPF and DMARC."""
    resolver = mock_resolver_cls.return_value

    def _resolve(target: str, rtype: str):
        if target == "example.com" and rtype == "MX":
            return [_MockMX("mail.example.com.", 10)]
        if target == "mail.example.com" and rtype == "A":
            return ["198.51.100.1"]
        if target == "mail.example.com" and rtype == "AAAA":
            return ["2001:db8::1"]
        if target == "example.com" and rtype == "TXT":
            return [_MockTXT("v=spf1 include:_spf.example.com ~all")]
        if target == "_dmarc.example.com" and rtype == "TXT":
            return [_MockTXT("v=DMARC1; p=reject; sp=reject")]
        raise dns.resolver.NoAnswer()

    resolver.resolve.side_effect = _resolve

    result = check_dns("example.com")
    assert result.status == DNSStatus.HAS_MX
    assert result.state == "passed"
    assert result.mx_status == "found"
    assert result.mx_hosts == ["mail.example.com"]
    assert result.mx_hosts_resolve is True
    assert len(result.mx_records) == 1
    assert result.mx_records[0]["host"] == "mail.example.com"
    assert result.mx_records[0]["preference"] == 10
    assert result.mx_records[0]["ipv4"] == ["198.51.100.1"]
    assert result.mx_records[0]["ipv6"] == ["2001:db8::1"]
    assert result.spf_status == "found"
    assert "v=spf1" in (result.spf_record or "")
    assert result.dmarc_status == "found"
    assert "v=DMARC1" in (result.dmarc_record or "")
    assert result.dns_error is None


@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_domain_with_multiple_mx_records_ordered_by_preference(mock_resolver_cls: MagicMock) -> None:
    """Multiple MX records sorted in ascending order of preference."""
    resolver = mock_resolver_cls.return_value

    def _resolve(target: str, rtype: str):
        if target == "example.com" and rtype == "MX":
            # Return in scrambled preference order
            return [
                _MockMX("mx3.example.com.", 30),
                _MockMX("mx1.example.com.", 10),
                _MockMX("mx2.example.com.", 20),
            ]
        if rtype == "A":
            return ["198.51.100.1"]
        raise dns.resolver.NoAnswer()

    resolver.resolve.side_effect = _resolve

    result = check_dns("example.com")
    assert result.status == DNSStatus.HAS_MX
    assert result.mx_hosts == ["mx1.example.com", "mx2.example.com", "mx3.example.com"]
    assert [r["preference"] for r in result.mx_records] == [10, 20, 30]


@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_domain_with_no_mx_record_implicit_fallback(mock_resolver_cls: MagicMock) -> None:
    """Domain with no MX records (NODATA) falls back to A/AAAA implicit MX (RFC 5321 § 5.1)."""
    resolver = mock_resolver_cls.return_value

    def _resolve(target: str, rtype: str):
        if target == "fallback.com" and rtype == "MX":
            raise dns.resolver.NoAnswer()
        if target == "fallback.com" and rtype == "A":
            return ["198.51.100.5"]
        raise dns.resolver.NoAnswer()

    resolver.resolve.side_effect = _resolve

    result = check_dns("fallback.com")
    assert result.status == DNSStatus.HAS_A
    assert result.has_implicit_mx is True
    assert result.mx_status == "no_record"
    assert result.mx_hosts == ["fallback.com"]
    assert result.mx_hosts_resolve is True


@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_null_mx_domain_rfc7505(mock_resolver_cls: MagicMock) -> None:
    """Null MX (priority 0 '.') explicitly declares non-acceptance of email."""
    resolver = mock_resolver_cls.return_value
    resolver.resolve.return_value = [_MockMX(".", 0)]

    result = check_dns("null-mx.com")
    assert result.status == DNSStatus.NO_RECORDS
    assert result.is_null_mx is True
    assert result.mx_status == "no_record"
    assert result.mx_hosts_resolve is False

    # Classification test: Null MX must produce LIKELY_BOUNCE (NO_MAIL_ROUTING)
    c_res = classify(_make_syntax("null-mx.com"), dns=result)
    assert c_res.verdict == Verdict.LIKELY_BOUNCE
    assert c_res.reason_code == ReasonCode.NO_MAIL_ROUTING.value


@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_nonexistent_domain_nxdomain(mock_resolver_cls: MagicMock) -> None:
    """NXDOMAIN indicates authoritative nonexistence of domain."""
    resolver = mock_resolver_cls.return_value
    resolver.resolve.side_effect = dns.resolver.NXDOMAIN()

    result = check_dns("this-domain-definitely-does-not-exist.org")
    assert result.status == DNSStatus.NO_RECORDS
    assert result.is_nxdomain is True
    assert result.mx_status == "nxdomain"
    assert result.state == "failed"

    c_res = classify(_make_syntax("this-domain-definitely-does-not-exist.org"), dns=result)
    assert c_res.verdict == Verdict.LIKELY_BOUNCE
    assert c_res.reason_code == ReasonCode.DOMAIN_NOT_FOUND.value


@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_dns_timeout_is_inconclusive(mock_resolver_cls: MagicMock) -> None:
    """DNS timeout produces UNKNOWN verdict, never a bounce."""
    resolver = mock_resolver_cls.return_value
    resolver.resolve.side_effect = dns.exception.Timeout("Timed out waiting for DNS nameservers")

    result = check_dns("timeout.org")
    assert result.status == DNSStatus.TIMEOUT
    assert result.state == "inconclusive"
    assert result.mx_status == "timeout"

    c_res = classify(_make_syntax("timeout.org"), dns=result)
    assert c_res.verdict == Verdict.UNKNOWN
    assert c_res.reason_code == ReasonCode.DNS_TIMEOUT.value


@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_dns_resolver_failure_servfail(mock_resolver_cls: MagicMock) -> None:
    """Nameserver failure (SERVFAIL) produces UNKNOWN verdict, never a bounce."""
    resolver = mock_resolver_cls.return_value
    resolver.resolve.side_effect = dns.resolver.NoNameservers("All nameservers failed")

    result = check_dns("servfail.org")
    assert result.status == DNSStatus.SERVFAIL
    assert result.state == "inconclusive"
    assert result.mx_status == "dns_error"

    c_res = classify(_make_syntax("servfail.org"), dns=result)
    assert c_res.verdict == Verdict.UNKNOWN
    assert c_res.reason_code == ReasonCode.DNS_TEMPORARY_FAILURE.value


@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_spf_and_dmarc_records_present_or_absent(mock_resolver_cls: MagicMock) -> None:
    """Tests SPF and DMARC present, absent, and invalid (multiple SPF records)."""
    resolver = mock_resolver_cls.return_value

    # Case A: Both absent
    def _resolve_absent(target: str, rtype: str):
        if rtype == "MX":
            return [_MockMX("mail.example.com.", 10)]
        if rtype == "A":
            return ["198.51.100.1"]
        raise dns.resolver.NoAnswer()

    resolver.resolve.side_effect = _resolve_absent
    res_absent = check_dns("example.com")
    assert res_absent.spf_status == "no_record"
    assert res_absent.dmarc_status == "no_record"

    # Case B: Multiple SPF records published (RFC 7208 violation)
    def _resolve_multi_spf(target: str, rtype: str):
        if rtype == "MX":
            return [_MockMX("mail.example.com.", 10)]
        if rtype == "A":
            return ["198.51.100.1"]
        if target == "example.com" and rtype == "TXT":
            return [_MockTXT("v=spf1 mx -all"), _MockTXT("v=spf1 ip4:198.51.100.1 ~all")]
        raise dns.resolver.NoAnswer()

    resolver.resolve.side_effect = _resolve_multi_spf
    res_multi = check_dns("example.com")
    assert res_multi.spf_status == "invalid"


# ========================================================================= #
# 2. SMTP IPv4/IPv6 Handling, Blocked Port 25, and Graceful Degradation     #
# ========================================================================= #

_PUB_V4_A = "93.184.216.34"
_PUB_V4_B = "93.184.216.35"
_PUB_V6 = "2606:2800:220:1:248:1893:25c8:1946"

@patch("backend.services.smtp_checker.socket.getaddrinfo")
@patch("backend.services.smtp_checker.socket.create_connection")
def test_ipv6_connection_failure_with_ipv4_fallback(
    mock_create_conn: MagicMock,
    mock_addrinfo: MagicMock,
) -> None:
    """When IPv6 destination fails with Network unreachable ([Errno 101]), IPv4 candidate is tried and succeeds."""
    mock_addrinfo.return_value = [
        (socket.AF_INET6, socket.SOCK_STREAM, 6, "", (_PUB_V6, 25, 0, 0)),
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", (_PUB_V4_A, 25)),
    ]

    sock_v4 = _build_mock_socket(_PUB_V4_A, 250)

    # IPv6 candidate fails with Errno 101 (Network is unreachable); IPv4 candidate succeeds
    mock_create_conn.side_effect = [
        OSError(101, "Network is unreachable"),
        sock_v4,
    ]

    result = check_smtp("user@example.com", "mail.example.com", enabled=True)
    assert result.status == SMTPStatus.ACCEPTED
    assert result.smtp_code == 250
    assert mock_create_conn.call_count == 2


@patch("backend.services.smtp_checker.socket.getaddrinfo")
@patch("backend.services.smtp_checker.socket.create_connection")
def test_all_smtp_connection_attempts_failing_blocked_port_25(
    mock_create_conn: MagicMock,
    mock_addrinfo: MagicMock,
) -> None:
    """When outbound port 25 is blocked or network is unreachable across all candidates (e.g. Render),
    result is INCONCLUSIVE with is_blocked=True and error_code='SMTP_UNAVAILABLE'."""
    mock_addrinfo.return_value = [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", (_PUB_V4_A, 25)),
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", (_PUB_V4_B, 25)),
    ]

    mock_create_conn.side_effect = ConnectionRefusedError("Connection refused on port 25")

    result = check_smtp("user@example.com", "mail.example.com", enabled=True)
    assert result.status == SMTPStatus.INCONCLUSIVE
    assert result.is_blocked is True
    assert result.is_timeout is False
    assert result.error_code == "SMTP_UNAVAILABLE"
    assert "blocked or unreachable" in result.reason.lower()


@patch("backend.services.smtp_checker.socket.getaddrinfo")
@patch("backend.services.smtp_checker.socket.create_connection")
def test_smtp_timeout_preserves_valid_dns_results(
    mock_create_conn: MagicMock,
    mock_addrinfo: MagicMock,
) -> None:
    """When SMTP times out, valid DNS evidence is completely preserved and verdict is UNKNOWN (never bounce)."""
    mock_addrinfo.return_value = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (_PUB_V4_A, 25))]
    mock_create_conn.side_effect = socket.timeout("Timed out connecting to port 25")

    smtp_res = check_smtp("user@example.com", "mail.example.com", enabled=True)
    assert smtp_res.is_timeout is True
    assert smtp_res.status == SMTPStatus.INCONCLUSIVE

    # Combine with valid DNS result
    dns_res = DNSResult(
        status=DNSStatus.HAS_MX,
        state="passed",
        domain="example.com",
        mx_hosts=["mail.example.com"],
        mx_status="found",
        mx_hosts_resolve=True,
        spf_status="found",
        spf_record="v=spf1 -all",
        dmarc_status="found",
        dmarc_record="v=DMARC1; p=reject",
        reason="Found 1 valid MX target.",
    )

    c_res = classify(_make_syntax("example.com"), dns=dns_res, smtp=smtp_res)
    assert c_res.verdict == Verdict.UNKNOWN
    assert c_res.reason_code == ReasonCode.SMTP_TIMEOUT.value
    # Assert DNS evidence is fully preserved in output
    assert c_res.dns_evidence["status"] == "has_mx"
    assert c_res.dns_evidence["mx_hosts"] == ["mail.example.com"]
    assert c_res.dns_evidence["spf_status"] == "found"
    assert c_res.dns_evidence["dmarc_status"] == "found"


@patch("backend.services.smtp_checker.socket.getaddrinfo")
@patch("backend.services.smtp_checker.socket.create_connection")
def test_smtp_blocked_connection_maps_to_smtp_unavailable(
    mock_create_conn: MagicMock,
    mock_addrinfo: MagicMock,
) -> None:
    """Observed production error: [Errno 101] Network is unreachable maps to SMTP_UNAVAILABLE, NOT SMTP_TIMEOUT."""
    mock_addrinfo.return_value = [(socket.AF_INET6, socket.SOCK_STREAM, 6, "", (_PUB_V6, 25, 0, 0))]
    mock_create_conn.side_effect = OSError(101, "Network is unreachable")

    smtp_res = check_smtp("user@example.com", "mail.example.com", enabled=True)
    assert smtp_res.is_blocked is True
    assert smtp_res.is_network_unreachable is True
    assert smtp_res.is_timeout is False
    assert smtp_res.error_code == "SMTP_UNAVAILABLE"

    dns_res = DNSResult(
        status=DNSStatus.HAS_MX,
        state="passed",
        domain="example.com",
        mx_hosts=["mail.example.com"],
        reason="Found 1 valid MX target.",
    )

    c_res = classify(_make_syntax("example.com"), dns=dns_res, smtp=smtp_res)
    assert c_res.verdict == Verdict.UNKNOWN
    assert c_res.reason_code == ReasonCode.SMTP_UNAVAILABLE.value
    assert "blocked or unreachable" in c_res.explanation.lower()


@patch("backend.services.smtp_checker.socket.getaddrinfo")
@patch("backend.services.smtp_checker.socket.create_connection")
def test_smtp_explicit_rejection_produces_likely_bounce(
    mock_create_conn: MagicMock,
    mock_addrinfo: MagicMock,
) -> None:
    """Target mail server explicitly rejects recipient (550) -> LIKELY_BOUNCE (MAILBOX_REJECTED)."""
    mock_addrinfo.return_value = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (_PUB_V4_A, 25))]
    mock_sock = _build_mock_socket(_PUB_V4_A, 550)
    mock_create_conn.return_value = mock_sock

    smtp_res = check_smtp("baduser@example.com", "mail.example.com", enabled=True)
    assert smtp_res.status == SMTPStatus.REJECTED
    assert smtp_res.smtp_code == 550

    dns_res = DNSResult(
        status=DNSStatus.HAS_MX,
        state="passed",
        domain="example.com",
        mx_hosts=["mail.example.com"],
        reason="Found 1 valid MX target.",
    )

    c_res = classify(_make_syntax("example.com"), dns=dns_res, smtp=smtp_res)
    assert c_res.verdict == Verdict.LIKELY_BOUNCE
    assert c_res.reason_code == ReasonCode.MAILBOX_REJECTED.value


def test_smtp_disabled_by_user() -> None:
    """When user disables SMTP, no probe is run and verdict is UNKNOWN (MAILBOX_UNCONFIRMED)."""
    smtp_res = check_smtp("user@example.com", "mail.example.com", enabled=False)
    assert smtp_res.status == SMTPStatus.DISABLED

    dns_res = DNSResult(
        status=DNSStatus.HAS_MX,
        state="passed",
        domain="example.com",
        mx_hosts=["mail.example.com"],
        reason="Found 1 valid MX target.",
    )

    c_res = classify(_make_syntax("example.com"), dns=dns_res, smtp=smtp_res)
    assert c_res.verdict == Verdict.UNKNOWN
    assert c_res.reason_code == ReasonCode.MAILBOX_UNCONFIRMED.value
    assert "smtp" in c_res.checks_skipped


# ========================================================================= #
# 3. Flask API Integration, Health, and Rate Limiting                       #
# ========================================================================= #

def test_health_endpoint_returns_http_200() -> None:
    """Health check endpoint returns HTTP 200 with service metadata."""
    app = create_app()
    client = app.test_client()
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["status"] == "ok"
    assert data["service"] == "mailora-backend"


@patch("backend.app.check_dns")
def test_api_analyze_smtp_disabled_preserves_dns_audit(mock_check_dns: MagicMock) -> None:
    """POST /api/analyze with smtp_enabled=False performs DNS audit and returns structured evidence."""
    mock_check_dns.return_value = DNSResult(
        status=DNSStatus.HAS_MX,
        state="passed",
        domain="example.com",
        mx_hosts=["mail.example.com"],
        mx_status="found",
        mx_records=[{"preference": 10, "host": "mail.example.com", "ipv4": ["198.51.100.1"], "ipv6": []}],
        mx_hosts_resolve=True,
        spf_status="found",
        spf_record="v=spf1 ~all",
        dmarc_status="found",
        dmarc_record="v=DMARC1; p=none",
        reason="Found 1 valid MX target.",
    )

    app = create_app()
    client = app.test_client()
    resp = client.post("/api/analyze", json={"addresses": ["user@example.com"], "smtp_enabled": False})
    assert resp.status_code == 200
    data = resp.get_json()

    assert data["count"] == 1
    assert "results" in data
    res = data["results"][0]
    assert res["verdict"] == "unknown"
    assert res["reason_code"] == "MAILBOX_UNCONFIRMED"
    assert res["dns_evidence"]["mx_status"] == "found"
    assert res["dns_evidence"]["spf_status"] == "found"
    assert res["dns_evidence"]["dmarc_status"] == "found"
    assert res["smtp_evidence"]["status"] == "disabled"


@patch("backend.app.check_dns")
@patch("backend.app.check_smtp")
def test_api_analyze_smtp_blocked_degrades_gracefully(
    mock_check_smtp: MagicMock,
    mock_check_dns: MagicMock,
) -> None:
    """POST /api/analyze with smtp_enabled=True and port 25 blocked degrades gracefully to UNKNOWN."""
    mock_check_dns.return_value = DNSResult(
        status=DNSStatus.HAS_MX,
        state="passed",
        domain="example.com",
        mx_hosts=["mail.example.com"],
        mx_status="found",
        mx_hosts_resolve=True,
        reason="Found 1 valid MX target.",
    )

    mock_check_smtp.return_value = SMTPResult(
        status=SMTPStatus.INCONCLUSIVE,
        address="user@example.com",
        is_blocked=True,
        error_code="SMTP_UNAVAILABLE",
        reason="Outbound SMTP port 25 connection was blocked or unreachable.",
    )

    app = create_app()
    client = app.test_client()
    resp = client.post("/api/analyze", json={"addresses": ["user@example.com"], "smtp_enabled": True})
    assert resp.status_code == 200
    data = resp.get_json()

    res = data["results"][0]
    assert res["verdict"] == "unknown"
    assert res["reason_code"] == "SMTP_UNAVAILABLE"
    assert res["dns_evidence"]["status"] == "has_mx"


def test_api_input_validation() -> None:
    """Request payload validation rejecting invalid structures."""
    app = create_app()
    client = app.test_client()

    # Missing addresses
    resp = client.post("/api/analyze", json={})
    assert resp.status_code == 400

    # Non-list addresses
    resp = client.post("/api/analyze", json={"addresses": "not-a-list"})
    assert resp.status_code == 400

    # Empty list
    resp = client.post("/api/analyze", json={"addresses": []})
    assert resp.status_code == 400


def test_independent_validation_dimensions() -> None:
    """Verify the 4 independent check dimensions across all deliverability outcomes."""
    syntax_valid = _make_syntax("example.com")
    syntax_invalid = SyntaxResult(
        valid=False,
        normalized=None,
        original="bad@@syntax..com",
        reason="Address contains invalid syntax.",
    )

    dns_configured = DNSResult(
        status=DNSStatus.HAS_MX,
        domain="example.com",
        mx_hosts=["mail.example.com"],
        reason="Found MX record.",
    )
    dns_no_routing = DNSResult(
        status=DNSStatus.NO_RECORDS,
        domain="example.com",
        reason="No MX or fallback A/AAAA records found.",
    )
    dns_timeout = DNSResult(
        status=DNSStatus.TIMEOUT,
        domain="example.com",
        reason="Nameserver query timed out.",
    )
    dns_servfail = DNSResult(
        status=DNSStatus.SERVFAIL,
        domain="example.com",
        reason="Nameserver returned SERVFAIL.",
    )

    smtp_disabled = SMTPResult(
        status=SMTPStatus.DISABLED,
        address="user@example.com",
        reason="SMTP verification disabled.",
    )
    smtp_accepted = SMTPResult(
        status=SMTPStatus.ACCEPTED,
        address="user@example.com",
        smtp_code=250,
        reason="250 2.1.5 Recipient OK",
    )
    smtp_rejected = SMTPResult(
        status=SMTPStatus.REJECTED,
        address="user@example.com",
        smtp_code=550,
        reason="550 5.1.1 User unknown",
    )
    smtp_blocked = SMTPResult(
        status=SMTPStatus.INCONCLUSIVE,
        address="user@example.com",
        is_blocked=True,
        is_network_unreachable=True,
        error_code="SMTP_UNAVAILABLE",
        reason="Connection to 93.184.216.34:25 failed: [Errno 101] Network is unreachable",
    )
    smtp_timeout = SMTPResult(
        status=SMTPStatus.INCONCLUSIVE,
        address="user@example.com",
        is_timeout=True,
        error_code="SMTP_TIMEOUT",
        reason="Connection to 93.184.216.34:25 timed out.",
    )

    # 1. Invalid syntax
    res1 = classify(syntax_invalid)
    assert res1.syntax_validation == "INVALID"
    assert res1.dns_mx_validation == "NOT_CONFIGURED"
    assert res1.smtp_probe == "NOT_TESTED"
    assert res1.mailbox_existence == "INVALID"
    assert res1.verdict == Verdict.LIKELY_BOUNCE

    # 2. Valid syntax, configured MX, SMTP disabled
    res2 = classify(syntax_valid, dns=dns_configured, smtp=smtp_disabled)
    assert res2.syntax_validation == "VALID"
    assert res2.dns_mx_validation == "CONFIGURED"
    assert res2.smtp_probe == "NOT_TESTED"
    assert res2.mailbox_existence == "UNCONFIRMED"
    assert res2.verdict == Verdict.UNKNOWN

    # 3. Valid syntax, no usable mail routing
    res3 = classify(syntax_valid, dns=dns_no_routing)
    assert res3.syntax_validation == "VALID"
    assert res3.dns_mx_validation == "NOT_CONFIGURED"
    assert res3.smtp_probe == "NOT_TESTED"
    assert res3.mailbox_existence == "INVALID"
    assert res3.verdict == Verdict.LIKELY_BOUNCE

    # 4. DNS timeout
    res4 = classify(syntax_valid, dns=dns_timeout)
    assert res4.syntax_validation == "VALID"
    assert res4.dns_mx_validation == "UNKNOWN"
    assert res4.smtp_probe == "NOT_TESTED"
    assert res4.mailbox_existence == "UNKNOWN"
    assert res4.verdict == Verdict.UNKNOWN

    # 5. DNS temporary failure (SERVFAIL)
    res5 = classify(syntax_valid, dns=dns_servfail)
    assert res5.syntax_validation == "VALID"
    assert res5.dns_mx_validation == "UNKNOWN"
    assert res5.smtp_probe == "NOT_TESTED"
    assert res5.mailbox_existence == "UNKNOWN"
    assert res5.verdict == Verdict.UNKNOWN

    # 6. SMTP connection failure caused by unreachable network (e.g. Render port 25 blocked)
    res6 = classify(syntax_valid, dns=dns_configured, smtp=smtp_blocked)
    assert res6.syntax_validation == "VALID"
    assert res6.dns_mx_validation == "CONFIGURED"
    assert res6.smtp_probe == "UNAVAILABLE"
    assert res6.mailbox_existence == "UNCONFIRMED"
    assert res6.verdict == Verdict.UNKNOWN
    # CRITICAL: Verify specifically that an SMTP connection failure NEVER turns a valid address into a bounce/invalid
    assert res6.verdict != Verdict.LIKELY_BOUNCE
    assert res6.syntax_validation != "INVALID"

    # 7. SMTP connection timeout
    res7 = classify(syntax_valid, dns=dns_configured, smtp=smtp_timeout)
    assert res7.syntax_validation == "VALID"
    assert res7.dns_mx_validation == "CONFIGURED"
    assert res7.smtp_probe == "TIMEOUT"
    assert res7.mailbox_existence == "UNCONFIRMED"
    assert res7.verdict == Verdict.UNKNOWN
    assert res7.verdict != Verdict.LIKELY_BOUNCE

    # 8. Explicit SMTP recipient rejection (550)
    res8 = classify(syntax_valid, dns=dns_configured, smtp=smtp_rejected)
    assert res8.syntax_validation == "VALID"
    assert res8.dns_mx_validation == "CONFIGURED"
    assert res8.smtp_probe == "REJECTED"
    assert res8.mailbox_existence == "REJECTED"
    assert res8.verdict == Verdict.LIKELY_BOUNCE

    # 9. SMTP success (250 OK)
    res9 = classify(syntax_valid, dns=dns_configured, smtp=smtp_accepted)
    assert res9.syntax_validation == "VALID"
    assert res9.dns_mx_validation == "CONFIGURED"
    assert res9.smtp_probe == "SUCCESS"
    assert res9.mailbox_existence == "CONFIRMED"
    assert res9.verdict == Verdict.LIKELY_DELIVERED
    assert any("catch-all" in lim.lower() for lim in res9.limitations)


@patch("backend.app.check_dns")
@patch("backend.app.check_smtp")
def test_batch_with_different_outcomes(mock_check_smtp: MagicMock, mock_check_dns: MagicMock) -> None:
    """POST /api/analyze with a batch containing different deliverability outcomes."""
    mock_check_dns.return_value = DNSResult(
        status=DNSStatus.HAS_MX,
        state="passed",
        domain="example.com",
        mx_hosts=["mail.example.com"],
        mx_status="found",
        mx_hosts_resolve=True,
        reason="Found MX record.",
    )

    mock_check_smtp.return_value = SMTPResult(
        status=SMTPStatus.INCONCLUSIVE,
        address="valid@example.com",
        is_blocked=True,
        is_network_unreachable=True,
        error_code="SMTP_UNAVAILABLE",
        reason="Connection to 93.184.216.34:25 failed: [Errno 101] Network is unreachable",
    )

    app = create_app()
    client = app.test_client()

    payload = {
        "addresses": ["invalid@@syntax..com", "valid@example.com"],
        "smtp_enabled": True,
    }
    resp = client.post("/api/analyze", json=payload)
    assert resp.status_code == 200
    data = resp.get_json()

    assert data["count"] == 2
    results = data["results"]

    # Address 1: Syntax invalid
    r1 = results[0]
    assert r1["syntax_validation"] == "INVALID"
    assert r1["verdict"] == "likely_bounce"

    # Address 2: Valid syntax, MX configured, SMTP port 25 blocked
    r2 = results[1]
    assert r2["syntax_validation"] == "VALID"
    assert r2["dns_mx_validation"] == "CONFIGURED"
    assert r2["smtp_probe"] == "UNAVAILABLE"
    assert r2["mailbox_existence"] == "UNCONFIRMED"
    assert r2["verdict"] == "unknown"
    assert r2["verdict"] != "likely_bounce"


@patch("backend.app.check_smtp")
@patch("backend.app.check_dns")
def test_automatic_analysis_without_smtp_flag(mock_check_dns, mock_check_smtp) -> None:
    """Verifies that submitting addresses without smtp_enabled runs automatic analysis."""
    from backend.services.smtp_checker import reset_environment_smtp_cache
    reset_environment_smtp_cache()

    mock_check_dns.return_value = DNSResult(
        status=DNSStatus.HAS_MX,
        state="passed",
        domain="example.com",
        mx_hosts=["mail.example.com"],
        mx_status="found",
        mx_hosts_resolve=True,
        reason="Found MX record.",
    )

    mock_check_smtp.return_value = SMTPResult(
        status=SMTPStatus.INCONCLUSIVE,
        address="user@example.com",
        is_blocked=True,
        is_network_unreachable=True,
        error_code="SMTP_UNAVAILABLE",
        reason="Connection to 93.184.216.34:25 failed: [Errno 101] Network is unreachable",
    )

    app = create_app()
    client = app.test_client()

    # Submit payload WITHOUT smtp_enabled flag (clean single-click user submission)
    resp = client.post("/api/analyze", json={"addresses": ["user@example.com"]})
    assert resp.status_code == 200
    data = resp.get_json()

    # Ensure SMTP check was automatically triggered
    assert mock_check_smtp.called
    assert mock_check_smtp.call_args[1]["enabled"] is True

    result = data["results"][0]
    assert result["syntax_validation"] == "VALID"
    assert result["dns_mx_validation"] == "CONFIGURED"
    assert result["smtp_probe"] == "UNAVAILABLE"
    assert result["mailbox_existence"] == "UNCONFIRMED"
    assert result["verdict"] == "unknown"
    assert "SMTP verification is unavailable from the current hosting environment" in result["explanation"]


def test_environment_smtp_unavailability_caching() -> None:
    """Verifies that environment-level port 25 block is cached briefly to avoid redundant timeouts."""
    from backend.services.smtp_checker import (
        check_smtp,
        record_environment_smtp_unavailability,
        reset_environment_smtp_cache,
        get_environment_smtp_unavailability,
    )

    reset_environment_smtp_cache()
    is_blocked, _ = get_environment_smtp_unavailability()
    assert is_blocked is False

    # Simulate environment block
    record_environment_smtp_unavailability("Errno 101 Network is unreachable on port 25")
    is_blocked, reason = get_environment_smtp_unavailability()
    assert is_blocked is True
    assert "Errno 101" in reason

    # Calling check_smtp with enabled=True should short-circuit and return UNAVAILABLE immediately
    res = check_smtp("cached@example.com", mx_host="mail.example.com", enabled=True)
    assert res.status == SMTPStatus.INCONCLUSIVE
    assert res.is_blocked is True
    assert res.is_network_unreachable is True
    assert res.error_code == "SMTP_UNAVAILABLE"
    assert "SMTP verification is unavailable from the current hosting environment" in res.reason

    reset_environment_smtp_cache()
    is_blocked_after, _ = get_environment_smtp_unavailability()
    assert is_blocked_after is False


@patch("backend.app.check_smtp")
@patch("backend.app.check_dns")
def test_dashboard_counter_consistency_with_mixed_batch(mock_check_dns, mock_check_smtp) -> None:
    """Verifies that aggregate counts and dashboard counters remain consistent with individual row verdicts."""
    from backend.services.smtp_checker import reset_environment_smtp_cache
    reset_environment_smtp_cache()

    def side_effect_dns(domain: str) -> DNSResult:
        if domain == "nxdomain.com":
            return DNSResult(
                status=DNSStatus.NO_RECORDS,
                domain=domain,
                reason="Domain not found.",
            )
        elif domain == "timeout.com":
            return DNSResult(
                status=DNSStatus.TIMEOUT,
                domain=domain,
                reason="DNS query timed out.",
            )
        return DNSResult(
            status=DNSStatus.HAS_MX,
            domain=domain,
            mx_hosts=[f"mail.{domain}"],
            reason="Found MX record.",
        )

    def side_effect_smtp(address: str, mx_host: str, enabled: bool, mx_hosts: list[str] | None = None) -> SMTPResult:
        if "accepted" in address:
            return SMTPResult(
                status=SMTPStatus.ACCEPTED,
                address=address,
                smtp_code=250,
                reason="Recipient acknowledged.",
            )
        elif "rejected" in address:
            return SMTPResult(
                status=SMTPStatus.REJECTED,
                address=address,
                smtp_code=550,
                reason="Mailbox not found.",
            )
        return SMTPResult(
            status=SMTPStatus.INCONCLUSIVE,
            address=address,
            is_blocked=True,
            is_network_unreachable=True,
            error_code="SMTP_UNAVAILABLE",
            reason="Outbound port 25 connection refused.",
        )

    mock_check_dns.side_effect = side_effect_dns
    mock_check_smtp.side_effect = side_effect_smtp

    app = create_app()
    client = app.test_client()

    batch = [
        "bad-syntax@@invalid",                # bounce (syntax)
        "user@nxdomain.com",                  # bounce (NXDOMAIN)
        "rejected@example.com",               # bounce (SMTP 550)
        "accepted@example.com",               # delivered (SMTP 250)
        "portblocked@example.com",            # unknown (SMTP unavailable)
        "user@timeout.com",                   # unknown (DNS timeout)
    ]

    resp = client.post("/api/analyze", json={"addresses": batch})
    assert resp.status_code == 200
    data = resp.get_json()

    results = data["results"]
    assert len(results) == 6

    delivered = sum(1 for r in results if r["verdict"] == "likely_delivered")
    bounces = sum(1 for r in results if r["verdict"] == "likely_bounce")
    unknowns = sum(1 for r in results if r["verdict"] == "unknown")

    assert delivered == 1
    assert bounces == 3
    assert unknowns == 2

    # Verify SMTP unavailable is in unknowns, NEVER bounces
    port_blocked_row = next(r for r in results if "portblocked" in r["address"])
    assert port_blocked_row["verdict"] == "unknown"
    assert port_blocked_row["smtp_probe"] == "UNAVAILABLE"
    assert port_blocked_row["mailbox_existence"] == "UNCONFIRMED"


