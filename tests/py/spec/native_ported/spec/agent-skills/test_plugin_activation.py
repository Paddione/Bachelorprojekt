"""Native migration of tests/spec/agent-skills/plugin-activation.bats."""

import collections
import json
import os
import re

import pytest


@pytest.fixture
def env_fix(tmp_path, monkeypatch):
    """BATS setup: Fixture-Verzeichnisse und Pfad-Overrides des Doctors."""
    fix = tmp_path / "fix"
    homedir = fix / "claude-home"
    (homedir / "plugins").mkdir(parents=True)
    repo_settings = fix / "repo-settings.json"
    return {
        "FIX": fix,
        "HOMEDIR": homedir,
        "REPO_SETTINGS": repo_settings,
        "env": {
            "PLUGIN_DOCTOR_CLAUDE_HOME": str(homedir),
            "PLUGIN_DOCTOR_REPO_SETTINGS": str(repo_settings),
        },
    }


def _fixture(fx, repo_enabled, user_enabled, installed_plugins):
    fx["REPO_SETTINGS"].write_text('{"enabledPlugins": %s}\n' % repo_enabled, encoding="utf-8")
    (fx["HOMEDIR"] / "settings.json").write_text('{"enabledPlugins": %s}\n' % user_enabled, encoding="utf-8")
    (fx["HOMEDIR"] / "plugins" / "installed_plugins.json").write_text(
        '{"version": 2, "plugins": %s}\n' % installed_plugins, encoding="utf-8"
    )


@pytest.fixture
def doctor(repo_root):
    script = repo_root / "scripts/plugin-doctor.sh"
    return script


def _run(run_cmd, doctor, fx, *args):
    return run_cmd(["bash", str(doctor), *args], env=fx["env"])


def test_t002651_aktiviertes_nicht_installiertes_plugin_wird_als_befund_gemeldet(run_cmd, doctor, env_fix):
    _fixture(
        env_fix,
        '{"zeta-fixture-plugin@fixture-market": true}',
        '{"zeta-fixture-plugin@fixture-market": true}',
        "{}",
    )
    r = _run(run_cmd, doctor, env_fix)
    assert r.returncode == 1
    assert "zeta-fixture-plugin" in r.output


def test_t002651_im_repo_aktiviert_im_user_scope_deaktiviert_faehigkeitsverlust(run_cmd, doctor, env_fix):
    _fixture(
        env_fix,
        '{"zeta-fixture-plugin@fixture-market": true}',
        '{"zeta-fixture-plugin@fixture-market": false}',
        '{"zeta-fixture-plugin@fixture-market": [{"scope": "user", "installPath": "/tmp/fixture"}]}',
    )
    r = _run(run_cmd, doctor, env_fix)
    assert r.returncode == 1
    assert "zeta-fixture-plugin" in r.output


def test_t002651_im_repo_aktiviert_im_user_scope_gar_nicht_gefuehrt_faehigkeitsverlust(run_cmd, doctor, env_fix):
    _fixture(
        env_fix,
        '{"zeta-fixture-plugin@fixture-market": true}',
        "{}",
        '{"zeta-fixture-plugin@fixture-market": [{"scope": "user", "installPath": "/tmp/fixture"}]}',
    )
    r = _run(run_cmd, doctor, env_fix)
    assert r.returncode == 1
    assert "zeta-fixture-plugin" in r.output


def test_t002651_zusaetzliche_lokale_plugins_sind_kein_befund(run_cmd, doctor, env_fix):
    _fixture(
        env_fix,
        "{}",
        '{"zeta-fixture-plugin@fixture-market": true}',
        '{"zeta-fixture-plugin@fixture-market": [{"scope": "user", "installPath": "/tmp/fixture"}]}',
    )
    r = _run(run_cmd, doctor, env_fix)
    assert r.returncode == 0


def test_t002651_sauberer_zustand_meldet_keinen_befund(run_cmd, doctor, env_fix):
    _fixture(
        env_fix,
        '{"zeta-fixture-plugin@fixture-market": true, "andere@fixture-market": false}',
        '{"zeta-fixture-plugin@fixture-market": true, "andere@fixture-market": false}',
        '{"zeta-fixture-plugin@fixture-market": [{"scope": "user", "installPath": "/tmp/fixture"}]}',
    )
    r = _run(run_cmd, doctor, env_fix)
    assert r.returncode == 0


def test_t002651_fehlendes_claude_home_ist_kein_fehlschlag(run_cmd, doctor, env_fix):
    env_fix["REPO_SETTINGS"].write_text(
        '{"enabledPlugins": {"zeta-fixture-plugin@fixture-market": true}}\n', encoding="utf-8"
    )
    env = dict(env_fix["env"])
    env["PLUGIN_DOCTOR_CLAUDE_HOME"] = str(env_fix["FIX"] / "gibt-es-nicht")
    r = run_cmd(["bash", str(doctor)], env=env)
    assert r.returncode == 0
    assert re.search(r"nicht anwendbar|not applicable|kein Claude-Home", r.output, re.I)


