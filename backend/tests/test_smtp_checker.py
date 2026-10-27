"""
Comprehensive tests for the smtp_checker service.

Covers:
- Public destination accepted
- Loopback destination rejected
- Private and link-local destinations rejected
- DNS answer changes between resolution and connection (TOCTOU rebinding defense)
- Validated IP differs from the actual socket destination
- Connection timeout
- Connection refusal
- Unexpected SMTP responses (451 greylisting, 550 rejection, 500 unexpected)
- SMTP disabled configuration (default and explicit)
- Connection cleanup on success and failure paths
- Verification that no SMTP DATA command is ever sent
- Multiple public IP candidates fallback
- Hybrid candidate lists failing closed
- Arbitrary user-supplied hosts/URLs/IPs rejected
"""

from unittest.mock import MagicMock, patch
import socket
import smtplib

import pytest

from backend.services.smtp_checker import (
    check_smtp,
    SMTPStatus,
    SafeSMTP,
    is_prohibited_ip,
    validate_mx_host_format,
    resolve_mx_candidate_ips,
)

_MOCK_PUBLIC_ADDRINFO = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 25))]


def _build_mock_socket(peer_ip: str = "93.184.216.34", response_code: int = 250):
    """Create a mock socket that handles SMTP handshake greetings and RCPT responses."""
    sock = MagicMock()
    sock.getpeername.return_value = (peer_ip, 25)

    # Initial 220 banner, EHLO 250 response, MAIL 250 response, RCPT response, QUIT 221 response
    responses = [
        b"220 mail.example.com ESMTP MailScope\r\n",
        b"250 mail.example.com\r\n",
        b"250 2.1.0 Sender OK\r\n",
        f"{response_code} Recipient outcome\r\n".encode("utf-8"),
        b"221 2.0.0 Bye\r\n",
    ]
    file_mock = MagicMock()
    file_mock.readline.side_effect = responses
    sock.makefile.return_value = file_mock
    return sock


# ==============================================================================
# 1. SMTP Disabled Configuration (Default and Explicit)
# ==============================================================================

def test_smtp_disabled_by_default() -> None:
    result = check_smtp("user@example.com", "mail.example.com")
    assert result.status == SMTPStatus.DISABLED
    assert "disabled" in result.reason.lower()


def test_smtp_explicit_disabled() -> None:
    result = check_smtp("user@example.com", "mail.example.com", enabled=False)
    assert result.status == SMTPStatus.DISABLED


# ==============================================================================
# 2. Public Destination Accepted & No DATA Command Sent
# ==============================================================================

@patch("backend.services.smtp_checker.socket.getaddrinfo", return_value=_MOCK_PUBLIC_ADDRINFO)
@patch("backend.services.smtp_checker.socket.create_connection")
def test_public_destination_accepted(mock_create_conn: MagicMock, _mock_addrinfo: MagicMock) -> None:
    mock_sock = _build_mock_socket(peer_ip="93.184.216.34", response_code=250)
    mock_create_conn.return_value = mock_sock

    result = check_smtp("user@example.com", "mx1.example.com", enabled=True)
    assert result.status == SMTPStatus.ACCEPTED
    assert result.smtp_code == 250
    assert "250" in result.reason

    # Verify socket was connected directly to the validated IP, not the hostname
    mock_create_conn.assert_called_once()
    assert mock_create_conn.call_args[0][0] == ("93.184.216.34", 25)

    # Verify DATA was NEVER called or sent over the socket
    sent_commands = [call[0][0] for call in mock_sock.sendall.call_args_list if call[0]]
    for cmd in sent_commands:
        assert not cmd.upper().startswith(b"DATA")

    # Verify QUIT was sent to close the session cleanly
    assert any(b"QUIT" in cmd.upper() for cmd in sent_commands)


# ==============================================================================
# 3. Prohibited Destinations (Loopback, Private, Link-Local, IPv4-Mapped)
# ==============================================================================

