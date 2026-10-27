"""
Services package for Mailora backend.
"""

from .syntax_checker import check_syntax, SyntaxResult
from .dns_checker import check_dns, DNSResult, DNSStatus
from .smtp_checker import check_smtp, SMTPResult, SMTPStatus
from .classifier import classify, ClassificationResult, Verdict, ReasonCode
from .schemas import (
    validate_analysis_request,
    AnalysisRequestPayload,
    APIValidationError,
    mask_email_for_logging,
    DEFAULT_MAX_BATCH_SIZE,
)

__all__ = [
    "check_syntax",
    "SyntaxResult",
    "check_dns",
    "DNSResult",
    "DNSStatus",
    "check_smtp",
    "SMTPResult",
    "SMTPStatus",
    "classify",
    "ClassificationResult",
    "Verdict",
    "ReasonCode",
    "validate_analysis_request",
    "AnalysisRequestPayload",
    "APIValidationError",
    "mask_email_for_logging",
    "DEFAULT_MAX_BATCH_SIZE",
]
