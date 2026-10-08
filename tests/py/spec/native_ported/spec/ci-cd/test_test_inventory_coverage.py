"""Native migration of tests/spec/ci-cd/test-inventory-coverage.bats.

[T901392] Seit der BATS-Deinstallation erfasst das Inventar pytest-Module (tests/py/local,
tests/py/spec); IDs und Kategorien kommen aus der im Docstring deklarierten Originalquelle."""

import json
import os
import re
import subprocess
from pathlib import Path

import pytest

STRAY_REL = "tests/py/spec/ci-cd/test_stray_ignored_t002664.py"
ANCHOR_REL = "tests/py/spec/ci-cd/test_anchor_visible_t002664.py"


@pytest.fixture(scope="module")
def sandbox(repo_root, tmp_path_factory):
    """setup_file: Inventar in die Sandbox erzeugen (das committete JSON bleibt unberuehrt)."""
    out = tmp_path_factory.mktemp("inventory") / "inventory.json"
    res = subprocess.run(["bash", str(repo_root / "scripts/build-test-inventory.sh")],
                         cwd=str(repo_root), env={**os.environ, "TEST_INVENTORY_OUT": str(out)},
                         capture_output=True, text=True)
    assert out.is_file() and out.stat().st_size > 0, f"build_sandbox_inventory fehlgeschlagen: {res.stderr}"
    return {"path": out, "repo": repo_root}


def _jq(run_cmd, repo_root, *args):
    return run_cmd(["jq", *args], cwd=repo_root)


def test_inventory_ausgabepfad_ist_ueber_test_inventory_out_umlenkbar(run_cmd, sandbox, tmp_path):
    repo = sandbox["repo"]
    builder = repo / "scripts/build-test-inventory.sh"
    out = tmp_path / "inventory-redirect.json"
    res = run_cmd(["bash", "-c", f"TEST_INVENTORY_OUT='{out}' bash '{builder}'"], cwd=repo)
    assert res.returncode == 0
    assert out.is_file() and out.stat().st_size > 0, "Die Umlenkung muss wirken"
    jq = _jq(run_cmd, repo, "length", str(out))
    assert int(jq.stdout.strip()) > 0


def test_inventory_datei_unter_der_t002416_verzeichniskonvention_erzeugt_einen_eintrag(run_cmd, sandbox):
    repo = sandbox["repo"]
    module = "tests/py/spec/native_ported/spec/ci-cd/test_test_inventory_coverage.py"
    assert (repo / module).is_file()
    jq = _jq(run_cmd, repo, "-r", "--arg", "p", module,
             r'.[] | select(.file == $p) | "\(.id) \(.category)"', str(sandbox["path"]))
    assert jq.stdout.strip() == "ci-cd/test-inventory-coverage ci-cd"


def test_inventory_bestandsdatei_auf_oberster_ebene_ohne_id_erzeugt_einen_eintrag(run_cmd, sandbox):
    repo = sandbox["repo"]
    module = "tests/py/spec/native_ported/spec/test_ci_cd_part1.py"
    assert (repo / module).is_file()
    jq = _jq(run_cmd, repo, "-r", "--arg", "p", module,
             r'.[] | select(.file == $p) | "\(.id) \(.category)"', str(sandbox["path"]))
    assert jq.stdout.strip() == "ci-cd ci-cd"


def test_inventory_jede_tests_spec_datei_ist_erfasst(run_cmd, sandbox):
    repo = sandbox["repo"]
    found = sorted(str(p.relative_to(repo)) for p in (repo / "tests/py/spec").rglob("test_*.py"))
    # Positiv-Anker: es gibt ueberhaupt Dateien zu pruefen.
    assert len(found) >= 100
    jq = _jq(run_cmd, repo, "-r", ".[].file", str(sandbox["path"]))
    inventoried = set(jq.stdout.splitlines())
    # Geteilte Module (_partN) teilen sich eine ID; erfasst ist die erste Datei der Gruppe.
    def covered(f):
        return f in inventoried or re.sub(r"_part[0-9]+\.py$", "_part1.py", f) in inventoried
    uncovered = [f for f in found if not covered(f)]
    if uncovered:
        print("nicht erfasst:\n" + "\n".join(uncovered))
    assert uncovered == []


