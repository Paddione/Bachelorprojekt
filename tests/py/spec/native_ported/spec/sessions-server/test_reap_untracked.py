"""Native migration of tests/spec/sessions-server/reap-untracked.bats."""

import json

import pytest


@pytest.fixture
def hub(repo_root, tmp_path):
    """Isolated session-hub registry (BATS setup)."""
    registry = tmp_path / "active-sessions.json"
    registry.write_text("[]\n", encoding="utf-8")
    env = {"SESSION_HUB_REGISTRY": str(registry), "SESSION_HUB_NO_TUNNEL": "1"}
    return {"env": env, "registry": registry, "script": str(repo_root / "scripts" / "session-hub.sh")}


def test_reap_behaelt_per_register_angelegte_eintraege_ohne_getrackten_prozess(run_cmd, hub):
    r = run_cmd(["bash", hub["script"], "register", "--name", "foo", "--port", "18080", "--type", "companion", "--title", "Foo"], env=hub["env"])
    assert r.returncode == 0, r.output
    data = json.loads(hub["registry"].read_text(encoding="utf-8"))
    assert data[0]["server_pid"] == 0

    r = run_cmd(["bash", hub["script"], "reap"], env=hub["env"])
    assert r.returncode == 0, r.output
    data = json.loads(hub["registry"].read_text(encoding="utf-8"))
    assert len(data) == 1
    assert data[0]["slug"] == "foo"
