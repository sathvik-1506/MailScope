"""
SMTP verification service with anti-TOCTOU and DNS-rebinding defense.

IMPORTANT – design constraints
================================
* This module NEVER sends any message (DATA command is NEVER called).
* SMTP checks are DISABLED by default. Callers must explicitly opt-in.
* Blocked connections, port-25 filters, and timeouts are treated as INCONCLUSIVE,
  not as evidence of a bounce.
* The check uses RCPT TO probe only and immediately issues QUIT.
* Arbitrary user-supplied SMTP hosts, URLs, or IP addresses are strictly rejected;
  the host must be identified from DNS resolution.
* Anti-DNS Rebinding (TOCTOU): The destination IP is validated against prohibited
  ranges (loopback, private, link-local, multicast, reserved) and the socket connects
  directly to that pre-validated IP address without re-resolving the hostname.
* Post-connection destination verification: The actual connected socket peer IP is
  verified to match the validated target IP before any SMTP commands are exchanged.
* Preserves original hostname for EHLO and TLS certificate verification.
"""

from __future__ import annotations

import ipaddress
import smtplib
import socket
import ssl
from dataclasses import dataclass
from enum import Enum


class SMTPStatus(str, Enum):
    ACCEPTED = "accepted"          # server confirmed the recipient probe
    REJECTED = "rejected"          # server explicitly rejected the recipient
    INCONCLUSIVE = "inconclusive"  # blocked / timeout / greylisted / temp failure
    DISABLED = "disabled"          # SMTP checks not enabled


@dataclass(frozen=True)
class SMTPResult:
    status: SMTPStatus
    address: str
    smtp_code: int | None = None
    reason: str = ""
    is_timeout: bool = False
    is_blocked: bool = False


_HELO_DOMAIN = "mailora.local"
_SENDER = "verify@mailora.local"
_DEFAULT_TIMEOUT_SECONDS = 5.0
_MAX_TIMEOUT_SECONDS = 10.0