def test_inventory_dateien_mit_strukturierten_ids_behalten_ihre_eintraege(run_cmd, sandbox):
    repo = sandbox["repo"]
    module = "tests/py/spec/native_ported/spec/test_harness_workflow_split.py"
    jq = _jq(run_cmd, repo, "--arg", "p", module,
             '[.[] | select(.file == $p) | select(.id | startswith("HWS-"))] | length', str(sandbox["path"]))
    assert jq.returncode == 0
    text = (repo / module).read_text()
    expected = len(set(re.findall(r'^\s+"""(HWS-[0-9]+):', text, re.M)))
    assert expected >= 10
    assert int(jq.stdout.strip()) == expected
    first = _jq(run_cmd, repo, "-r", "--arg", "p", module,
                '[.[] | select(.file == $p) | select(.id | startswith("HWS-")) | .id] | sort | first',
                str(sandbox["path"]))
    assert first.stdout.strip() == "HWS-1"


def test_inventory_schema_bleibt_unveraendert_id_file_category_kind_kein_tier(run_cmd, sandbox):
    repo = sandbox["repo"]
    jq = _jq(run_cmd, repo, '[.[] | select((.id|type) != "string" or (.file|type) != "string" '
                            'or (.category|type) != "string" or (.kind|type) != "string")] | length',
             str(sandbox["path"]))
    assert jq.returncode == 0
    assert int(jq.stdout.strip()) == 0
    jq = _jq(run_cmd, repo, '[.[] | select(has("tier"))] | length', str(sandbox["path"]))
    assert int(jq.stdout.strip()) == 0


def test_inventory_committetes_json_ist_mit_dem_builder_ergebnis_deckungsgleich(sandbox):
    committed = sandbox["repo"] / "components/website/src/data/test-inventory.json"
    # diff <(jq -S .) <(jq -S .): gleiche Daten nach kanonischer Sortierung.
    a = json.loads(committed.read_text())
    b = json.loads(sandbox["path"].read_text())
    assert json.dumps(a, sort_keys=True, indent=1) == json.dumps(b, sort_keys=True, indent=1)


def test_t002664_inventory_builder_ignoriert_durch_gitignore_ausgeschlossene_testdateien(run_cmd, repo_root, tmp_path):
    # Der Original-Test haengt eine Zeile an die echte .gitignore an und legt eine Datei
    # im Arbeitsbaum an. Das ist im Port verboten (Regel 7): der Test laeuft in einem
    # Wegwerf-Repo mit Kopie des Builders und einer identischen .gitignore-Zeile.
    repo = tmp_path / "repo"
    (repo / "scripts/lib").mkdir(parents=True)
    (repo / "tests/py/spec/ci-cd").mkdir(parents=True)
    for rel in ("scripts/build-test-inventory.sh", "scripts/lib/pytest-inventory.py"):
        (repo / rel).write_text((repo_root / rel).read_text())
    original = (repo_root / ".gitignore").read_text() if (repo_root / ".gitignore").is_file() else ""
    (repo / ".gitignore").write_text(original + ("" if original.endswith("\n") or not original else "\n")
                                     + STRAY_REL + "\n")
    (repo / ANCHOR_REL).write_text('"""Anchor."""\n\n\ndef test_anchor():\n    pass\n')
    (repo / STRAY_REL).write_text('"""Stray."""\n\n\ndef test_stray():\n    pass\n')
    subprocess.run(["git", "init", "-q", str(repo)], check=True)

    out = tmp_path / "inventory-t002664.json"
    res = run_cmd(["bash", str(repo / "scripts/build-test-inventory.sh")], cwd=repo,
                  env={"TEST_INVENTORY_OUT": str(out)})
    assert res.returncode == 0
    # Positiv-Anker: die nicht ignorierte Anker-Datei ist erfasst.
    jq = _jq(run_cmd, repo, "--arg", "p", ANCHOR_REL, "[.[] | select(.file == $p)] | length", str(out))
    assert int(jq.stdout.strip()) >= 1
    jq = _jq(run_cmd, repo, "--arg", "p", STRAY_REL, "[.[] | select(.file == $p)] | length", str(out))
    assert int(jq.stdout.strip()) == 0
