"""
Syntax validation service.

Uses the `email-validator` library for RFC-compliant address parsing.
Returns structured evidence rather than a bare boolean so that callers
can surface the reason for any rejection to end-users.
"""

from __future__ import annotations

from dataclasses import dataclass

from email_validator import validate_email, EmailNotValidError


@dataclass(frozen=True)
class SyntaxResult:
    valid: bool
    normalized: str | None  # None when invalid
    original: str
    reason: str  # human-readable explanation
    local_part: str | None = None
    domain: str | None = None


def check_syntax(address: str) -> SyntaxResult:
    """Validate RFC 5321/5322 syntax for *address*.

    Args:
        address: Raw email address string provided by the caller.

    Returns:
        A :class:`SyntaxResult` describing whether the address is
        syntactically valid and, if so, its normalised form and domain.
    """
    try:
        info = validate_email(address, check_deliverability=False)
        # Extract ASCII domain if available, fallback to domain
        domain = getattr(info, "ascii_domain", None) or getattr(info, "domain", None)
        clean_domain = domain.rstrip(".") if domain else None
        local_part = getattr(info, "local_part", None)
        return SyntaxResult(
            valid=True,
            normalized=info.normalized,
            original=address,
            reason="Address passes RFC 5321/5322 syntax checks.",
            local_part=local_part,
            domain=clean_domain,
        )
    except EmailNotValidError as exc:
        return SyntaxResult(
            valid=False,
            normalized=None,
            original=address,
            reason=str(exc),
            local_part=None,
            domain=None,
        )
