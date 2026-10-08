"""Native migration of tests/spec/ci-cd/spec-dir-convention.bats."""

import json
import re
from pathlib import Path

import pytest


def _lines_matching(text: str, pattern: str):
    return [ln for ln in text.splitlines() if re.search(pattern, ln)]


def _task_spec_block(taskfile: Path) -> str:
    """awk '/^  test:spec:$/{f=1;next} f && /^  [a-z]...:$/{exit} f' | grep -vE '^\\s*#'"""
    out, inside = [], False
    for ln in taskfile.read_text().splitlines():
        if not inside:
            if re.match(r"^  test:spec:$", ln):
                inside = True
            continue
        if re.match(r"^  [a-z][a-zA-Z0-9:_-]*:$", ln):
            break
        out.append(ln)
    return "\n".join(ln for ln in out if not re.match(r"^\s*#", ln))


def test_spec_dir_runner_erfasst_unterverzeichnisse(run_cmd, repo_root):
    # Positiv-Anker: es gibt Tests in Unterverzeichnissen.
    nested = [p for p in (repo_root / "tests/spec").rglob("*.bats")
              if len(p.relative_to(repo_root / "tests/spec").parts) >= 2]
    assert len(nested) > 0
    taskfile = repo_root / "taskfiles/Taskfile.test.yml"
    block = _task_spec_block(taskfile)
    assert block.strip() != ""
    assert re.search(r"bats-core/bin/bats|run-bats\.sh", block)
    # ... und waehlt die Dateien rekursiv aus.
    assert re.search(r"bats .*-r .*tests/spec|find tests/spec .*-name", block)


def test_spec_dir_zaehl_logik_in_test_spec_changed_zaehlt_auch_unterverzeichnisse(repo_root):
    taskfile = (repo_root / "taskfiles/Taskfile.test.yml").read_text().splitlines()
    total_lines = [ln for ln in taskfile if "TOTAL=" in ln]
    assert total_lines, "grep -n 'TOTAL=' ohne Treffer"
    flat = [ln for ln in total_lines if "ls tests/spec/*.bats" in ln]
    assert len(flat) == 0


def test_spec_dir_find_changed_tests_findet_tests_in_unterverzeichnissen(run_cmd, repo_root):
    # Positiv-Anker: das Skript laeuft.
    res = run_cmd(["bash", str(repo_root / "scripts/find-changed-tests.sh"), "spec"],
                  cwd=repo_root, env={"FIND_CHANGED_TESTS_FILES": ""})
    assert res.returncode == 0
    script_lines = (repo_root / "scripts/find-changed-tests.sh").read_text().splitlines()
    code = [ln for ln in script_lines if not re.match(r"^\s*#", ln)]
    # Der flache Glob in der Pfad-Probe darf nicht mehr vorkommen.
    flat = [ln for ln in code if "grep -lF" in ln and 'BASE_DIR"/*.bats' in ln]
    assert len(flat) == 0
    # Positiv-Gegenprobe: die Probe sucht rekursiv.
    recursive = [ln for ln in code if re.search(r'find "\$BASE_DIR".*grep -lF', ln)]
    assert len(recursive) >= 1


def test_spec_dir_test_inventar_erfasst_unterverzeichnisse(run_cmd, repo_root, tmp_path):
    spec_file = repo_root / "tests/spec/ci-cd/spec-dir-convention.bats"
    assert spec_file.is_file()
    sandbox = tmp_path / "inventory.json"
    res = run_cmd(["bash", str(repo_root / "scripts/build-test-inventory.sh")], cwd=repo_root,
                  env={"TEST_INVENTORY_OUT": str(sandbox)})
    assert res.returncode == 0
    jq = run_cmd(["jq", "--arg", "p", "tests/spec/ci-cd/spec-dir-convention.bats",
                  "[.[] | select(.file == $p)] | length", str(sandbox)], cwd=repo_root)
    assert jq.returncode == 0
    assert int(jq.stdout.strip()) >= 1


def test_spec_dir_merge_union_ist_fuer_bats_nicht_gesetzt(repo_root):
    text = (repo_root / ".gitattributes").read_text().splitlines()
    assert len([ln for ln in text if "merge=" in ln]) >= 1
    assert len([ln for ln in text if re.match(r"^[^#]*\.bats.*merge=union", ln)]) == 0


def test_spec_dir_die_konventionsdoku_beschreibt_die_verzeichnisform(repo_root):
    docs = [repo_root / "CLAUDE.md", repo_root / "tests/CLAUDE.md"]
    present = sum(1 for d in docs if d.is_file())
    assert present > 0, f"Anker: vorhandene Konventionsdokumente={present} von {len(docs)}"
    found = False
    for d in docs:
        if not d.is_file():
            continue
        text = d.read_text()
        if "BATS convention" not in text or "tests/spec/<spec-slug>/" not in text:
            continue
        found = True
        break
    assert found, "Kein Konventionsdokument nennt 'BATS convention' zusammen mit 'tests/spec/<spec-slug>/'"
