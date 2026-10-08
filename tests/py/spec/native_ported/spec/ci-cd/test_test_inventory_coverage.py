"""Native migration of tests/spec/ci-cd/test-inventory-coverage.bats."""

import json
import os
import re
import subprocess
from pathlib import Path

import pytest

STRAY_REL = "tests/spec/ci-cd/stray-ignored-test-T002664.bats"
ANCHOR_REL = "tests/spec/ci-cd/anchor-visible-T002664.bats"


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
    assert (repo / "tests/spec/ci-cd/spec-dir-convention.bats").is_file()
    jq = _jq(run_cmd, repo, "--arg", "p", "tests/spec/ci-cd/spec-dir-convention.bats",
             "[.[] | select(.file == $p)] | length", str(sandbox["path"]))
    assert jq.returncode == 0
    assert int(jq.stdout.strip()) >= 1


def test_inventory_bestandsdatei_auf_oberster_ebene_ohne_id_erzeugt_einen_eintrag(run_cmd, sandbox):
    repo = sandbox["repo"]
    assert (repo / "tests/spec/ci-cd.bats").is_file()
    jq = _jq(run_cmd, repo, "--arg", "p", "tests/spec/ci-cd.bats",
             "[.[] | select(.file == $p)] | length", str(sandbox["path"]))
    assert jq.returncode == 0
    assert int(jq.stdout.strip()) >= 1


def test_inventory_jede_tests_spec_datei_ist_erfasst(run_cmd, sandbox):
    repo = sandbox["repo"]
    found = sorted(str(p.relative_to(repo)) for p in (repo / "tests/spec").rglob("*.bats"))
    # Positiv-Anker: es gibt ueberhaupt Dateien zu pruefen.
    assert len(found) >= 100
    jq = _jq(run_cmd, repo, "-r", ".[].file", str(sandbox["path"]))
    inventoried = set(jq.stdout.splitlines())
    uncovered = [f for f in found if f not in inventoried]
    if uncovered:
        print("nicht erfasst:\n" + "\n".join(uncovered))
    assert uncovered == []


def test_inventory_dateien_mit_strukturierten_ids_behalten_ihre_eintraege(run_cmd, sandbox):
    repo = sandbox["repo"]
    jq = _jq(run_cmd, repo, '[.[] | select(.file | startswith("tests/spec/harness-workflow-split")) '
                            '| select(.id | startswith("HWS-"))] | length', str(sandbox["path"]))
    assert jq.returncode == 0
    text = (repo / "tests/spec/harness-workflow-split.bats").read_text()
    expected = sum(1 for ln in text.splitlines() if re.match(r'^@test "HWS-[0-9]+:', ln))
    assert int(jq.stdout.strip()) == expected
    first = _jq(run_cmd, repo, "-r", '[.[] | select(.file | startswith("tests/spec/harness-workflow-split")) '
                                     '| select(.id | startswith("HWS-")) | .id] | sort | first',
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
    (repo / "scripts").mkdir(parents=True)
    (repo / "tests/spec/ci-cd").mkdir(parents=True)
    builder_src = repo_root / "scripts/build-test-inventory.sh"
    (repo / "scripts/build-test-inventory.sh").write_text(builder_src.read_text())
    original = (repo_root / ".gitignore").read_text() if (repo_root / ".gitignore").is_file() else ""
    (repo / ".gitignore").write_text(original + ("" if original.endswith("\n") or not original else "\n")
                                     + STRAY_REL + "\n")
    (repo / ANCHOR_REL).write_text('@test "anchor" { true; }\n')
    (repo / STRAY_REL).write_text('@test "stray" { true; }\n')
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
