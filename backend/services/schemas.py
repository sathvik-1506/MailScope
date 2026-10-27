"""
Input validation, data schemas, and serialization for the Mailora API.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

# Default batch limit to protect backend resources and network saturation
DEFAULT_MAX_BATCH_SIZE = 100
MAX_ADDRESS_LENGTH = 320  # RFC 5321 max path length (64 local + 1 @ + 255 domain)


class APIValidationError(Exception):
    """Raised when an incoming API request payload violates schema constraints."""

    def __init__(self, message: str, code: str = "INVALID_REQUEST", status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


@dataclass(frozen=True)
class AnalysisRequestPayload:
    addresses: list[str]
    smtp_enabled: bool = False


def get_max_batch_size() -> int:
    """Returns the maximum permitted address batch size from environment or default."""
    try:
        return int(os.environ.get("MAX_BATCH_SIZE", DEFAULT_MAX_BATCH_SIZE))
    except (ValueError, TypeError):
        return DEFAULT_MAX_BATCH_SIZE


def validate_analysis_request(data: Any) -> AnalysisRequestPayload:
    """Validates and parses the JSON request payload for `/api/analyze`.

    Raises:
        APIValidationError: If the payload is malformed or violates constraints.
    """
    if data is None:
        raise APIValidationError("Request body must be a valid JSON object.", code="MISSING_JSON")

    if not isinstance(data, dict):
        raise APIValidationError("JSON payload must be an object.", code="INVALID_PAYLOAD_TYPE")

    if "addresses" not in data:
        raise APIValidationError("Missing required field 'addresses' in JSON payload.", code="MISSING_ADDRESSES")

    raw_addresses = data["addresses"]
    if not isinstance(raw_addresses, list):
        raise APIValidationError("Field 'addresses' must be a list of strings.", code="INVALID_ADDRESSES_TYPE")

    if len(raw_addresses) == 0:
        raise APIValidationError("The 'addresses' list cannot be empty.", code="EMPTY_BATCH")

    max_batch = get_max_batch_size()
    if len(raw_addresses) > max_batch:
        raise APIValidationError(
            f"Batch size of {len(raw_addresses)} exceeds maximum limit of {max_batch}.",
            code="BATCH_SIZE_EXCEEDED",
            status_code=413,
        )

    validated_addresses: list[str] = []
    for idx, item in enumerate(raw_addresses):
        if not isinstance(item, str):
            raise APIValidationError(
                f"Item at index {idx} in 'addresses' must be a string, got {type(item).__name__}.",
                code="INVALID_ADDRESS_ITEM",
            )
        stripped = item.strip()
        if len(stripped) == 0:
            raise APIValidationError(
                f"Item at index {idx} in 'addresses' cannot be empty or whitespace only.",
                code="EMPTY_ADDRESS_ITEM",
            )
        if len(stripped) > MAX_ADDRESS_LENGTH:
            raise APIValidationError(
                f"Address at index {idx} exceeds maximum length of {MAX_ADDRESS_LENGTH} characters.",
                code="ADDRESS_TOO_LONG",
            )
        validated_addresses.append(stripped)

    # Validate optional smtp_enabled flag
    smtp_enabled = False
    if "smtp_enabled" in data:
        val = data["smtp_enabled"]
        if not isinstance(val, bool):
            raise APIValidationError("Field 'smtp_enabled' must be a boolean.", code="INVALID_SMTP_FLAG")
        smtp_enabled = val

    return AnalysisRequestPayload(addresses=validated_addresses, smtp_enabled=smtp_enabled)


def mask_email_for_logging(address: str) -> str:
    """Masks an email address for privacy-safe logging (e.g. 'j***@example.com')."""
    if "@" not in address:
        return "***"
    local, domain = address.split("@", 1)
    masked_local = (local[0] + "***") if local else "***"
    return f"{masked_local}@{domain}"
