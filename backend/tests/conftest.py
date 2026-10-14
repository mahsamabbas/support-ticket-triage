import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from tests.fakes import FakeProvider


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(_env_file=None, sqlite_path=tmp_path / "test.db")


@pytest.fixture
def provider() -> FakeProvider:
    return FakeProvider()


@pytest.fixture
def client(settings, provider):
    with TestClient(create_app(settings=settings, provider=provider)) as test_client:
        yield test_client
