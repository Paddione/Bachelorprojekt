"""Native migration of tests/spec/sessions-server/register-list.bats."""

import json
from pathlib import Path

import pytest


@pytest.fixture
def hub(repo_root, tmp_path, monkeypatch):
    """Isolated session-hub registry (BATS setup)."""
    registry = tmp_path / "active-sessions.json"
    env = {
        "SESSION_HUB_REGISTRY": str(registry),
        "SESSION_HUB_DOMAIN": "sessions.example.test",
        "SESSION_HUB_NO_TUNNEL": "1",
    }
    return {"env": env, "registry": registry, "script": str(repo_root / "scripts" / "session-hub.sh")}


def _hub_cmd(hub, *args):
    return ["bash", hub["script"], *args]


def _load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def test_register_schreibt_eintrag_in_leere_registry_und_leitet_public_url_ab(run_cmd, hub):
    hub["registry"].write_text("[]\n", encoding="utf-8")
    r = run_cmd(_hub_cmd(hub, "register", "--name", "foo", "--port", "18080", "--type", "brainstorm", "--title", "Foo Board"), env=hub["env"])
    assert r.returncode == 0, r.output
    data = _load(hub["registry"])
    assert len(data) == 1
    assert data[0]["slug"] == "foo"
    assert data[0]["public_url"] == "https://session-foo.sessions.example.test"


def test_list_gibt_die_volle_registry_als_json_aus(run_cmd, hub):
    hub["registry"].write_text("[]\n", encoding="utf-8")
    run_cmd(_hub_cmd(hub, "register", "--name", "bar", "--port", "18081", "--type", "form", "--title", "Bar"), env=hub["env"])
    r = run_cmd(_hub_cmd(hub, "list"), env=hub["env"])
    assert r.returncode == 0, r.output
    titles = [e.get("title") for e in json.loads(r.output) if e.get("slug") == "bar"]
    assert titles == ["Bar"]


def test_doppelte_registrierung_ersetzt_den_bestehenden_eintrag_idempotent_pro_slug(run_cmd, hub):
    hub["registry"].write_text("[]\n", encoding="utf-8")
    run_cmd(_hub_cmd(hub, "register", "--name", "dup", "--port", "1", "--type", "form", "--title", "v1"), env=hub["env"])
    r = run_cmd(_hub_cmd(hub, "register", "--name", "dup", "--port", "2", "--type", "form", "--title", "v2"), env=hub["env"])
    assert r.returncode == 0, r.output
    data = _load(hub["registry"])
    assert len(data) == 1
    assert str(data[0]["port"]) == "2"


def test_register_ohne_pflichtargumente_scheitert_mit_exit_2(run_cmd, hub):
    r = run_cmd(_hub_cmd(hub, "register", "--name", "onlyname"), env=hub["env"])
    assert r.returncode == 2
