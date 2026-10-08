"""Native migration of tests/unit/session-hub.bats."""
import json
from pathlib import Path

import pytest

SCRIPT = "scripts/session-hub.sh"


@pytest.fixture
def registry(tmp_path) -> Path:
    return tmp_path / "active-sessions.json"


@pytest.fixture
def hub_env(registry):
    return {
        "SESSION_HUB_REGISTRY": str(registry),
        "SESSION_HUB_NO_TUNNEL": "1",
        "SESSION_HUB_DOMAIN": "sessions.example.test",
    }


@pytest.fixture
def hub(run_cmd, repo_root, hub_env):
    """Invoke scripts/session-hub.sh with the suite environment."""

    def _hub(*args):
        return run_cmd(["bash", str(repo_root / SCRIPT), *args], cwd=repo_root, env=hub_env, timeout=300)

    return _hub


def _load(registry: Path):
    return json.loads(registry.read_text(encoding="utf-8"))


def test_register_adds_a_session_to_an_empty_registry(hub, registry):
    res = hub("register", "--name", "foo", "--port", "18080", "--type", "brainstorm", "--title", "Foo Board")
    assert res.returncode == 0, res.output
    data = _load(registry)
    assert data[0]["slug"] == "foo"
    assert data[0]["public_url"] == "https://session-foo.sessions.example.test"


def test_list_prints_the_registry_json(hub):
    hub("register", "--name", "bar", "--port", "18081", "--type", "form", "--title", "Bar")
    res = hub("list")
    assert res.returncode == 0, res.output
    entries = json.loads(res.output)
    assert any(e.get("slug") == "bar" for e in entries)


def test_deregister_removes_a_session_by_name(hub, registry):
    hub("register", "--name", "baz", "--port", "18082", "--type", "form", "--title", "Baz")
    res = hub("deregister", "--name", "baz")
    assert res.returncode == 0, res.output
    assert len(_load(registry)) == 0


def test_reap_drops_entries_whose_pids_are_dead(hub, registry):
    hub("register", "--name", "dead", "--port", "18083", "--type", "form", "--title", "Dead")
    data = _load(registry)
    data[0]["tunnel_pid"] = 999999
    data[0]["server_pid"] = 999999
    registry.write_text(json.dumps(data), encoding="utf-8")
    res = hub("reap")
    assert res.returncode == 0, res.output
    assert len(_load(registry)) == 0


def test_register_is_idempotent_on_slug_replaces_no_duplicate(hub, registry):
    hub("register", "--name", "dup", "--port", "1", "--type", "form", "--title", "v1")
    hub("register", "--name", "dup", "--port", "2", "--type", "form", "--title", "v2")
    entries = [e for e in _load(registry) if e.get("slug") == "dup"]
    assert len(entries) == 1
    assert str(entries[0]["port"]) == "2"


def test_start_form_ticket_id_stores_ticket_id_in_registry_and_injects_placeholder(hub, registry, tmp_path):
    tmphtml = tmp_path / "form.html"
    tmphtml.write_text('<html><body data-ticket-id="__SESSION_TICKET_ID__">test</body></html>', encoding="utf-8")
    res = hub("start-form", "--file", str(tmphtml), "--name", "tkform", "--ticket-id", "T000123")
    assert res.returncode == 0, res.output
    entries = [e for e in _load(registry) if e.get("slug") == "tkform"]
    assert entries[0]["ticket_id"] == "T000123"


def test_start_form_stores_source_file_path_in_registry(hub, registry, tmp_path):
    tmphtml = tmp_path / "srcform.html"
    tmphtml.write_text("<html><body>no placeholders</body></html>", encoding="utf-8")
    res = hub("start-form", "--file", str(tmphtml), "--name", "srcform")
    assert res.returncode == 0, res.output
    entries = [e for e in _load(registry) if e.get("slug") == "srcform"]
    assert entries[0]["source_file"] == str(tmphtml)


def test_regen_re_uploads_from_stored_source_file(hub, tmp_path):
    tmphtml = tmp_path / "regenform.html"
    tmphtml.write_text('<html><body data-ticket-id="__SESSION_TICKET_ID__">v1</body></html>', encoding="utf-8")
    hub("start-form", "--file", str(tmphtml), "--name", "regentest", "--ticket-id", "T000999")
    res = hub("regen", "--name", "regentest")
    assert res.returncode == 0, res.output
    assert "done" in res.output


def test_regen_fails_when_source_file_is_missing(hub):
    hub("register", "--name", "noregen", "--port", "19999", "--type", "form", "--title", "no src")
    res = hub("regen", "--name", "noregen")
    assert res.returncode != 0, res.output