def test_loopback_destination_rejected_literal() -> None:
    result = check_smtp("user@example.com", "127.0.0.1", enabled=True)
    assert result.status == SMTPStatus.INCONCLUSIVE
    assert result.is_blocked is True
    assert "prohibited" in result.reason.lower()


@patch("backend.services.smtp_checker.socket.getaddrinfo")
def test_loopback_destination_rejected_resolution(mock_addrinfo: MagicMock) -> None:
    mock_addrinfo.return_value = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 25))]
    result = check_smtp("user@example.com", "loopback.local", enabled=True)
    assert result.status == SMTPStatus.INCONCLUSIVE
    assert result.is_blocked is True
    assert "prohibited" in result.reason.lower()


@patch("backend.services.smtp_checker.socket.getaddrinfo")
def test_ipv6_loopback_rejected(mock_addrinfo: MagicMock) -> None:
    mock_addrinfo.return_value = [(socket.AF_INET6, socket.SOCK_STREAM, 6, "", ("::1", 25, 0, 0))]
    result = check_smtp("user@example.com", "ipv6-loopback.local", enabled=True)
    assert result.status == SMTPStatus.INCONCLUSIVE
    assert result.is_blocked is True


@pytest.mark.parametrize("private_ip", [
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",   # AWS / GCP metadata link-local
    "::ffff:127.0.0.1", # IPv4-mapped loopback
    "::ffff:10.0.0.1",   # IPv4-mapped private
    "0.0.0.0",
    "240.0.0.1",        # Reserved
])
def test_private_and_link_local_destinations_rejected(private_ip: str) -> None:
    # Test as direct rejected candidate
    with patch("backend.services.smtp_checker.socket.getaddrinfo") as mock_addrinfo:
        mock_addrinfo.return_value = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (private_ip, 25))]
        result = check_smtp("user@example.com", f"mail-{private_ip.replace(':', '-')}.internal", enabled=True)
        assert result.status == SMTPStatus.INCONCLUSIVE
        assert result.is_blocked is True
        assert "prohibited" in result.reason.lower() or "rejected" in result.reason.lower()


# ==============================================================================
# 4. Anti-DNS Rebinding (TOCTOU): Socket Connects to Validated IP
# ==============================================================================

def test_dns_answer_changes_between_resolution_and_connection() -> None:
    """Verifies that the connection connects to the pre-validated IP and cannot be rebound."""
    resolution_ip = "93.184.216.34"
    rebound_ip = "127.0.0.1"

    # Simulate getaddrinfo returning public IP first, and if called again returning loopback
    addrinfo_calls = [
        [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (resolution_ip, 25))],
        [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (rebound_ip, 25))],
    ]

    with patch("backend.services.smtp_checker.socket.getaddrinfo", side_effect=addrinfo_calls):
        with patch("backend.services.smtp_checker.socket.create_connection") as mock_conn:
            mock_sock = _build_mock_socket(peer_ip=resolution_ip, response_code=250)
            mock_conn.return_value = mock_sock

            result = check_smtp("user@example.com", "rebinding.attacker.com", enabled=True)
            assert result.status == SMTPStatus.ACCEPTED

            # Crucial assertion: the socket connected to resolution_ip ('93.184.216.34'), NEVER to rebound_ip ('127.0.0.1')
            mock_conn.assert_called_once()
            connected_dest = mock_conn.call_args[0][0]
            assert connected_dest[0] == resolution_ip
            assert connected_dest[0] != rebound_ip


# ==============================================================================
# 5. Validated IP Differs from Actual Socket Destination (Socket Interception)
# ==============================================================================

@patch("backend.services.smtp_checker.socket.getaddrinfo", return_value=_MOCK_PUBLIC_ADDRINFO)
@patch("backend.services.smtp_checker.socket.create_connection")
def test_validated_ip_differs_from_actual_socket_destination(
    mock_create_conn: MagicMock,
    _mock_addrinfo: MagicMock,
) -> None:
    """If the connected socket's getpeername does not match the validated target, fail closed."""
    # Target was validated as 93.184.216.34, but socket peer reports 127.0.0.1 (diversion)
    diverted_sock = _build_mock_socket(peer_ip="127.0.0.1", response_code=250)
    mock_create_conn.return_value = diverted_sock

    result = check_smtp("user@example.com", "mx1.example.com", enabled=True)
    assert result.status == SMTPStatus.INCONCLUSIVE
    assert result.is_blocked is True

    # Confirm diverted socket was closed immediately
    diverted_sock.close.assert_called()


