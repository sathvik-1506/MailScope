import pytest
from backend.services.smtp_checker import reset_environment_smtp_cache
from backend.services.rate_limiter import get_rate_limiter


@pytest.fixture(autouse=True)
def reset_global_caches():
    """Autouse fixture resetting global environment and rate limit caches before and after each test."""
    reset_environment_smtp_cache()
    get_rate_limiter().reset()
    yield
    reset_environment_smtp_cache()
    get_rate_limiter().reset()
