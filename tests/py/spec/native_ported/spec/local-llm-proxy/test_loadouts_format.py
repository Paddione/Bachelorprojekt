"""Native migration of tests/spec/local-llm-proxy/loadouts-format.bats."""

# [T002553]

import json
import shutil

GUARD = "scripts/llm/loadouts-format.mjs"
CANON_JS = 'console.log(JSON.stringify(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"))))'


def _ensure_ascii_rewrite(path):
    """python3 json.dump(doc, indent=2): ensure_ascii escapes, no trailing newline."""
    with open(path, encoding="utf-8") as fh:
        doc = json.load(fh)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=2)


def _strip_trailing_newlines(path):
    """printf '%s' "$(cat f)": drops every trailing newline."""
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text.rstrip("\n"))


def _check(run_cmd, repo_root, path):
    return run_cmd(["node", str(repo_root / GUARD), "--check", str(path)], cwd=repo_root)


def test_loadouts_format_t002553_die_ausgelieferte_loadouts_json_ist_kanonisch(run_cmd, repo_root):
    res = run_cmd(["node", str(repo_root / GUARD), "--check"], cwd=repo_root)
    assert res.returncode == 0, res.output
    assert "ist kanonisch" in res.output


def test_loadouts_format_t002553_escapte_nicht_ascii_zeichen_werden_erkannt_und_benannt(run_cmd, repo_root, tmp_path):
    copy = tmp_path / "loadouts.json"
    shutil.copy(repo_root / "scripts/llm/loadouts.json", copy)
    assert _check(run_cmd, repo_root, copy).returncode == 0

    _ensure_ascii_rewrite(copy)
    res = _check(run_cmd, repo_root, copy)
    assert res.returncode == 1
    assert "ensure_ascii" in res.output


def test_loadouts_format_t002553_fehlender_abschliessender_zeilenumbruch_wird_erkannt(run_cmd, repo_root, tmp_path):
    copy = tmp_path / "loadouts.json"
    shutil.copy(repo_root / "scripts/llm/loadouts.json", copy)
    assert _check(run_cmd, repo_root, copy).returncode == 0

    _strip_trailing_newlines(copy)
    res = _check(run_cmd, repo_root, copy)
    assert res.returncode == 1
    assert "Zeilenumbruch" in res.output


def test_loadouts_format_t002553_der_guard_nennt_die_reparaturanweisung_nicht_nur_den_befund(run_cmd, repo_root, tmp_path):
    copy = tmp_path / "loadouts.json"
    shutil.copy(repo_root / "scripts/llm/loadouts.json", copy)
    _strip_trailing_newlines(copy)
    res = _check(run_cmd, repo_root, copy)
    assert res.returncode == 1
    assert "task llm:loadouts:format" in res.output


def test_loadouts_format_t002553_write_stellt_die_kanonische_form_her(run_cmd, repo_root, tmp_path):
    copy = tmp_path / "loadouts.json"
    shutil.copy(repo_root / "scripts/llm/loadouts.json", copy)
    _ensure_ascii_rewrite(copy)
    assert _check(run_cmd, repo_root, copy).returncode == 1

    res = run_cmd(["node", str(repo_root / GUARD), "--write", str(copy)], cwd=repo_root)
    assert res.returncode == 0, res.output
    assert _check(run_cmd, repo_root, copy).returncode == 0


def test_loadouts_format_t002553_write_erhaelt_den_inhalt_es_normalisiert_nur_die_form(run_cmd, repo_root, tmp_path):
    copy = tmp_path / "loadouts.json"
    shutil.copy(repo_root / "scripts/llm/loadouts.json", copy)
    before = run_cmd(["node", "-e", CANON_JS, str(copy)], cwd=repo_root).output
    _ensure_ascii_rewrite(copy)
    res = run_cmd(["node", str(repo_root / GUARD), "--write", str(copy)], cwd=repo_root)
    assert res.returncode == 0, res.output
    after = run_cmd(["node", "-e", CANON_JS, str(copy)], cwd=repo_root).output
    assert before == after


def test_loadouts_format_t002553_ein_kaputtes_dokument_meldet_lesefehler_statt_formatfehler(run_cmd, repo_root, tmp_path):
    copy = tmp_path / "loadouts.json"
    copy.write_text("{ kaputt\n", encoding="utf-8")
    res = _check(run_cmd, repo_root, copy)
    assert res.returncode == 2
    assert "task llm:loadouts:format" not in res.output
