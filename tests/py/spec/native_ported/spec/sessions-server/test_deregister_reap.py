"""Native migration of tests/spec/sessions-server/deregister-reap.bats."""

import json
import os

import pytest


@pytest.fixture
def hub(repo_root, tmp_path):
    """Isolated session-hub registry (BATS setup)."""
    registry = tmp_path / "active-sessions.json"
    registry.write_text("[]\n", encoding="utf-8")
    env = {"SESSION_HUB_REGISTRY": str(registry), "SESSION_HUB_NO_TUNNEL": "1"}
    return {"env": env, "registry": registry, "script": str(repo_root / "scripts" / "session-hub.sh")}


def _cmd(hub, *args):
    return ["bash", hub["script"], *args]


def _write_registry(hub, entries):
    hub["registry"].write_text(json.dumps(entries), encoding="utf-8")


def _read_registry(hub):
    return json.loads(hub["registry"].read_text(encoding="utf-8"))


def test_deregister_entfernt_den_eintrag_und_beendet_den_getrackten_server_nicht_hart(run_cmd, hub):
    run_cmd(_cmd(hub, "register", "--name", "baz", "--port", "18082", "--type", "companion", "--title", "Baz"), env=hub["env"])
    r = run_cmd(_cmd(hub, "deregister", "--name", "baz"), env=hub["env"])
    assert r.returncode == 0, r.output
    assert len(_read_registry(hub)) == 0


def test_reap_entfernt_eintraege_mit_totem_server_pid(run_cmd, hub):
    _write_registry(hub, [{
        "slug": "dead", "type": "form", "title": "Dead", "port": 1,
        "public_url": "https://session-dead.sessions.mentolder.de",
        "local_url": "http://localhost:1/", "tunnel_pid": 0, "server_pid": 999999,
        "started_at": "2026-01-01T00:00:00Z",
    }])
    r = run_cmd(_cmd(hub, "reap"), env=hub["env"])
    assert r.returncode == 0, r.output
    assert len(_read_registry(hub)) == 0
    assert "reaped 1 stale session(s); 0 active" in r.output


def test_reap_behaelt_eintraege_mit_lebendem_server_pid(run_cmd, hub):
    # Positiv-Anker zum Negativtest oben: der eigene, definitiv lebende Prozess.
    _write_registry(hub, [{
        "slug": "alive", "type": "form", "title": "Alive", "port": 2,
        "public_url": "https://session-alive.sessions.mentolder.de",
        "local_url": "http://localhost:2/", "tunnel_pid": 0, "server_pid": os.getpid(),
        "started_at": "2026-01-01T00:00:00Z",
    }])
    r = run_cmd(_cmd(hub, "reap"), env=hub["env"])
    assert r.returncode == 0, r.output
    assert _read_registry(hub)[0]["slug"] == "alive"
