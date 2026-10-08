"""Native migration of tests/spec/sessions-server/form-lifecycle.bats."""

import json

import pytest


@pytest.fixture
def hub(repo_root, tmp_path):
    """Isolated session-hub registry (BATS setup)."""
    registry = tmp_path / "active-sessions.json"
    registry.write_text("[]\n", encoding="utf-8")
    env = {"SESSION_HUB_REGISTRY": str(registry), "SESSION_HUB_NO_TUNNEL": "1"}
    return {"env": env, "registry": registry, "tmp": tmp_path, "script": str(repo_root / "scripts" / "session-hub.sh")}


def _cmd(hub, *args):
    return ["bash", hub["script"], *args]


def _entry(hub, slug):
    for e in json.loads(hub["registry"].read_text(encoding="utf-8")):
        if e.get("slug") == slug:
            return e
    return None


def test_start_form_speichert_ticket_id_und_source_file_in_der_registry(run_cmd, hub):
    form = hub["tmp"] / "tkform.html"
    form.write_text('<html><body data-ticket="__SESSION_TICKET_ID__"></body></html>\n', encoding="utf-8")
    r = run_cmd(_cmd(hub, "start-form", "--file", str(form), "--name", "tkform", "--ticket-id", "T000123"), env=hub["env"])
    assert r.returncode == 0, r.output
    e = _entry(hub, "tkform")
    assert e["ticket_id"] == "T000123"
    assert e["source_file"] == str(form)
    assert e["type"] == "form"


def test_start_form_ohne_platzhalter_speichert_trotzdem_source_file_absolut(run_cmd, hub):
    form = hub["tmp"] / "srcform.html"
    form.write_text("<html><body>plain</body></html>", encoding="utf-8")
    r = run_cmd(_cmd(hub, "start-form", "--file", str(form), "--name", "srcform"), env=hub["env"])
    assert r.returncode == 0, r.output
    assert _entry(hub, "srcform")["source_file"] == str(form)


def test_regen_laedt_das_formular_aus_dem_gespeicherten_source_file_erneut_hoch(run_cmd, hub):
    form = hub["tmp"] / "regentest.html"
    form.write_text('<html><body data-api="__SESSION_API_URL__"></body></html>\n', encoding="utf-8")
    run_cmd(_cmd(hub, "start-form", "--file", str(form), "--name", "regentest", "--ticket-id", "T000123"), env=hub["env"])
    r = run_cmd(_cmd(hub, "regen", "--name", "regentest"), env=hub["env"])
    assert r.returncode == 0, r.output
    assert "done" in r.output


def test_regen_schlaegt_fehl_wenn_kein_source_file_hinterlegt_ist(run_cmd, hub):
    run_cmd(_cmd(hub, "register", "--name", "noregen", "--port", "18083", "--type", "companion"), env=hub["env"])
    r = run_cmd(_cmd(hub, "regen", "--name", "noregen"), env=hub["env"])
    assert r.returncode != 0
