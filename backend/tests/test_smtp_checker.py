"""
Tests for the smtp_checker service with mocked socket and SMTP interactions,
including SSRF mitigation, timeout handling, and port-25 block detection.
"""

from unittest.mock import MagicMock, patch
import socket
import smtplib

from backend.services.smtp_checker import check_smtp, SMTPStatus, _is_restricted_target

_MOCK_PUBLIC_ADDRINFO = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 25))]


def test_smtp_disabled_by_default() -> None:
    result = check_smtp("user@example.com", "mail.example.com")
    assert result.status == SMTPStatus.DISABLED
    assert "disabled" in result.reason.lower()


def test_smtp_explicit_disabled() -> None:
    result = check_smtp("user@example.com", "mail.example.com", enabled=False)
    assert result.status == SMTPStatus.DISABLED


def test_smtp_invalid_host() -> None:
    result = check_smtp("user@example.com", "", enabled=True)
    assert result.status == SMTPStatus.INCONCLUSIVE
    assert "Invalid or missing MX host" in result.reason


@patch("backend.services.smtp_checker.socket.getaddrinfo", return_value=_MOCK_PUBLIC_ADDRINFO)
@patch("backend.services.smtp_checker.smtplib.SMTP")
def test_smtp_accepted(mock_smtp_class: MagicMock, _mock_addrinfo: MagicMock) -> None:
    mock_instance = MagicMock()
    mock_smtp_class.return_value = mock_instance
    mock_instance.rcpt.return_value = (250, b"2.1.5 Recipient OK")

    result = check_smtp("user@example.com", "mx1.example.com", enabled=True)
    assert result.status == SMTPStatus.ACCEPTED
    assert result.smtp_code == 250
    assert "250" in result.reason

    # Verify DATA was NEVER called
    assert not hasattr(mock_instance, "data") or not mock_instance.data.called
    # Verify QUIT was called
    mock_instance.quit.assert_called_once()


@patch("backend.services.smtp_checker.socket.getaddrinfo", return_value=_MOCK_PUBLIC_ADDRINFO)
@patch("backend.services.smtp_checker.smtplib.SMTP")
def test_smtp_rejected(mock_smtp_class: MagicMock, _mock_addrinfo: MagicMock) -> None:
    mock_instance = MagicMock()
    mock_smtp_class.return_value = mock_instance
    mock_instance.rcpt.return_value = (550, b"5.1.1 User unknown")

    result = check_smtp("nonexistent@example.com", "mx1.example.com", enabled=True)
    assert result.status == SMTPStatus.REJECTED
    assert result.smtp_code == 550
    assert "rejected" in result.reason.lower()


@patch("backend.services.smtp_checker.socket.getaddrinfo", return_value=_MOCK_PUBLIC_ADDRINFO)
@patch("backend.services.smtp_checker.smtplib.SMTP")
def test_smtp_greylisting_inconclusive(mock_smtp_class: MagicMock, _mock_addrinfo: MagicMock) -> None:
    mock_instance = MagicMock()
    mock_smtp_class.return_value = mock_instance
    mock_instance.rcpt.return_value = (451, b"4.7.1 Greylisting in action")

    result = check_smtp("user@example.com", "mx1.example.com", enabled=True)
    assert result.status == SMTPStatus.INCONCLUSIVE
    assert result.smtp_code == 451


@patch("backend.services.smtp_checker.socket.getaddrinfo", return_value=_MOCK_PUBLIC_ADDRINFO)
@patch("backend.services.smtp_checker.smtplib.SMTP")
def test_smtp_timeout_inconclusive(mock_smtp_class: MagicMock, _mock_addrinfo: MagicMock) -> None:
    mock_instance = MagicMock()
    mock_smtp_class.return_value = mock_instance
    mock_instance.connect.side_effect = socket.timeout("Timed out")

    result = check_smtp("user@example.com", "mx1.example.com", enabled=True)
    assert result.status == SMTPStatus.INCONCLUSIVE
    assert result.is_timeout is True
    assert "timed out" in result.reason.lower()


@patch("backend.services.smtp_checker.socket.getaddrinfo", return_value=_MOCK_PUBLIC_ADDRINFO)
@patch("backend.services.smtp_checker.smtplib.SMTP")
def test_smtp_connection_refused_or_blocked(mock_smtp_class: MagicMock, _mock_addrinfo: MagicMock) -> None:
    mock_instance = MagicMock()
    mock_smtp_class.return_value = mock_instance
    mock_instance.connect.side_effect = ConnectionRefusedError("Connection refused")

    result = check_smtp("user@example.com", "mx1.example.com", enabled=True)
    assert result.status == SMTPStatus.INCONCLUSIVE
    assert result.is_blocked is True
    assert "blocked" in result.reason.lower() or "connection" in result.reason.lower()


# ==============================================================================
# SSRF and Malicious Destination Protection Tests
# ==============================================================================

def test_ssrf_rejects_loopback_ip_literal() -> None:
    result = check_smtp("user@example.com", "127.0.0.1", enabled=True)
    assert result.status == SMTPStatus.INCONCLUSIVE
    assert result.is_blocked is True
    assert "restricted" in result.reason.lower()


def test_ssrf_rejects_private_ip_literal() -> None:
    for private_ip in ("10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254"):
        result = check_smtp("user@example.com", private_ip, enabled=True)
        assert result.status == SMTPStatus.INCONCLUSIVE
        assert result.is_blocked is True
        assert "restricted" in result.reason.lower()


@patch("backend.services.smtp_checker.socket.getaddrinfo")
def test_ssrf_rejects_hostname_resolving_to_loopback(mock_addrinfo: MagicMock) -> None:
    mock_addrinfo.return_value = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 25))]
    result = check_smtp("user@example.com", "internal-loopback.local", enabled=True)
    assert result.status == SMTPStatus.INCONCLUSIVE
    assert result.is_blocked is True
    assert "restricted" in result.reason.lower()


@patch("backend.services.smtp_checker.socket.getaddrinfo")
def test_ssrf_rejects_hostname_resolving_to_cloud_metadata(mock_addrinfo: MagicMock) -> None:
    mock_addrinfo.return_value = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("169.254.169.254", 25))]
    result = check_smtp("user@example.com", "metadata.aws.internal", enabled=True)
    assert result.status == SMTPStatus.INCONCLUSIVE
    assert result.is_blocked is True
    assert "restricted" in result.reason.lower()


@patch("backend.services.smtp_checker.socket.getaddrinfo")
def test_smtp_dns_resolution_failure_is_inconclusive(mock_addrinfo: MagicMock) -> None:
    mock_addrinfo.side_effect = socket.gaierror(11001, "getaddrinfo failed")
    result = check_smtp("user@example.com", "unresolvable-mx.example.org", enabled=True)
    assert result.status == SMTPStatus.INCONCLUSIVE
    assert "resolution failed" in result.reason.lower()
