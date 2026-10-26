"""
MailScope – Flask application entry point and verification API.
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

logger = logging.getLogger("mailscope")


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
    app.config["MAX_CONTENT_LENGTH"] = 1 * 1024 * 1024  # 1 MB max request size

    # Configure CORS: allow specific origin or comma-separated origins
    cors_origin_raw = os.environ.get("FRONTEND_ORIGIN") or os.environ.get("CORS_ORIGIN")
    if cors_origin_raw:
        origins = [orig.strip() for orig in cors_origin_raw.split(",") if orig.strip()]
    else:
        origins = ["http://localhost:5173"]
    CORS(app, origins=origins)

    # ------------------------------------------------------------------
    # Error Handlers
    # ------------------------------------------------------------------
    @app.errorhandler(APIValidationError)
    def handle_validation_error(exc: APIValidationError):
        return jsonify({"error": exc.message, "code": exc.code}), exc.status_code

    @app.errorhandler(400)
    def handle_bad_request(exc: Any):
        return jsonify({"error": "Bad Request", "code": "BAD_REQUEST", "details": str(exc)}), 400

    @app.errorhandler(404)
    def handle_not_found(exc: Any):
        return jsonify({"error": "Endpoint not found", "code": "NOT_FOUND"}), 404

    @app.errorhandler(405)
    def handle_method_not_allowed(exc: Any):
        return jsonify({"error": "Method not allowed for requested URL", "code": "METHOD_NOT_ALLOWED"}), 405

    @app.errorhandler(413)
    def handle_payload_too_large(exc: Any):
        return jsonify({"error": "Payload exceeds batch size limits", "code": "BATCH_SIZE_EXCEEDED"}), 413

    @app.errorhandler(415)
    def handle_unsupported_media_type(exc: Any):
        return jsonify({"error": "Request content-type must be application/json", "code": "UNSUPPORTED_MEDIA_TYPE"}), 415

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
            "service": "mailscope-backend",
            "version": "1.0.0",
        })

    # ------------------------------------------------------------------
    # Email Deliverability Analysis Endpoint
    # ------------------------------------------------------------------
    def _handle_analyze():
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

        logger.info(
            f"Analyzing batch of {len(validated.addresses)} addresses "
            f"(smtp_enabled={validated.smtp_enabled}, first_masked={mask_email_for_logging(validated.addresses[0])})"
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

        # Controlled concurrency bounded to at most 10 workers, preserving input order
        max_workers = min(10, max(1, len(validated.addresses)))
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

    return app


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    is_debug = os.environ.get("FLASK_ENV") == "development"
    create_app().run(host="0.0.0.0", port=port, debug=is_debug)
