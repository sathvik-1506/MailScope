"""
Integration tests for the Mailora Flask API endpoints.
"""

from unittest.mock import MagicMock, patch
import pytest

from backend.app import create_app
from backend.services.dns_checker import DNSResult, DNSStatus


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "ok"
    assert data["service"] == "mailora-backend"


def test_security_headers(client):
    response = client.get("/health")
    assert response.headers.get("X-Content-Type-Options") == "nosniff"
    assert response.headers.get("X-Frame-Options") == "DENY"
    assert "no-store" in response.headers.get("Cache-Control", "")


@patch("backend.app.check_dns")
def test_analyze_endpoint_valid_batch(mock_check_dns, client):
    mock_check_dns.return_value = DNSResult(
        status=DNSStatus.HAS_MX,
        domain="example.com",
        mx_hosts=["mail.example.com"],
        reason="Found 1 MX record",
    )

    payload = {
        "addresses": ["alice@example.com", "bob@example.com", "invalid..syntax@@example.com"],
        "smtp_enabled": False,
    }

    response = client.post("/api/analyze", json=payload)
    assert response.status_code == 200
    data = response.get_json()

    assert data["count"] == 3
    assert len(data["results"]) == 3
    assert "analysed_at" in data

    # First address: valid syntax + MX, SMTP disabled -> UNKNOWN (MAILBOX_UNCONFIRMED)
    r0 = data["results"][0]
    assert r0["address"] == "alice@example.com"
    assert r0["verdict"] == "unknown"
    assert r0["reason_code"] == "MAILBOX_UNCONFIRMED"
    assert "syntax" in r0["checks_run"]
    assert "dns" in r0["checks_run"]
    assert "smtp" in r0["checks_skipped"]
    assert len(r0["evidence"]) > 0
    assert len(r0["limitations"]) > 0

    # Third address: invalid syntax -> LIKELY_BOUNCE (INVALID_SYNTAX)
    r2 = data["results"][2]
    assert r2["verdict"] == "likely_bounce"
    assert r2["reason_code"] == "INVALID_SYNTAX"
    assert "dns" in r2["checks_skipped"]


@patch("backend.app.check_dns")
def test_analyze_v1_alias(mock_check_dns, client):
    mock_check_dns.return_value = DNSResult(
        status=DNSStatus.HAS_MX,
        domain="example.com",
        mx_hosts=["mail.example.com"],
        reason="Found 1 MX record",
    )

    payload = {"addresses": ["test@example.com"]}
    response = client.post("/api/v1/analyze", json=payload)
    assert response.status_code == 200
    data = response.get_json()
    assert data["count"] == 1


def test_missing_json_body(client):
    response = client.post("/api/analyze", data="", content_type="application/json")
    assert response.status_code == 400
    data = response.get_json()
    assert "error" in data


def test_invalid_payload_type(client):
    response = client.post("/api/analyze", json="string_payload")
    assert response.status_code == 400
    data = response.get_json()
    assert data["code"] == "INVALID_PAYLOAD_TYPE"


def test_missing_addresses_field(client):
    response = client.post("/api/analyze", json={"smtp_enabled": True})
    assert response.status_code == 400
    data = response.get_json()
    assert data["code"] == "MISSING_ADDRESSES"


def test_addresses_not_list(client):
    response = client.post("/api/analyze", json={"addresses": "not-a-list"})
    assert response.status_code == 400
    data = response.get_json()
    assert data["code"] == "INVALID_ADDRESSES_TYPE"


def test_empty_addresses_list(client):
    response = client.post("/api/analyze", json={"addresses": []})
    assert response.status_code == 400
    data = response.get_json()
    assert data["code"] == "EMPTY_BATCH"


def test_non_string_address_item(client):
    response = client.post("/api/analyze", json={"addresses": ["valid@example.com", 12345]})
    assert response.status_code == 400
    data = response.get_json()
    assert data["code"] == "INVALID_ADDRESS_ITEM"


def test_empty_address_item(client):
    response = client.post("/api/analyze", json={"addresses": ["valid@example.com", "   "]})
    assert response.status_code == 400
    data = response.get_json()
    assert data["code"] == "EMPTY_ADDRESS_ITEM"


def test_address_too_long(client):
    long_addr = "a" * 320 + "@example.com"  # 332 chars > MAX_ADDRESS_LENGTH (320)
    response = client.post("/api/analyze", json={"addresses": [long_addr]})
    assert response.status_code == 400
    data = response.get_json()
    assert data["code"] == "ADDRESS_TOO_LONG"


@patch.dict("os.environ", {"MAX_BATCH_SIZE": "5"})
def test_batch_size_exceeded(client):
    batch = [f"user{i}@example.com" for i in range(6)]
    response = client.post("/api/analyze", json={"addresses": batch})
    assert response.status_code == 413
    data = response.get_json()
    assert data["code"] == "BATCH_SIZE_EXCEEDED"


