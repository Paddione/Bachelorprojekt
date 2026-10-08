"""Native migration of tests/spec/health-goals/dashboard-rescan.bats."""

import hashlib
import json
import shutil

import pytest

WRAPPER = "scripts/health-goals-scan.sh"
ARTIFACT = "components/website/src/lib/sdlc/goals-data.generated.json"


@pytest.fixture(autouse=True)
def _require_python3():
    if shutil.which("python3") is None:
        pytest.skip("python3 not installed")


def _sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_messbares_ziel_g_cq06_exit_0_genau_ein_eintrag_measurable_true_actual_zahl(
    repo_root, run_cmd
):
    result = run_cmd(["bash", WRAPPER, "G-CQ06"], cwd=repo_root)
    assert result.returncode == 0, result.stderr
    data = json.loads(result.stdout)
    assert isinstance(data, list), f"Ausgabe ist kein JSON-Array: {type(data)}"
    entries = [e for e in data if e.get("id") == "G-CQ06"]
    assert len(entries) == 1, f"erwartet genau 1 Eintrag fuer G-CQ06, gefunden {len(entries)}"
    entry = entries[0]
    assert entry.get("measurable") is True, f"measurable ist nicht True: {entry}"
    assert isinstance(entry.get("actual"), int), f"actual ist keine Zahl: {entry.get('actual')!r}"


def test_positiv_anker_anzahl_eintraege_anzahl_angeforderter_ids(repo_root, run_cmd):
    result = run_cmd(["bash", WRAPPER, "G-CQ06", "G-TEST05", "--fast"], cwd=repo_root)
    assert result.returncode == 0, result.stderr
    data = json.loads(result.stdout)
    assert len(data) == 2, f"erwartet 2 Eintraege, gefunden {len(data)}"


def test_nicht_messbares_ziel_g_test05_fast_measurable_false_kein_actual_kein_dokumentierter_wert(
    repo_root, run_cmd
):
    result = run_cmd(["bash", WRAPPER, "--fast", "G-TEST05"], cwd=repo_root)
    assert result.returncode == 0, result.stderr
    data = json.loads(result.stdout)
    entries = [e for e in data if e.get("id") == "G-TEST05"]
    assert len(entries) == 1, f"erwartet genau 1 Eintrag fuer G-TEST05, gefunden {len(entries)}"
    entry = entries[0]
    assert entry.get("measurable") is False, f"measurable ist nicht False: {entry}"
    assert "actual" not in entry, f"SKIP-Eintrag traegt ein actual-Feld: {entry}"
    artifact = json.loads((repo_root / ARTIFACT).read_text(encoding="utf-8"))
    doc = next(g for g in artifact if g["id"] == "G-TEST05")
    if doc.get("current") is not None:
        assert doc["current"] != entry.get("actual"), (
            f"dokumentierter Wert {doc['current']} taucht als Messwert auf"
        )


def test_unbekannte_id_wird_abgelehnt_exit_ungleich_0_stderr_nennt_die_id(repo_root, run_cmd):
    result = run_cmd(["bash", WRAPPER, "G-NICHT-EXISTENT"], cwd=repo_root)
    assert result.returncode != 0
    assert "G-NICHT-EXISTENT" in result.stderr
    assert result.stdout == ""


def test_id_mit_shell_metazeichen_wird_abgelehnt(repo_root, run_cmd):
    result = run_cmd(["bash", WRAPPER, "G-BAD;echo injected"], cwd=repo_root)
    assert result.returncode != 0
    assert "G-BAD" in result.stderr
    assert "injected ok" not in result.stderr
    assert result.stdout == ""


def test_ohne_argumente_usage_auf_stderr_exit_2(repo_root, run_cmd):
    result = run_cmd(["bash", WRAPPER], cwd=repo_root)
    assert result.returncode == 2
    assert "Usage:" in result.stderr
    assert result.stdout == ""


def test_ssot_bleibt_byte_gleich_goals_md_und_generiertes_artefakt_unveraendert(
    repo_root, run_cmd
):
    goals_md = repo_root / ".claude" / "lib" / "goals.md"
    artifact = repo_root / ARTIFACT
    before_md, before_json = _sha256(goals_md), _sha256(artifact)
    result = run_cmd(["bash", WRAPPER, "G-CQ06", "--fast", "G-TEST05"], cwd=repo_root)
    assert result.returncode == 0, result.stderr
    assert _sha256(goals_md) == before_md
    assert _sha256(artifact) == before_json