# ==============================================================================
# 6. Connection Timeout & Refusal
# ==============================================================================

@patch("backend.services.smtp_checker.socket.getaddrinfo", return_value=_MOCK_PUBLIC_ADDRINFO)
@patch("backend.services.smtp_checker.socket.create_connection")
def test_connection_timeout(mock_create_conn: MagicMock, _mock_addrinfo: MagicMock) -> None:
    mock_create_conn.side_effect = socket.timeout("Timed out connecting to port 25")

    result = check_smtp("user@example.com", "mx1.example.com", enabled=True)
    assert result.status == SMTPStatus.INCONCLUSIVE
    assert result.is_timeout is True
    assert "timed out" in result.reason.lower()


@patch("backend.services.smtp_checker.socket.getaddrinfo", return_value=_MOCK_PUBLIC_ADDRINFO)
@patch("backend.services.smtp_checker.socket.create_connection")
def test_connection_refusal(mock_create_conn: MagicMock, _mock_addrinfo: MagicMock) -> None:
    mock_create_conn.side_effect = ConnectionRefusedError("Connection refused on port 25")

    result = check_smtp("user@example.com", "mx1.example.com", enabled=True)
    assert result.status == SMTPStatus.INCONCLUSIVE
    assert result.is_blocked is True
    assert "refused" in result.reason.lower() or "blocked" in result.reason.lower()


# ==============================================================================
# 7. Unexpected SMTP Responses (550 Rejection, 451 Greylisting, 500 Protocol Error)
# ==============================================================================

@patch("backend.services.smtp_checker.socket.getaddrinfo", return_value=_MOCK_PUBLIC_ADDRINFO)
@patch("backend.services.smtp_checker.socket.create_connection")
def test_smtp_rejected_550(mock_create_conn: MagicMock, _mock_addrinfo: MagicMock) -> None:
    mock_sock = _build_mock_socket(peer_ip="93.184.216.34", response_code=550)
    mock_create_conn.return_value = mock_sock

    result = check_smtp("nonexistent@example.com", "mx1.example.com", enabled=True)
    assert result.status == SMTPStatus.REJECTED
    assert result.smtp_code == 550
    assert "rejected" in result.reason.lower()


@patch("backend.services.smtp_checker.socket.getaddrinfo", return_value=_MOCK_PUBLIC_ADDRINFO)
@patch("backend.services.smtp_checker.socket.create_connection")
def test_smtp_greylisting_451(mock_create_conn: MagicMock, _mock_addrinfo: MagicMock) -> None:
    mock_sock = _build_mock_socket(peer_ip="93.184.216.34", response_code=451)
    mock_create_conn.return_value = mock_sock

    result = check_smtp("user@example.com", "mx1.example.com", enabled=True)
    assert result.status == SMTPStatus.INCONCLUSIVE
    assert result.smtp_code == 451
    assert "temporary" in result.reason.lower() or "greylisting" in result.reason.lower()


@patch("backend.services.smtp_checker.socket.getaddrinfo", return_value=_MOCK_PUBLIC_ADDRINFO)
@patch("backend.services.smtp_checker.socket.create_connection")
def test_smtp_unexpected_code_500(mock_create_conn: MagicMock, _mock_addrinfo: MagicMock) -> None:
    mock_sock = _build_mock_socket(peer_ip="93.184.216.34", response_code=500)
    mock_create_conn.return_value = mock_sock

    result = check_smtp("user@example.com", "mx1.example.com", enabled=True)
    assert result.status == SMTPStatus.INCONCLUSIVE
    assert result.smtp_code == 500


# ==============================================================================
# 8. Connection Cleanup on Success and Failure Paths
# ==============================================================================