def test_invalid_smtp_enabled_flag(client):
    response = client.post("/api/analyze", json={"addresses": ["user@example.com"], "smtp_enabled": "yes"})
    assert response.status_code == 400
    data = response.get_json()
    assert data["code"] == "INVALID_SMTP_FLAG"


def test_not_found_endpoint(client):
    response = client.get("/api/nonexistent")
    assert response.status_code == 404
    data = response.get_json()
    assert data["code"] == "NOT_FOUND"


def test_method_not_allowed(client):
    response = client.get("/api/analyze")
    assert response.status_code == 405
    data = response.get_json()
    assert data["code"] == "METHOD_NOT_ALLOWED"


@patch("backend.app.check_dns")
def test_duplicate_addresses_in_batch(mock_check_dns, client):
    mock_check_dns.return_value = DNSResult(
        status=DNSStatus.HAS_MX,
        domain="example.com",
        mx_hosts=["mail.example.com"],
        reason="Found MX",
    )

    # Identical addresses submitted multiple times in the same batch
    payload = {
        "addresses": [
            "duplicate@example.com",
            "other@example.com",
            "duplicate@example.com",
            "duplicate@example.com",
        ],
        "smtp_enabled": False,
    }
    response = client.post("/api/analyze", json=payload)
    assert response.status_code == 200
    data = response.get_json()
    assert data["count"] == 4
    results = data["results"]

    # All duplicates receive identical results in the exact input positions
    assert results[0]["address"] == "duplicate@example.com"
    assert results[1]["address"] == "other@example.com"
    assert results[2]["address"] == "duplicate@example.com"
    assert results[3]["address"] == "duplicate@example.com"
    assert results[0]["verdict"] == results[2]["verdict"] == results[3]["verdict"]
    assert results[0]["reason_code"] == results[2]["reason_code"] == results[3]["reason_code"]


@patch("backend.app.check_dns")
def test_concurrency_preserves_input_order(mock_check_dns, client):
    mock_check_dns.return_value = DNSResult(
        status=DNSStatus.HAS_MX,
        domain="example.com",
        mx_hosts=["mail.example.com"],
        reason="Found MX",
    )

    # Batch of 15 addresses to exercise ThreadPoolExecutor
    addresses = [f"user_{i:02d}@example.com" for i in range(15)]
    response = client.post("/api/analyze", json={"addresses": addresses, "smtp_enabled": False})
    assert response.status_code == 200
    data = response.get_json()
    assert data["count"] == 15
    returned_addrs = [r["address"] for r in data["results"]]
    assert returned_addrs == addresses


def test_unsupported_media_type_rejection(client):
    response = client.post(
        "/api/analyze",
        data="addresses=user%40example.com",
        content_type="application/x-www-form-urlencoded",
    )
    assert response.status_code == 415
    data = response.get_json()
    assert data["code"] == "UNSUPPORTED_MEDIA_TYPE"


def test_cors_headers_strict_origin(client):
    response = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert response.headers.get("Access-Control-Allow-Origin") == "http://localhost:5173"


def test_cors_disallowed_origin_rejected(client):
    response = client.get("/health", headers={"Origin": "http://evil-attacker.example.com"})
    # CORS origin must not be reflected or granted
    assert response.headers.get("Access-Control-Allow-Origin") is None


def test_cors_production_configured_origin_allowed():
    with patch.dict("os.environ", {"FLASK_ENV": "production", "FRONTEND_ORIGIN": "https://myapp.vercel.app"}):
        prod_app = create_app()
        prod_app.config["TESTING"] = True
        with prod_app.test_client() as prod_client:
            resp = prod_client.get("/health", headers={"Origin": "https://myapp.vercel.app"})
            assert resp.headers.get("Access-Control-Allow-Origin") == "https://myapp.vercel.app"

            resp_evil = prod_client.get("/health", headers={"Origin": "https://evil.attacker.com"})
            assert resp_evil.headers.get("Access-Control-Allow-Origin") is None


def test_cors_production_unset_origin_blocks_cross_origin():
    # When FRONTEND_ORIGIN is unset in production, cross-origin requests must be blocked (fail-closed)
    with patch.dict("os.environ", {"FLASK_ENV": "production"}, clear=True):
        prod_app = create_app()
        prod_app.config["TESTING"] = True
        with prod_app.test_client() as prod_client:
            resp = prod_client.get("/health", headers={"Origin": "https://random-site.com"})
            assert resp.headers.get("Access-Control-Allow-Origin") is None


def test_oversized_request_body_rejection():
    # Configure tiny MAX_CONTENT_LENGTH of 50 bytes
    with patch.dict("os.environ", {"MAX_CONTENT_LENGTH": "50"}):
        app = create_app()
        app.config["TESTING"] = True
        with app.test_client() as small_client:
            huge_payload = {"addresses": ["long_address_exceeding_50_bytes_threshold@example.com"]}
            response = small_client.post("/api/analyze", json=huge_payload)
            assert response.status_code == 413
            data = response.get_json()
            assert data["code"] == "BATCH_SIZE_EXCEEDED" or data["code"] == "PAYLOAD_TOO_LARGE"