def is_prohibited_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Check whether *ip* is in a prohibited or non-globally routable address range."""
    # Unpack IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1)
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped

    return (
        not ip.is_global
        or ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def validate_mx_host_format(mx_host: str) -> tuple[bool, str, str]:
    """Validate MX hostname format.

    Rejects IP literals, URLs, port specifications, and malformed names.
    Returns:
        (is_valid, clean_host, error_reason)
    """
    clean_host = (mx_host or "").strip().rstrip(".")
    if not clean_host:
        return False, "", "Invalid or missing MX host; cannot perform SMTP probe."

    # Reject URLs, schemes, paths, port numbers, spaces, or invalid leading chars
    if any(char in clean_host for char in (":", "/", "\\", " ", "?", "#", "@")) or clean_host.startswith("-"):
        return False, clean_host, f"Malformed or prohibited MX host target: '{clean_host}'."

    # Direct IP addresses (IPv4 or IPv6) are prohibited as MX destinations
    try:
        ipaddress.ip_address(clean_host)
        return False, clean_host, f"Direct IP address '{clean_host}' is prohibited as an MX destination."
    except ValueError:
        pass

    # Basic hostname length checks (RFC 1123)
    if len(clean_host) > 253:
        return False, clean_host, f"MX hostname '{clean_host}' exceeds 253 characters."

    return True, clean_host, ""


def resolve_mx_candidate_ips(clean_host: str) -> tuple[list[str], str]:
    """Resolve *clean_host* to candidate IP addresses and validate against prohibited ranges.

    If ANY resolved address is prohibited (loopback, private, link-local, etc.),
    this function fails closed to prevent hybrid DNS rebinding / SSRF attacks.

    Returns:
        (valid_ip_list, error_reason)
    """
    try:
        addr_info = socket.getaddrinfo(clean_host, 25, proto=socket.IPPROTO_TCP)
        if not addr_info:
            return [], f"Target host '{clean_host}' could not be resolved."
    except (socket.gaierror, socket.herror) as exc:
        return [], f"Target host address resolution failed: {exc}"
    except Exception as exc:
        return [], f"Target host address validation error: {exc}"

    candidate_ips: list[str] = []
    seen_ips: set[str] = set()

    for entry in addr_info:
        sockaddr = entry[4]
        ip_str = sockaddr[0]
        try:
            ip_obj = ipaddress.ip_address(ip_str)
        except ValueError:
            return [], f"Host resolved to unparseable IP address: '{ip_str}'."

        if is_prohibited_ip(ip_obj):
            return [], f"Target host resolves to prohibited IP address ({ip_str}). Connection rejected."

        if ip_str not in seen_ips:
            seen_ips.add(ip_str)
            candidate_ips.append(ip_str)

    if not candidate_ips:
        return [], f"Target host '{clean_host}' has no valid public IP destinations."

    return candidate_ips, ""


class SafeSMTP(smtplib.SMTP):
    """SMTP client that connects directly to a pre-validated IP address,
    verifies the post-connection socket destination, and preserves the
    original hostname for EHLO and TLS certificate verification.
    """

    def __init__(
        self,
        target_ip: str,
        host_name: str,
        timeout: float = _DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        super().__init__(timeout=timeout)
        self.target_ip = target_ip
        self.host_name = host_name
        self._host = host_name

    def _get_socket(self, host: str, port: int, timeout: float | None):
        if timeout is not None and not timeout:
            raise ValueError("Non-blocking socket (timeout=0) is not supported")

        # Connect directly to target_ip, preventing secondary DNS resolution (TOCTOU rebinding)
        sock = socket.create_connection((self.target_ip, port), timeout, self.source_address)

        # Confirm the actual socket destination matches the validated target IP
        try:
            peer = sock.getpeername()
            actual_ip_str = peer[0]
            actual_ip = ipaddress.ip_address(actual_ip_str)
        except Exception as exc:
            sock.close()
            raise OSError(f"Unable to verify socket peer destination: {exc}") from exc

        if is_prohibited_ip(actual_ip):
            sock.close()
            raise OSError(f"Socket connected to prohibited peer IP: {actual_ip_str}")

        if actual_ip_str != self.target_ip:
            sock.close()
            raise OSError(
                f"Socket destination mismatch: expected {self.target_ip}, got {actual_ip_str}"
            )

        return sock


def check_smtp(
    address: str,
    mx_host: str,
    *,
    enabled: bool = False,
    timeout: float = _DEFAULT_TIMEOUT_SECONDS,
) -> SMTPResult:
    """Probe *mx_host* to verify that *address* might be deliverable.

    Never issues the DATA command or sends message content.
    Prevents TOCTOU DNS rebinding by connecting directly to pre-validated IP addresses.

    Args:
        address: The full email address to probe.
        mx_host: MX hostname identified from authoritative DNS resolution.
        enabled: Must be ``True`` for the probe to run; defaults to ``False``.
        timeout: Connection timeout in seconds (bounded between 1.0 and 10.0).

    Returns:
        A :class:`SMTPResult` describing the observed recipient response.
    """
    if not enabled:
        return SMTPResult(
            status=SMTPStatus.DISABLED,
            address=address,
            reason="SMTP verification is disabled. Enable it explicitly if needed.",
        )

    # Validate host format (rejects IP literals, URLs, malformed strings)
    is_valid_format, clean_host, format_err = validate_mx_host_format(mx_host)
    if not is_valid_format:
        return SMTPResult(
            status=SMTPStatus.INCONCLUSIVE,
            address=address,
            is_blocked="prohibited" in format_err.lower(),
            reason=format_err,
        )

    # Resolve candidate IPs and validate every candidate address
    candidate_ips, resolution_err = resolve_mx_candidate_ips(clean_host)
    if not candidate_ips:
        return SMTPResult(
            status=SMTPStatus.INCONCLUSIVE,
            address=address,
            is_blocked="prohibited" in resolution_err.lower() or "rejected" in resolution_err.lower(),
            reason=f"Target host rejected for security: {resolution_err}",
        )

    bounded_timeout = min(max(1.0, float(timeout)), _MAX_TIMEOUT_SECONDS)
    per_target_timeout = max(1.0, min(bounded_timeout, _MAX_TIMEOUT_SECONDS / len(candidate_ips)))

    last_error_reason = ""
    is_any_timeout = False
    is_any_blocked = False

    for target_ip in candidate_ips:
        smtp: SafeSMTP | None = None
        try:
            smtp = SafeSMTP(target_ip=target_ip, host_name=clean_host, timeout=per_target_timeout)
            smtp.connect(clean_host, 25)

            # EHLO with fallback to HELO
            try:
                smtp.ehlo(_HELO_DOMAIN)
            except smtplib.SMTPException:
                smtp.helo(_HELO_DOMAIN)

            # Optional STARTTLS if announced, preserving hostname for certificate check
            if smtp.has_extn("starttls"):
                try:
                    smtp.starttls()
                    try:
                        smtp.ehlo(_HELO_DOMAIN)
                    except smtplib.SMTPException:
                        smtp.helo(_HELO_DOMAIN)
                except (smtplib.SMTPException, OSError, ssl.SSLError):
                    # Continue in cleartext probe if TLS fails
                    pass

            # Envelope sender
            smtp.mail(_SENDER)

            # Probe recipient envelope – NEVER ISSUE DATA!
            code, message = smtp.rcpt(address)
            message_str = message.decode(errors="replace") if isinstance(message, bytes) else str(message)

            if 200 <= code < 300:
                return SMTPResult(
                    status=SMTPStatus.ACCEPTED,
                    address=address,
                    smtp_code=code,
                    reason=f"Server acknowledged recipient probe ({code}): {message_str}",
                )
            elif code in (550, 551, 552, 553, 554):
                return SMTPResult(
                    status=SMTPStatus.REJECTED,
                    address=address,
                    smtp_code=code,
                    reason=f"Server rejected address with code {code}: {message_str}",
                )
            elif code in (421, 450, 451, 452):
                return SMTPResult(
                    status=SMTPStatus.INCONCLUSIVE,
                    address=address,
                    smtp_code=code,
                    reason=f"Server returned temporary status {code} (e.g. greylisting or rate-limit): {message_str}",
                )
            else:
                return SMTPResult(
                    status=SMTPStatus.INCONCLUSIVE,
                    address=address,
                    smtp_code=code,
                    reason=f"Non-definitive SMTP response {code}: {message_str}",
                )

        except (socket.timeout, TimeoutError) as exc:
            is_any_timeout = True
            last_error_reason = f"Connection to {target_ip}:25 timed out: {exc}"
        except (smtplib.SMTPConnectError, ConnectionRefusedError, OSError) as exc:
            is_any_blocked = True
            last_error_reason = f"Connection to {target_ip}:25 refused or blocked: {exc}"
        except smtplib.SMTPException as exc:
            last_error_reason = f"SMTP protocol error from {target_ip}: {exc}"
        finally:
            if smtp is not None:
                try:
                    smtp.quit()
                except Exception:
                    try:
                        smtp.close()
                    except Exception:
                        pass

    return SMTPResult(
        status=SMTPStatus.INCONCLUSIVE,
        address=address,
        is_timeout=is_any_timeout,
        is_blocked=is_any_blocked,
        reason=f"SMTP probe inconclusive across all candidates: {last_error_reason}",
    )
