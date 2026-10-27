"""
Mailora – Flask application entry point and verification API.
"""

from __future__ import annotations

import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any

from flask import Flask, jsonify, request
from flask_cors import CORS

from .services.syntax_checker import check_syntax
from .services.dns_checker import check_dns, DNSResult, DNSStatus
from .services.smtp_checker import check_smtp
from .services.classifier import classify, ClassificationResult
from .services.schemas import (
    validate_analysis_request,
    APIValidationError,
    mask_email_for_logging,
)
from .services.rate_limiter import get_rate_limiter, extract_client_ip
from .services.extractor import (
    ExtractionError,
    process_uploaded_files,
)

logger = logging.getLogger("mailora")


def get_max_content_length() -> int:
    """Returns the maximum permitted request body size in bytes (10MB default for document uploads)."""
    try:
        return int(os.environ.get("MAX_CONTENT_LENGTH", 10 * 1024 * 1024))
    except (ValueError, TypeError):
        return 10 * 1024 * 1024


def get_max_workers() -> int:
    """Returns the bounded thread pool concurrency limit per batch (1 to 20)."""
    try:
        limit = int(os.environ.get("MAX_CONCURRENT_WORKERS", 10))
        return max(1, min(limit, 20))
    except (ValueError, TypeError):
        return 10