@patch("backend.services.smtp_checker.socket.getaddrinfo", return_value=_MOCK_PUBLIC_ADDRINFO)
@patch("backend.services.smtp_checker.socket.create_connection")
def test_connection_cleanup_on_success(mock_create_conn: MagicMock, _mock_addrinfo: MagicMock) -> None:
    mock_sock = _build_mock_socket(peer_ip="93.184.216.34", response_code=250)
    mock_create_conn.return_value = mock_sock

    check_smtp("user@example.com", "mx1.example.com", enabled=True)
    # Socket or SMTP session closed
    mock_sock.close.assert_called()


@patch("backend.services.smtp_checker.socket.getaddrinfo", return_value=_MOCK_PUBLIC_ADDRINFO)
@patch("backend.services.smtp_checker.socket.create_connection")
def test_connection_cleanup_on_exception(mock_create_conn: MagicMock, _mock_addrinfo: MagicMock) -> None:
    mock_sock = _build_mock_socket(peer_ip="93.184.216.34", response_code=250)
    mock_sock.makefile.return_value.readline.side_effect = smtplib.SMTPServerDisconnected("Disconnected")
    mock_create_conn.return_value = mock_sock

    result = check_smtp("user@example.com", "mx1.example.com", enabled=True)
    assert result.status == SMTPStatus.INCONCLUSIVE
    mock_sock.close.assert_called()


# ==============================================================================
# 9. Multiple Candidates & Hybrid Lists (Fail-Closed)
# ==============================================================================

@patch("backend.services.smtp_checker.socket.getaddrinfo")
@patch("backend.services.smtp_checker.socket.create_connection")
def test_multiple_public_ip_candidates_fallback(
    mock_create_conn: MagicMock,
    mock_addrinfo: MagicMock,
) -> None:
    """When first public candidate fails, second public candidate is tried and succeeds."""
    mock_addrinfo.return_value = [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 25)),
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.35", 25)),
    ]

    sock_primary = _build_mock_socket("93.184.216.34", 250)
    sock_secondary = _build_mock_socket("93.184.216.35", 250)

    # First IP connection refused; second succeeds
    mock_create_conn.side_effect = [
        ConnectionRefusedError("Connection refused on 93.184.216.34"),
        sock_secondary,
    ]

    result = check_smtp("user@example.com", "multi-mx.example.com", enabled=True)
    assert result.status == SMTPStatus.ACCEPTED
    assert mock_create_conn.call_count == 2
    assert mock_create_conn.call_args_list[0][0][0] == ("93.184.216.34", 25)
    assert mock_create_conn.call_args_list[1][0][0] == ("93.184.216.35", 25)


@patch("backend.services.smtp_checker.socket.getaddrinfo")
def test_hybrid_candidates_with_one_prohibited_fails_closed(mock_addrinfo: MagicMock) -> None:
    """If a host resolves to a public IP AND a loopback/private IP, fail closed."""
    mock_addrinfo.return_value = [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 25)),
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 25)),
    ]

    result = check_smtp("user@example.com", "hybrid.attacker.com", enabled=True)
    assert result.status == SMTPStatus.INCONCLUSIVE
    assert result.is_blocked is True
    assert "prohibited" in result.reason.lower()


# ==============================================================================
# 10. Arbitrary User-Supplied Hosts, URLs, and Ports Rejected
# ==============================================================================

@pytest.mark.parametrize("invalid_host", [
    "",
    "   ",
    "http://mail.example.com",
    "https://mail.example.com/smtp",
    "mail.example.com:25",
    "-invalid-prefix.com",
    "host with spaces.com",
    "93.184.216.34",    # Direct IP literal rejected as MX host
    "2606:2800:220:1:248:1893:25c8:1946",
])
def test_arbitrary_user_supplied_host_or_url_rejected(invalid_host: str) -> None:
    result = check_smtp("user@example.com", invalid_host, enabled=True)
    assert result.status == SMTPStatus.INCONCLUSIVE
    assert "invalid" in result.reason.lower() or "prohibited" in result.reason.lower() or "malformed" in result.reason.lower()
