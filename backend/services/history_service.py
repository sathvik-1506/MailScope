"""
Mailora – Analysis History persistence service.

Provides a minimal, secure, parameterized persistence ledger for completed
analysis runs. Stores only aggregate metadata and domain distributions.
Zero personal identifiers, email local-parts, or uploaded documents are stored.
"""

from __future__ import annotations

import json
import logging
import os
import re
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Generator

logger = logging.getLogger("mailora.history")

DEFAULT_RETENTION_DAYS = 30
MAX_PAGE_LIMIT = 50
DEFAULT_PAGE_LIMIT = 10


class HistoryDatabaseError(Exception):
    """Raised when a database operation fails."""


def get_retention_days() -> int:
    """Returns the configured data retention window in days."""
    try:
        val = int(os.environ.get("HISTORY_RETENTION_DAYS", DEFAULT_RETENTION_DAYS))
        return max(1, min(val, 365))
    except (ValueError, TypeError):
        return DEFAULT_RETENTION_DAYS


def get_database_path() -> str:
    """Returns the database file path or :memory: for tests."""
    env_path = os.environ.get("SQLITE_PATH") or os.environ.get("DATABASE_PATH")
    if env_path:
        return env_path

    # If running in pytest / test env
    if os.environ.get("TESTING") == "1":
        return ":memory:"

    # Default to data/mailora_history.db
    data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
    try:
        os.makedirs(data_dir, exist_ok=True)
        return os.path.join(data_dir, "mailora_history.db")
    except OSError:
        # Fallback to local working directory or memory
        return "mailora_history.db"


