"""
SMTP verification service.

IMPORTANT – design constraints
================================
* This module NEVER sends any message (DATA command is NEVER called).
* SMTP checks are DISABLED by default. Callers must explicitly opt-in.
* Blocked connections, port-25 filters, and timeouts are treated as INCONCLUSIVE,
  not as evidence of a bounce.
* The check uses RCPT TO probe only and immediately issues QUIT.
* Arbitrary user-supplied SMTP hosts or IP addresses are strictly rejected;
  the host must be identified from DNS resolution.
"""

from __future__ import annotations

import ipaddress
import smtplib
import socket
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


_HELO_DOMAIN = "mailscope.local"
_SENDER = "verify@mailscope.local"
_DEFAULT_TIMEOUT_SECONDS = 5.0
_MAX_TIMEOUT_SECONDS = 10.0


def _is_restricted_target(host: str) -> tuple[bool, str]:
    """Check whether host is or resolves to a private, loopback, or reserved IP (SSRF prevention)."""
    # 1. Direct IP check
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            return True, f"Target IP {ip} is in a restricted or private range."
        return False, ""
    except ValueError:
        pass

    # 2. Hostname DNS resolution check
    try:
        addr_info = socket.getaddrinfo(host, 25, proto=socket.IPPROTO_TCP)
        if not addr_info:
            return True, "Target host could not be resolved."
        for entry in addr_info:
            sockaddr = entry[4]
            ip_str = sockaddr[0]
            try:
                ip = ipaddress.ip_address(ip_str)
                if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
                    return True, f"Target host resolves to restricted IP {ip}."
            except ValueError:
                continue
    except (socket.gaierror, socket.herror) as e:
        return True, f"Target host address resolution failed: {e}"
    except Exception as e:
        return True, f"Target host address validation error: {e}"

    return False, ""


def check_smtp(
    address: str,
    mx_host: str,
    *,
    enabled: bool = False,
    timeout: float = _DEFAULT_TIMEOUT_SECONDS,
) -> SMTPResult:
    """Probe *mx_host* to verify that *address* might be deliverable.

    Never issues the DATA command or sends message content.

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

    # Validate mx_host is present and not arbitrary raw IP / malformed
    clean_host = (mx_host or "").strip().rstrip(".")
    if not clean_host or "/" in clean_host or clean_host.startswith("-"):
        return SMTPResult(
            status=SMTPStatus.INCONCLUSIVE,
            address=address,
            reason="Invalid or missing MX host; cannot perform SMTP probe.",
        )

    # SSRF Protection: verify target does not resolve to private, loopback, or cloud-metadata IPs
    is_restricted, restriction_msg = _is_restricted_target(clean_host)
    if is_restricted:
        return SMTPResult(
            status=SMTPStatus.INCONCLUSIVE,
            address=address,
            is_blocked=True,
            reason=f"Target host rejected for security: {restriction_msg}",
        )

    bounded_timeout = min(max(1.0, float(timeout)), _MAX_TIMEOUT_SECONDS)

    smtp: smtplib.SMTP | None = None
    try:
        smtp = smtplib.SMTP(timeout=bounded_timeout)
        smtp.connect(clean_host, 25)

        # EHLO with fallback to HELO
        try:
            smtp.ehlo(_HELO_DOMAIN)
        except smtplib.SMTPException:
            smtp.helo(_HELO_DOMAIN)

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
                reason=f"Server responded {code}: {message_str}",
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
        return SMTPResult(
            status=SMTPStatus.INCONCLUSIVE,
            address=address,
            is_timeout=True,
            reason=f"Connection timed out (inconclusive): {exc}",
        )
    except (smtplib.SMTPConnectError, ConnectionRefusedError, OSError) as exc:
        return SMTPResult(
            status=SMTPStatus.INCONCLUSIVE,
            address=address,
            is_blocked=True,
            reason=f"Connection issue or blocked port 25 (inconclusive): {exc}",
        )
    except smtplib.SMTPException as exc:
        return SMTPResult(
            status=SMTPStatus.INCONCLUSIVE,
            address=address,
            reason=f"SMTP protocol error (inconclusive): {exc}",
        )
    finally:
        if smtp is not None:
            try:
                smtp.quit()
            except Exception:
                try:
                    smtp.close()
                except Exception:
                    pass
