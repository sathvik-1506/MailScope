"""
Mailora – In-Memory Process-Local Client Rate Limiter.

=============================================================================
SECURITY & DEPLOYMENT ARCHITECTURE NOTE
=============================================================================
This rate limiter operates in-memory on a per-process sliding window:
- It tracks client request timestamps using a thread-safe sliding window (60s).
- It does NOT require or connect to an external Redis instance or database,
  maintaining Mailora's zero-storage privacy guarantee.
- In multi-worker deployments (e.g. Gunicorn with 4 workers), each worker
  process enforces limits independently. For example, a limit of 60 req/min
  per worker provides an effective aggregate ceiling of up to 240 req/min
  across 4 workers under uniform load balancing.
- In single-process deployments (or per-worker), limits are enforced strictly.
=============================================================================
"""

from __future__ import annotations

import math
import os
import threading
import time
from collections import deque
from typing import Any


DEFAULT_RATE_LIMIT_PER_MINUTE = 60
_WINDOW_SECONDS = 60.0
_MAX_TRACKED_IPS = 10000


class SlidingWindowRateLimiter:
    """Thread-safe sliding window rate limiter."""

    def __init__(self, requests_per_minute: int = DEFAULT_RATE_LIMIT_PER_MINUTE):
        self.limit = requests_per_minute
        self.window = _WINDOW_SECONDS
        self._records: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def is_enabled(self) -> bool:
        """Checks if rate limiting is enabled via environment."""
        val = os.environ.get("RATE_LIMIT_ENABLED", "true").strip().lower()
        return val not in ("false", "0", "no", "off")

    def get_limit(self) -> int:
        """Returns the configured rate limit per minute."""
        try:
            return int(os.environ.get("RATE_LIMIT_PER_MINUTE", self.limit))
        except (ValueError, TypeError):
            return self.limit

    def check(self, client_ip: str) -> tuple[bool, int, int]:
        """Checks if the client IP has exceeded the allowed rate.

        Args:
            client_ip: Canonical IP address string of the client.

        Returns:
            (is_exceeded, retry_after_seconds, remaining_requests)
        """
        if not self.is_enabled():
            return False, 0, 999

        limit = self.get_limit()
        now = time.time()
        window_start = now - self.window

        with self._lock:
            # Memory safeguard: prune expired keys if table grows too large
            if len(self._records) > _MAX_TRACKED_IPS:
                self._prune_expired(window_start)

            if client_ip not in self._records:
                self._records[client_ip] = deque()

            timestamps = self._records[client_ip]

            # Drop timestamps outside the sliding window
            while timestamps and timestamps[0] <= window_start:
                timestamps.popleft()

            # If capacity is exceeded, calculate retry_after
            if len(timestamps) >= limit:
                oldest_timestamp = timestamps[0]
                retry_after = max(1, math.ceil(self.window - (now - oldest_timestamp)))
                return True, retry_after, 0

            # Record this request
            timestamps.append(now)
            remaining = max(0, limit - len(timestamps))
            return False, 0, remaining

    def _prune_expired(self, window_start: float) -> None:
        """Prunes IPs that have no active timestamps in the window."""
        expired_ips = [
            ip for ip, queue in self._records.items()
            if not queue or queue[-1] <= window_start
        ]
        for ip in expired_ips:
            del self._records[ip]

    def reset(self) -> None:
        """Clears all tracking history (primarily for unit testing)."""
        with self._lock:
            self._records.clear()


# Global singleton instance for the process
_rate_limiter = SlidingWindowRateLimiter()


def get_rate_limiter() -> SlidingWindowRateLimiter:
    return _rate_limiter


def extract_client_ip(request: Any) -> str:
    """Extracts client IP address safely, respecting reverse-proxy headers when present."""
    # Check X-Forwarded-For header (comma-separated list: client, proxy1, proxy2)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # First IP in X-Forwarded-For is the originating client
        client_ip = forwarded_for.split(",")[0].strip()
        if client_ip:
            return client_ip

    # Check X-Real-IP header (common in Nginx / reverse proxies)
    real_ip = request.headers.get("X-Real-IP")
    if real_ip and real_ip.strip():
        return real_ip.strip()

    # Fall back to remote_addr
    return request.remote_addr or "127.0.0.1"