def test_error_response_redaction_does_not_leak_internals(client):
    # Trigger 400 Bad Request
    response = client.post("/api/analyze", data="malformed{json", content_type="application/json")
    assert response.status_code == 400
    data = response.get_json()
    assert "error" in data
    # Must NOT disclose stack traces, Python classes, or internals
    assert "Traceback" not in response.get_data(as_text=True)
    assert "SyntaxError" not in response.get_data(as_text=True)
    assert "File " not in response.get_data(as_text=True)


@patch("backend.app.check_dns")
def test_rate_limiting_enforcement(mock_check_dns, client):
    mock_check_dns.return_value = DNSResult(
        status=DNSStatus.HAS_MX,
        domain="example.com",
        mx_hosts=["mail.example.com"],
        reason="Found MX",
    )
    from backend.services.rate_limiter import get_rate_limiter
    limiter = get_rate_limiter()
    limiter.reset()

    # Limit to 2 requests per minute
    with patch.dict("os.environ", {"RATE_LIMIT_PER_MINUTE": "2", "RATE_LIMIT_ENABLED": "true"}):
        # 1st request -> OK
        res1 = client.get("/health")  # health does not rate limit
        res_api_1 = client.post(
            "/api/analyze",
            json={"addresses": ["user1@example.com"]},
            headers={"X-Forwarded-For": "203.0.113.195"},
        )
        assert res_api_1.status_code == 200  # Accepted through rate limiter

        # 2nd request -> OK
        res_api_2 = client.post(
            "/api/analyze",
            json={"addresses": ["user2@example.com"]},
            headers={"X-Forwarded-For": "203.0.113.195"},
        )
        assert res_api_2.status_code == 200

        # 3rd request -> Rate limited (429)
        res_api_3 = client.post(
            "/api/analyze",
            json={"addresses": ["user3@example.com"]},
            headers={"X-Forwarded-For": "203.0.113.195"},
        )
        assert res_api_3.status_code == 429
        data = res_api_3.get_json()
        assert data["code"] == "RATE_LIMIT_EXCEEDED"
        assert "Retry-After" in res_api_3.headers
        assert int(res_api_3.headers["Retry-After"]) >= 1

    limiter.reset()


@patch("backend.app.check_dns")
def test_rate_limiting_disabled_allows_traffic(mock_check_dns, client):
    mock_check_dns.return_value = DNSResult(
        status=DNSStatus.HAS_MX,
        domain="example.com",
        mx_hosts=["mail.example.com"],
        reason="Found MX",
    )
    from backend.services.rate_limiter import get_rate_limiter
    limiter = get_rate_limiter()
    limiter.reset()

    with patch.dict("os.environ", {"RATE_LIMIT_ENABLED": "false"}):
        for _ in range(5):
            res = client.post(
                "/api/analyze",
                json={"addresses": ["user@example.com"]},
                headers={"X-Forwarded-For": "198.51.100.42"},
            )
            assert res.status_code == 200

    limiter.reset()


@patch("backend.app.check_dns")
def test_smtp_disabled_by_default_mode(mock_check_dns, client):
    mock_check_dns.return_value = DNSResult(
        status=DNSStatus.HAS_MX,
        domain="example.com",
        mx_hosts=["mail.example.com"],
        reason="Found MX",
    )

    # Explicitly disabling SMTP preserves backward compatibility
    response = client.post("/api/analyze", json={"addresses": ["alice@example.com"], "smtp_enabled": False})
    assert response.status_code == 200
    data = response.get_json()
    item = data["results"][0]

    assert item["verdict"] == "unknown"
    assert item["reason_code"] == "MAILBOX_UNCONFIRMED"
    assert "smtp" in item["checks_skipped"]
    assert item["smtp_evidence"]["status"] == "disabled"


@patch("backend.app.check_dns")
def test_logging_masks_full_submitted_addresses(mock_check_dns, client, caplog):
    mock_check_dns.return_value = DNSResult(
        status=DNSStatus.HAS_MX,
        domain="example.com",
        mx_hosts=["mail.example.com"],
        reason="Found MX",
    )

    import logging
    with caplog.at_level(logging.INFO, logger="mailora"):
        secret_address = "super_secret_employee_name_99@confidential.com"
        client.post("/api/analyze", json={"addresses": [secret_address], "smtp_enabled": False})

        logged_text = caplog.text
        # Full address local-part MUST NOT be logged
        assert secret_address not in logged_text
        assert "super_secret_employee_name_99" not in logged_text
        # Masked local-part MUST be present
        assert "s***@confidential.com" in logged_text

