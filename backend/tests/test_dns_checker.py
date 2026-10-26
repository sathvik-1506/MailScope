"""
Tests for the dns_checker service.

Network calls are mocked so the test suite runs offline deterministically.
"""

from unittest.mock import MagicMock, patch
import dns.resolver
import dns.exception

from backend.services.dns_checker import check_dns, DNSStatus


class _MockMXRecord:
    def __init__(self, exchange: str, preference: int = 10) -> None:
        self.exchange = exchange
        self.preference = preference


def _make_mx_answers(hosts: list[str]) -> list[_MockMXRecord]:
    return [_MockMXRecord(h) for h in hosts]


@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_domain_with_mx(MockResolver: MagicMock) -> None:
    instance = MockResolver.return_value
    instance.resolve.return_value = _make_mx_answers(["mail.example.com."])
    result = check_dns("example.com")
    assert result.status == DNSStatus.HAS_MX
    assert "mail.example.com" in result.mx_hosts


@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_nxdomain(MockResolver: MagicMock) -> None:
    instance = MockResolver.return_value
    instance.resolve.side_effect = dns.resolver.NXDOMAIN()
    result = check_dns("doesnotexist.invalid")
    assert result.status == DNSStatus.NO_RECORDS
    assert result.is_nxdomain is True


@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_timeout_is_inconclusive(MockResolver: MagicMock) -> None:
    instance = MockResolver.return_value
    instance.resolve.side_effect = dns.exception.Timeout()
    result = check_dns("example.com")
    assert result.status == DNSStatus.TIMEOUT


@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_servfail_is_inconclusive(MockResolver: MagicMock) -> None:
    instance = MockResolver.return_value
    instance.resolve.side_effect = dns.resolver.NoNameservers()
    result = check_dns("servfail.example")
    assert result.status == DNSStatus.SERVFAIL
    assert "servfail" in result.reason.lower() or "nameserver" in result.reason.lower()


@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_null_mx_record(MockResolver: MagicMock) -> None:
    """RFC 7505 Null MX record indicates domain rejects all mail."""
    instance = MockResolver.return_value
    instance.resolve.return_value = [_MockMXRecord(".", preference=0)]
    result = check_dns("nomail.example")
    assert result.status == DNSStatus.NO_RECORDS
    assert result.is_null_mx is True
    assert "Null MX" in result.reason


@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_no_mx_but_has_a(MockResolver: MagicMock) -> None:
    """NoAnswer on MX should fall through to A record check (RFC 5321 implicit MX)."""
    instance = MockResolver.return_value

    def _resolve(domain: str, rtype: str):
        if rtype == "MX":
            raise dns.resolver.NoAnswer()
        if rtype == "A":
            return [MagicMock()]
        raise dns.resolver.NoAnswer()

    instance.resolve.side_effect = _resolve
    result = check_dns("example.com")
    assert result.status == DNSStatus.HAS_A
    assert result.has_implicit_mx is True
    assert "example.com" in result.mx_hosts


@patch("backend.services.dns_checker.dns.resolver.Resolver")
def test_no_mx_but_has_aaaa(MockResolver: MagicMock) -> None:
    """NoAnswer on MX and A should fall through to AAAA record check."""
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
    assert result.has_implicit_mx is True


def test_empty_domain() -> None:
    result = check_dns("")
    assert result.status == DNSStatus.NO_RECORDS