class HistoryService:
    """Manages analysis run metadata in an ACID-compliant database."""

    def __init__(self, db_path: str | None = None):
        self.db_path = db_path or get_database_path()
        self._lock = threading.Lock()
        self._memory_conn: sqlite3.Connection | None = None
        if self.db_path == ":memory:":
            self._memory_conn = sqlite3.connect(":memory:", check_same_thread=False)
            self._memory_conn.row_factory = sqlite3.Row
            self._memory_conn.execute("PRAGMA foreign_keys=ON;")
        self._init_db()

    @contextmanager
    def _get_connection(self) -> Generator[sqlite3.Connection, None, None]:
        """Provides a safe connection context with foreign keys and WAL mode."""
        if self._memory_conn is not None:
            with self._lock:
                try:
                    yield self._memory_conn
                    self._memory_conn.commit()
                except sqlite3.Error as exc:
                    self._memory_conn.rollback()
                    logger.error(f"Database operation failed: {exc}")
                    raise HistoryDatabaseError(f"Database error: {exc}") from exc
            return

        conn = None
        try:
            conn = sqlite3.connect(self.db_path, timeout=10.0)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA foreign_keys=ON;")
            yield conn
            conn.commit()
        except sqlite3.Error as exc:
            if conn:
                conn.rollback()
            logger.error(f"Database operation failed: {exc}")
            raise HistoryDatabaseError(f"Database error: {exc}") from exc
        finally:
            if conn:
                conn.close()


    def _init_db(self) -> None:
        """Initializes tables and indexes using idempotent DDL."""
        schema = """
        CREATE TABLE IF NOT EXISTS analysis_runs (
            id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'completed',
            addresses_count INTEGER NOT NULL,
            delivered_count INTEGER NOT NULL DEFAULT 0,
            bounce_count INTEGER NOT NULL DEFAULT 0,
            unknown_count INTEGER NOT NULL DEFAULT 0,
            smtp_enabled INTEGER NOT NULL DEFAULT 0,
            domains_summary TEXT DEFAULT '[]',
            has_detailed_results INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_analysis_runs_created_at ON analysis_runs(created_at);
        """
        try:
            with self._get_connection() as conn:
                conn.executescript(schema)
        except Exception as exc:
            logger.error(f"Failed to initialize history database: {exc}")
            raise HistoryDatabaseError(f"Init failed: {exc}") from exc

    def record_run(
        self,
        run_id: str,
        created_at: str | None = None,
        status: str = "completed",
        addresses_count: int = 0,
        delivered_count: int = 0,
        bounce_count: int = 0,
        unknown_count: int = 0,
        smtp_enabled: bool = False,
        domains_summary: list[dict[str, Any]] | None = None,
        has_detailed_results: bool = False,
    ) -> dict[str, Any]:
        """Saves a run's non-sensitive metadata using parameterized SQL."""
        if not run_id or not isinstance(run_id, str):
            raise ValueError("run_id must be a non-empty string")

        # Sanitize run_id: alphanumeric and hyphens/underscores only
        sanitized_id = re.sub(r"[^a-zA-Z0-9_\-]", "", run_id.strip())
        if not sanitized_id:
            sanitized_id = f"batch-{int(datetime.now(timezone.utc).timestamp())}"

        timestamp = created_at or datetime.now(timezone.utc).isoformat()
        domains_json = json.dumps(domains_summary or [])

        query = """
        INSERT OR REPLACE INTO analysis_runs (
            id, created_at, status, addresses_count,
            delivered_count, bounce_count, unknown_count,
            smtp_enabled, domains_summary, has_detailed_results
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        params = (
            sanitized_id,
            timestamp,
            status,
            max(0, int(addresses_count)),
            max(0, int(delivered_count)),
            max(0, int(bounce_count)),
            max(0, int(unknown_count)),
            1 if smtp_enabled else 0,
            domains_json,
            1 if has_detailed_results else 0,
        )

        with self._get_connection() as conn:
            conn.execute(query, params)

        # Opportunistically purge expired records past retention limit
        self.purge_expired_runs()

        return self.get_run(sanitized_id) or {}

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        """Retrieves a single run record by ID."""
        if not run_id:
            return None

        query = "SELECT * FROM analysis_runs WHERE id = ?"
        with self._get_connection() as conn:
            cursor = conn.execute(query, (run_id,))
            row = cursor.fetchone()
            if not row:
                return None
            return self._row_to_dict(row)

    def list_runs(
        self,
        query: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        page: int = 1,
        limit: int = DEFAULT_PAGE_LIMIT,
    ) -> dict[str, Any]:
        """Queries runs with optional search, date range, and pagination."""
        page_num = max(1, int(page))
        page_size = max(1, min(int(limit), MAX_PAGE_LIMIT))
        offset = (page_num - 1) * page_size

        where_clauses: list[str] = []
        params: list[Any] = []

        if query and query.strip():
            clean_q = f"%{query.strip().lower()}%"
            where_clauses.append("(LOWER(id) LIKE ? OR LOWER(domains_summary) LIKE ?)")
            params.extend([clean_q, clean_q])

        if start_date and start_date.strip():
            where_clauses.append("created_at >= ?")
            params.append(start_date.strip())

        if end_date and end_date.strip():
            # If date only (e.g. 2026-10-27), append end of day
            ed = end_date.strip()
            if len(ed) == 10:
                ed = f"{ed}T23:59:59.999Z"
            where_clauses.append("created_at <= ?")
            params.append(ed)

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        count_sql = f"SELECT COUNT(*) AS total FROM analysis_runs {where_sql}"
        select_sql = f"""
        SELECT * FROM analysis_runs
        {where_sql}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
        """

        with self._get_connection() as conn:
            total_cursor = conn.execute(count_sql, params)
            total = total_cursor.fetchone()["total"]

            fetch_params = list(params) + [page_size, offset]
            items_cursor = conn.execute(select_sql, fetch_params)
            rows = items_cursor.fetchall()
            items = [self._row_to_dict(r) for r in rows]

        return {
            "items": items,
            "total": total,
            "page": page_num,
            "limit": page_size,
            "retention_days": get_retention_days(),
        }

    def delete_run(self, run_id: str) -> bool:
        """Deletes a run record by ID. Returns True if deleted."""
        if not run_id:
            return False

        with self._get_connection() as conn:
            cursor = conn.execute("DELETE FROM analysis_runs WHERE id = ?", (run_id,))
            return cursor.rowcount > 0

    def clear_runs(self) -> int:
        """Deletes all run records. Returns count of deleted records."""
        with self._get_connection() as conn:
            cursor = conn.execute("DELETE FROM analysis_runs")
            return cursor.rowcount

    def purge_expired_runs(self, retention_days: int | None = None) -> int:
        """Purges records older than retention window. Default 30 days."""
        days = retention_days if retention_days is not None else get_retention_days()
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        try:
            with self._get_connection() as conn:
                cursor = conn.execute(
                    "DELETE FROM analysis_runs WHERE created_at < ?",
                    (cutoff,),
                )
                deleted = cursor.rowcount
                if deleted > 0:
                    logger.info(f"Purged {deleted} expired analysis history runs older than {days} days")
                return deleted
        except Exception as exc:
            logger.warning(f"Failed to purge expired history runs: {exc}")
            return 0

    @staticmethod
    def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
        """Maps a SQL row to a clean API response dictionary."""
        domains: list[dict[str, Any]] = []
        raw_domains = row["domains_summary"]
        if raw_domains:
            try:
                parsed = json.loads(raw_domains)
                if isinstance(parsed, list):
                    domains = parsed
            except (json.JSONDecodeError, TypeError):
                pass

        return {
            "id": row["id"],
            "created_at": row["created_at"],
            "status": row["status"],
            "addresses_count": row["addresses_count"],
            "delivered_count": row["delivered_count"],
            "bounce_count": row["bounce_count"],
            "unknown_count": row["unknown_count"],
            "smtp_enabled": bool(row["smtp_enabled"]),
            "domains_summary": domains,
            "has_detailed_results": bool(row["has_detailed_results"]),
        }


# Singleton service instance
_history_service: HistoryService | None = None


def get_history_service(db_path: str | None = None) -> HistoryService:
    """Returns the singleton history service instance."""
    global _history_service
    if _history_service is None or db_path is not None:
        _history_service = HistoryService(db_path=db_path)
    return _history_service
