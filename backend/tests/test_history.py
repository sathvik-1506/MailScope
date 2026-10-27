"""
Unit and integration tests for Mailora Analysis History service and API endpoints.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
import pytest

from backend.app import create_app
from backend.services.history_service import (
    HistoryService,
    HistoryDatabaseError,
    get_history_service,
)


@pytest.fixture
def memory_history_service():
    """Provides a fresh isolated in-memory HistoryService for unit tests."""
    return HistoryService(db_path=":memory:")


@pytest.fixture
def test_client(monkeypatch):
    """Provides a Flask test client with an in-memory database."""
    monkeypatch.setenv("TESTING", "1")
    monkeypatch.setenv("SQLITE_PATH", ":memory:")
    # Reset singleton to ensure fresh in-memory db
    mem_service = HistoryService(db_path=":memory:")
    monkeypatch.setattr("backend.app.get_history_service", lambda db_path=None: mem_service)
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client, mem_service


# ----------------------------------------------------------------------
# Unit Tests for HistoryService
# ----------------------------------------------------------------------

def test_record_and_get_run(memory_history_service):
    """Verifies creating and retrieving a run with full metadata."""
    run = memory_history_service.record_run(
        run_id="batch-test-1",
        created_at="2026-10-27T10:00:00Z",
        status="completed",
        addresses_count=10,
        delivered_count=7,
        bounce_count=2,
        unknown_count=1,
        smtp_enabled=True,
        domains_summary=[{"domain": "example.com", "count": 6}, {"domain": "mailora.test", "count": 4}],
        has_detailed_results=False,
    )

    assert run["id"] == "batch-test-1"
    assert run["addresses_count"] == 10
    assert run["delivered_count"] == 7
    assert run["bounce_count"] == 2
    assert run["unknown_count"] == 1
    assert run["smtp_enabled"] is True
    assert run["has_detailed_results"] is False
    assert len(run["domains_summary"]) == 2
    assert run["domains_summary"][0]["domain"] == "example.com"

    # Fetch directly
    fetched = memory_history_service.get_run("batch-test-1")
    assert fetched is not None
    assert fetched["id"] == "batch-test-1"


def test_get_nonexistent_run_returns_none(memory_history_service):
    """Verifies that querying a non-existent run returns None."""
    assert memory_history_service.get_run("nonexistent-batch") is None
    assert memory_history_service.get_run("") is None


def test_list_runs_pagination_and_sorting(memory_history_service):
    """Verifies sorting (newest first) and pagination boundaries."""
    base_time = datetime(2026, 10, 20, 12, 0, 0, tzinfo=timezone.utc)
    for i in range(15):
        t = (base_time + timedelta(hours=i)).isoformat()
        memory_history_service.record_run(
            run_id=f"batch-{i:02d}",
            created_at=t,
            addresses_count=i + 1,
        )

    # Page 1 (limit 10)
    page1 = memory_history_service.list_runs(page=1, limit=10)
    assert page1["total"] == 15
    assert len(page1["items"]) == 10
    assert page1["page"] == 1
    # Newest run (batch-14) should be first
    assert page1["items"][0]["id"] == "batch-14"

    # Page 2 (limit 10)
    page2 = memory_history_service.list_runs(page=2, limit=10)
    assert page2["total"] == 15
    assert len(page2["items"]) == 5
    assert page2["items"][0]["id"] == "batch-04"
    assert page2["items"][-1]["id"] == "batch-00"


def test_list_runs_search_by_id_and_domain(memory_history_service):
    """Verifies search filtering by run ID and domain metadata."""
    memory_history_service.record_run(
        run_id="batch-alpha",
        domains_summary=[{"domain": "apple.com", "count": 5}],
    )
    memory_history_service.record_run(
        run_id="batch-beta",
        domains_summary=[{"domain": "google.com", "count": 3}],
    )
    memory_history_service.record_run(
        run_id="batch-gamma",
        domains_summary=[{"domain": "microsoft.com", "count": 2}],
    )

    # Search by ID
    res_id = memory_history_service.list_runs(query="alpha")
    assert res_id["total"] == 1
    assert res_id["items"][0]["id"] == "batch-alpha"

    # Search by Domain in domains_summary
    res_domain = memory_history_service.list_runs(query="google")
    assert res_domain["total"] == 1
    assert res_domain["items"][0]["id"] == "batch-beta"

    # Non-matching query
    res_none = memory_history_service.list_runs(query="unknown-xyz")
    assert res_none["total"] == 0
    assert len(res_none["items"]) == 0


def test_list_runs_date_filtering(memory_history_service):
    """Verifies start_date and end_date filtering."""
    memory_history_service.record_run(run_id="run-1", created_at="2026-10-10T10:00:00Z")
    memory_history_service.record_run(run_id="run-2", created_at="2026-10-15T10:00:00Z")
    memory_history_service.record_run(run_id="run-3", created_at="2026-10-20T10:00:00Z")

    # Start date filter
    after = memory_history_service.list_runs(start_date="2026-10-15T00:00:00Z")
    assert after["total"] == 2
    assert {r["id"] for r in after["items"]} == {"run-2", "run-3"}

    # End date filter
    before = memory_history_service.list_runs(end_date="2026-10-15")
    assert before["total"] == 2
    assert {r["id"] for r in before["items"]} == {"run-1", "run-2"}

    # Date range
    between = memory_history_service.list_runs(start_date="2026-10-12", end_date="2026-10-18")
    assert between["total"] == 1
    assert between["items"][0]["id"] == "run-2"


def test_delete_run(memory_history_service):
    """Verifies deleting a single run by ID."""
    memory_history_service.record_run(run_id="run-del")
    assert memory_history_service.get_run("run-del") is not None

    deleted = memory_history_service.delete_run("run-del")
    assert deleted is True
    assert memory_history_service.get_run("run-del") is None

    # Deleting again returns False
    assert memory_history_service.delete_run("run-del") is False


def test_clear_runs(memory_history_service):
    """Verifies clearing all runs."""
    memory_history_service.record_run(run_id="run-a")
    memory_history_service.record_run(run_id="run-b")
    assert memory_history_service.list_runs()["total"] == 2

    cleared_count = memory_history_service.clear_runs()
    assert cleared_count == 2
    assert memory_history_service.list_runs()["total"] == 0


def test_purge_expired_runs(memory_history_service):
    """Verifies that records older than the retention window are purged."""
    now = datetime.now(timezone.utc)
    old_time = (now - timedelta(days=20)).isoformat()
    recent_time = (now - timedelta(days=5)).isoformat()

    memory_history_service.record_run(run_id="run-older-than-15", created_at=old_time)
    memory_history_service.record_run(run_id="run-active", created_at=recent_time)

    # Purge with 15-day retention
    purged = memory_history_service.purge_expired_runs(retention_days=15)
    assert purged == 1

    remaining = memory_history_service.list_runs()
    assert remaining["total"] == 1
    assert remaining["items"][0]["id"] == "run-active"



# ----------------------------------------------------------------------
# API Endpoint Integration Tests
# ----------------------------------------------------------------------

def test_api_list_history_empty(test_client):
    """Verifies GET /api/history returns empty list and pagination metadata."""
    client, _ = test_client
    res = client.get("/api/history")
    assert res.status_code == 200
    data = res.get_json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["page"] == 1
    assert data["retention_days"] == 30


def test_api_post_and_get_history(test_client):
    """Verifies POST /api/history and GET /api/history/<run_id>."""
    client, _ = test_client
    payload = {
        "id": "batch-custom-123",
        "status": "completed",
        "addresses_count": 5,
        "delivered_count": 4,
        "bounce_count": 1,
        "unknown_count": 0,
        "smtp_enabled": True,
        "domains_summary": [{"domain": "mailora.io", "count": 5}],
    }
    post_res = client.post("/api/history", json=payload)
    assert post_res.status_code == 201
    created_item = post_res.get_json()["item"]
    assert created_item["id"] == "batch-custom-123"

    # Fetch via GET
    get_res = client.get("/api/history/batch-custom-123")
    assert get_res.status_code == 200
    item = get_res.get_json()
    assert item["id"] == "batch-custom-123"
    assert item["delivered_count"] == 4
    assert item["smtp_enabled"] is True


def test_api_post_history_validation(test_client):
    """Verifies POST /api/history rejects payloads missing 'id'."""
    client, _ = test_client
    res = client.post("/api/history", json={"addresses_count": 5})
    assert res.status_code == 400
    assert res.get_json()["code"] == "MISSING_RUN_ID"


def test_api_delete_single_and_clear_history(test_client):
    """Verifies DELETE /api/history/<run_id> and DELETE /api/history."""
    client, service = test_client
    service.record_run(run_id="batch-to-del-1")
    service.record_run(run_id="batch-to-del-2")

    # Delete 1
    del1 = client.delete("/api/history/batch-to-del-1")
    assert del1.status_code == 200
    assert del1.get_json()["status"] == "deleted"

    # Delete non-existent
    del_missing = client.delete("/api/history/batch-to-del-1")
    assert del_missing.status_code == 404

    # Clear remaining
    clear_res = client.delete("/api/history")
    assert clear_res.status_code == 200
    assert clear_res.get_json()["deleted_count"] == 1


def test_api_analyze_records_history_automatically(test_client):
    """Verifies that POST /api/analyze automatically logs run metadata into history ledger."""
    client, service = test_client
    res = client.post("/api/analyze", json={"addresses": ["test@example.com"]})
    assert res.status_code == 200
    resp_data = res.get_json()
    assert "batch_id" in resp_data
    batch_id = resp_data["batch_id"]

    # Verify history ledger contains the run
    history_res = client.get("/api/history")
    assert history_res.status_code == 200
    history_data = history_res.get_json()
    assert history_data["total"] == 1
    assert history_data["items"][0]["id"] == batch_id
    assert history_data["items"][0]["addresses_count"] == 1