def verify_single_address(
    address: str,
    smtp_enabled: bool = False,
    dns_cache: dict[str, DNSResult] | None = None,
) -> ClassificationResult:
    """Verifies a single email address across the multi-layer pipeline."""
    # 1. Syntax Check
    syntax = check_syntax(address)
    if not syntax.valid or not syntax.domain:
        return classify(syntax)

    # 2. DNS & Mail-Routing Analysis
    domain = syntax.domain
    if dns_cache is not None and domain in dns_cache:
        dns_res = dns_cache[domain]
    else:
        dns_res = check_dns(domain)
        if dns_cache is not None:
            dns_cache[domain] = dns_res

    # If DNS failed or found no records, classify immediately
    if dns_res.status in (DNSStatus.NO_RECORDS, DNSStatus.TIMEOUT, DNSStatus.SERVFAIL, DNSStatus.ERROR):
        return classify(syntax, dns=dns_res)

    # 3. Optional SMTP Verification
    if not smtp_enabled:
        smtp_res = check_smtp(syntax.normalized or address, mx_host="", enabled=False)
    else:
        mx_target = dns_res.mx_hosts[0] if dns_res.mx_hosts else ""
        smtp_res = check_smtp(syntax.normalized or address, mx_host=mx_target, enabled=bool(mx_target))

    # 4. Synthesize Final Classification
    return classify(syntax, dns=dns_res, smtp=smtp_res)


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = get_max_content_length()

    # Configure CORS: allow specific origin or comma-separated origins
    cors_origin_raw = os.environ.get("FRONTEND_ORIGIN") or os.environ.get("CORS_ORIGIN")
    is_production = os.environ.get("FLASK_ENV") == "production"

    if cors_origin_raw:
        origins = [orig.strip() for orig in cors_origin_raw.split(",") if orig.strip()]
    elif is_production:
        # In production, require explicit FRONTEND_ORIGIN; fail closed if unset
        origins = []
        logger.warning(
            "FRONTEND_ORIGIN is not configured in production. "
            "Browser cross-origin requests will be rejected until FRONTEND_ORIGIN is set."
        )
    else:
        origins = ["http://localhost:5173", "http://localhost:3000"]
    CORS(app, origins=origins)

    # ------------------------------------------------------------------
    # Error Handlers (Redacted to avoid disclosing server internals)
    # ------------------------------------------------------------------
    @app.errorhandler(APIValidationError)
    def handle_validation_error(exc: APIValidationError):
        return jsonify({"error": exc.message, "code": exc.code}), exc.status_code

    @app.errorhandler(ExtractionError)
    def handle_extraction_error(exc: ExtractionError):
        return jsonify({"error": exc.message, "code": exc.code}), exc.status_code

    @app.errorhandler(400)
    def handle_bad_request(exc: Any):
        # Do not expose internal python exception details to the public API
        return jsonify({"error": "Bad Request. Malformed or invalid request payload.", "code": "BAD_REQUEST"}), 400

    @app.errorhandler(404)
    def handle_not_found(exc: Any):
        return jsonify({"error": "Endpoint not found", "code": "NOT_FOUND"}), 404

    @app.errorhandler(405)
    def handle_method_not_allowed(exc: Any):
        return jsonify({"error": "Method not allowed for requested URL", "code": "METHOD_NOT_ALLOWED"}), 405

    @app.errorhandler(413)
    def handle_payload_too_large(exc: Any):
        return jsonify({"error": "Payload exceeds maximum permitted size", "code": "BATCH_SIZE_EXCEEDED"}), 413

    @app.errorhandler(415)
    def handle_unsupported_media_type(exc: Any):
        return jsonify({"error": "Request content-type must be application/json", "code": "UNSUPPORTED_MEDIA_TYPE"}), 415

    @app.errorhandler(429)
    def handle_rate_limit(exc: Any):
        return jsonify({
            "error": "Rate limit exceeded. Please wait before submitting additional verification requests.",
            "code": "RATE_LIMIT_EXCEEDED",
        }), 429

    @app.errorhandler(500)
    def handle_internal_error(exc: Any):
        logger.error(f"Internal error occurred: {exc}")
        return jsonify({"error": "An unexpected error occurred while processing the request", "code": "INTERNAL_ERROR"}), 500

    # ------------------------------------------------------------------
    # Security Response Headers
    # ------------------------------------------------------------------
    @app.after_request
    def apply_security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Cache-Control"] = "no-store, max-age=0"
        return response

    # ------------------------------------------------------------------
    # Health Endpoint
    # ------------------------------------------------------------------
    @app.get("/health")
    def health():
        return jsonify({
            "status": "ok",
            "service": "mailora-backend",
            "version": "1.0.0",
        })

    # ------------------------------------------------------------------
    # Email Deliverability Analysis Endpoint
    # ------------------------------------------------------------------
    def _handle_analyze():
        # 1. Rate Limiting Check
        client_ip = extract_client_ip(request)
        is_limited, retry_after, remaining = get_rate_limiter().check(client_ip)
        if is_limited:
            resp = jsonify({
                "error": "Rate limit exceeded. Please wait before submitting additional verification requests.",
                "code": "RATE_LIMIT_EXCEEDED",
                "retry_after": retry_after,
            })
            resp.status_code = 429
            resp.headers["Retry-After"] = str(retry_after)
            resp.headers["X-RateLimit-Limit"] = str(get_rate_limiter().get_limit())
            resp.headers["X-RateLimit-Remaining"] = "0"
            return resp

        # 2. Content-Type Verification
        if not request.is_json and request.content_length and request.content_length > 0:
            return jsonify({
                "error": "Request content-type must be application/json",
                "code": "UNSUPPORTED_MEDIA_TYPE",
            }), 415

        payload_data = request.get_json(silent=True)
        validated = validate_analysis_request(payload_data)

        # Batch in-memory caches to prevent redundant network lookups
        dns_cache: dict[str, DNSResult] = {}
        address_cache: dict[str, ClassificationResult] = {}
        cache_lock = threading.Lock()

        # Privacy-safe logging: NEVER log full email addresses
        first_masked = mask_email_for_logging(validated.addresses[0]) if validated.addresses else "none"
        logger.info(
            f"Analyzing batch of {len(validated.addresses)} addresses "
            f"(smtp_enabled={validated.smtp_enabled}, first_masked={first_masked})"
        )

        def _process_address(addr: str) -> dict[str, Any]:
            # Address-level cache check
            with cache_lock:
                if addr in address_cache:
                    return address_cache[addr].to_dict()

            syntax = check_syntax(addr)
            if not syntax.valid or not syntax.domain:
                res = classify(syntax)
                with cache_lock:
                    address_cache[addr] = res
                return res.to_dict()

            domain = syntax.domain
            with cache_lock:
                dns_res = dns_cache.get(domain)

            if dns_res is None:
                dns_res = check_dns(domain)
                with cache_lock:
                    dns_cache[domain] = dns_res

            if dns_res.status in (DNSStatus.NO_RECORDS, DNSStatus.TIMEOUT, DNSStatus.SERVFAIL, DNSStatus.ERROR):
                res = classify(syntax, dns=dns_res)
                with cache_lock:
                    address_cache[addr] = res
                return res.to_dict()

            if not validated.smtp_enabled:
                smtp_res = check_smtp(syntax.normalized or addr, mx_host="", enabled=False)
            else:
                mx_target = dns_res.mx_hosts[0] if dns_res.mx_hosts else ""
                smtp_res = check_smtp(syntax.normalized or addr, mx_host=mx_target, enabled=bool(mx_target))

            res = classify(syntax, dns=dns_res, smtp=smtp_res)
            with cache_lock:
                address_cache[addr] = res
            return res.to_dict()

        # Controlled concurrency bounded per batch, preserving input order
        max_workers = min(get_max_workers(), max(1, len(validated.addresses)))
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            results = list(executor.map(_process_address, validated.addresses))

        return jsonify({
            "results": results,
            "count": len(results),
            "analysed_at": datetime.now(timezone.utc).isoformat(),
        }), 200

    # Register both /api/analyze and /api/v1/analyze
    @app.post("/api/analyze")
    def analyze_api():
        return _handle_analyze()

    @app.post("/api/v1/analyze")
    def analyze_v1_api():
        return _handle_analyze()

    # ------------------------------------------------------------------
    # Document Text & Candidate Email Extraction Endpoint
    # ------------------------------------------------------------------
    def _handle_extract():
        # 1. Rate Limiting Check
        client_ip = extract_client_ip(request)
        is_limited, retry_after, _ = get_rate_limiter().check(client_ip)
        if is_limited:
            resp = jsonify({
                "error": "Rate limit exceeded. Please wait before submitting additional extraction requests.",
                "code": "RATE_LIMIT_EXCEEDED",
                "retry_after": retry_after,
            })
            resp.status_code = 429
            resp.headers["Retry-After"] = str(retry_after)
            return resp

        # 2. Collect uploaded files
        uploaded_files = []
        if "files" in request.files:
            uploaded_files = request.files.getlist("files")
        elif "file" in request.files:
            uploaded_files = [request.files["file"]]
        else:
            for key in request.files:
                uploaded_files.extend(request.files.getlist(key))

        # Filter out empty file records
        valid_files = [(f.stream, f.filename) for f in uploaded_files if f and f.filename]
        if not valid_files:
            return jsonify({
                "error": "No files provided for extraction. Upload at least one supported document.",
                "code": "NO_FILES_PROVIDED",
            }), 400

        try:
            extraction_result = process_uploaded_files(valid_files)
            return jsonify(extraction_result), 200
        except ExtractionError as exc:
            return jsonify({"error": exc.message, "code": exc.code}), exc.status_code
        except Exception as exc:
            logger.error(f"Unexpected document extraction failure: {exc}")
            return jsonify({
                "error": "An unexpected error occurred while parsing the document.",
                "code": "EXTRACTION_FAILED",
            }), 500

    @app.post("/api/extract")
    def extract_api():
        return _handle_extract()

    @app.post("/api/v1/extract")
    def extract_v1_api():
        return _handle_extract()

    return app


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    is_debug = os.environ.get("FLASK_ENV") == "development"
    create_app().run(host="0.0.0.0", port=port, debug=is_debug)
