"""Tests for the FastAPI sandbox REST endpoints."""

import pytest
from fastapi.testclient import TestClient
from components.python_sandbox.src.server import app


@pytest.fixture
def client():
    return TestClient(app)


def test_health_endpoint(client):
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "online"
    assert data["service"] == "devmesh-python-sandbox"
    assert "capabilities" in data


def test_execute_endpoint_success(client):
    payload = {
        "code": "print('FASTAPI_SANDBOX_SUCCESS')",
        "files": {"config.json": '{"mode": "test"}'},
        "timeout_seconds": 5,
        "memory_limit_mb": 256,
    }
    res = client.post("/v1/execute", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["exit_code"] == 0
    assert "FASTAPI_SANDBOX_SUCCESS" in data["stdout"]


def test_execute_endpoint_path_traversal(client):
    payload = {
        "code": "print('test')",
        "files": {"../evil.py": "evil"},
    }
    res = client.post("/v1/execute", json=payload)
    assert res.status_code == 400
    assert "Path traversal" in res.json()["detail"]


def test_pytest_endpoint(client):
    payload = {
        "test_code": "def test_ok(): assert True",
        "source_files": {},
        "timeout_seconds": 10,
    }
    res = client.post("/v1/pytest", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["passed"] == 1
    assert data["failed"] == 0