def test_t002651_kaputtes_json_ist_exit_2_nicht_exit_0_oder_1(run_cmd, doctor, env_fix):
    _fixture(env_fix, '{"zeta-fixture-plugin@fixture-market": true}', "{}", "{}")
    (env_fix["HOMEDIR"] / "plugins" / "installed_plugins.json").write_text(
        "{ das ist kein json\n", encoding="utf-8"
    )
    r = _run(run_cmd, doctor, env_fix)
    assert r.returncode == 2


def test_t002651_json_liefert_maschinenlesbare_befunde(run_cmd, doctor, env_fix):
    _fixture(
        env_fix,
        '{"zeta-fixture-plugin@fixture-market": true}',
        '{"zeta-fixture-plugin@fixture-market": true}',
        "{}",
    )
    r = _run(run_cmd, doctor, env_fix, "--json")
    assert r.returncode == 1
    json.loads(r.output)


# ── Repo-Fakten: in CI ohne jedes ~/.claude pruefbar, fail-closed ──────────────


def _repo_enabled_plugins(repo_root):
    return json.loads((repo_root / ".claude/settings.json").read_text(encoding="utf-8")).get("enabledPlugins", {})


def test_t002651_jeder_enabled_plugins_key_hat_die_form_plugin_marketplace(repo_root):
    d = _repo_enabled_plugins(repo_root)
    assert len(d) >= 1, "ANCHOR_FAIL: enabledPlugins ist leer"
    pattern = r"[A-Za-z0-9][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9._-]*"
    bad = [k for k in d if not re.fullmatch(pattern, k)]
    assert not bad, "MALFORMED: " + " ".join(bad)


def test_t002651_kein_enabled_plugins_key_erscheint_doppelt(repo_root):
    raw = (repo_root / ".claude/settings.json").read_text(encoding="utf-8")
    d = json.loads(raw).get("enabledPlugins", {})
    assert d, "ANCHOR_FAIL: enabledPlugins ist leer"
    block = re.search(r'"enabledPlugins"\s*:\s*\{(.*?)\n\s*\}', raw, re.S)
    assert block, "ANCHOR_FAIL: enabledPlugins-Block nicht gefunden"
    # json.load dedupliziert still, deshalb auf der Rohdatei zaehlen.
    keys = re.findall(r'"([^"]+)"\s*:', block.group(1))
    dupes = [k for k, n in collections.Counter(keys).items() if n > 1]
    assert not dupes, "DUPLICATE: " + " ".join(dupes)


def test_t002651_jedes_marketplace_segment_ist_ein_bekanntes_marketplace(repo_root):
    known = {"claude-plugins-official", "superpowers-marketplace", "braintrust-claude-plugin"}
    d = _repo_enabled_plugins(repo_root)
    assert d, "ANCHOR_FAIL: enabledPlugins ist leer"
    unknown = sorted({k.split("@", 1)[1] for k in d if "@" in k} - known)
    assert not unknown, "UNKNOWN_MARKETPLACE: " + " ".join(unknown)


# ── Schema-Wachhund ───────────────────────────────────────────────────────────


def test_t002651_ein_im_echten_schema_installiertes_plugin_ist_kein_befund(run_cmd, doctor, env_fix):
    _fixture(
        env_fix,
        '{"zeta-fixture-plugin@fixture-market": true}',
        '{"zeta-fixture-plugin@fixture-market": true}',
        '{"zeta-fixture-plugin@fixture-market": [{"scope": "user", "installPath": "/tmp/fixture"}]}',
    )
    r = _run(run_cmd, doctor, env_fix)
    assert r.returncode == 0, "Fehlalarm bei sauberem Zustand:\n" + r.output


def test_t002651_fehlender_plugins_knoten_ist_exit_2_nicht_stiller_fallback(run_cmd, doctor, env_fix):
    env_fix["REPO_SETTINGS"].write_text(
        '{"enabledPlugins": {"zeta-fixture-plugin@fixture-market": true}}\n', encoding="utf-8"
    )
    (env_fix["HOMEDIR"] / "settings.json").write_text(
        '{"enabledPlugins": {"zeta-fixture-plugin@fixture-market": true}}\n', encoding="utf-8"
    )
    (env_fix["HOMEDIR"] / "plugins" / "installed_plugins.json").write_text(
        '{"version": 3, "entries": {}}\n', encoding="utf-8"
    )
    r = _run(run_cmd, doctor, env_fix)
    assert r.returncode == 2, f"erwartet Exit 2, war {r.returncode}:\n{r.output}"
    assert re.search(r"schema", r.output, re.I)
