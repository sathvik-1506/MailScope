"""Tests for the syntax_checker service."""

import pytest
from backend.services.syntax_checker import check_syntax


@pytest.mark.parametrize(
    "address,expected_valid",
    [
        ("user@example.com", True),
        ("user+tag@sub.example.org", True),
        ("USER@EXAMPLE.COM", True),          # normalised by library
        ("", False),
        ("notanemail", False),
        ("missing@", False),
        ("@nodomain.com", False),
        ("double@@domain.com", False),
        ("spaces in@email.com", False),
    ],
)
def test_check_syntax(address: str, expected_valid: bool) -> None:
    result = check_syntax(address)
    assert result.valid == expected_valid, (
        f"Expected valid={expected_valid} for '{address}', got reason: {result.reason}"
    )


def test_check_syntax_normalises_address() -> None:
    result = check_syntax("User@Example.COM")
    assert result.valid
    assert result.normalized is not None
    # email-validator normalises domain to lowercase
    assert result.normalized.endswith("@example.com")


def test_check_syntax_invalid_returns_no_normalised_form() -> None:
    result = check_syntax("not-valid")
    assert result.normalized is None
    assert result.reason  # reason should be non-empty
