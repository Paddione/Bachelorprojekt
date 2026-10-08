"""Native migration of tests/spec/pr-refresh.bats."""

import glob
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest


@pytest.fixture
def pr(repo_root, tmp_path):
    """BATS setup: gh-Stub, Push-Log und Umgebungsvariablen des Skripts."""
    stub_dir = tmp_path / "stub"
    stub_dir.mkdir()
    gh_stub = stub_dir / "gh-stub.sh"
    gh_stub.write_text('#!/usr/bin/env bash\ncat "${GH_FIXTURE:?GH_FIXTURE not set}"\n', encoding="utf-8")
    gh_stub.chmod(0o755)
    push_log = tmp_path / "push.log"
    push_log.write_text("", encoding="utf-8")
    env = {
        "PR_REFRESH_GH_CMD": str(gh_stub),
        "PR_REFRESH_PUSH_LOG": str(push_log),
        "PR_REFRESH_DRY_PUSH": "1",
        "PR_REFRESH_ME": "Paddione",
    }
    return {
        "script": str(repo_root / "scripts" / "pr-refresh.sh"),
        "root": repo_root,
        "tmp": tmp_path,
        "env": env,
        "push_log": push_log,
    }


def _fixture(pr, payload: str) -> dict:
    gh_fixture = pr["tmp"] / "gh.json"
    gh_fixture.write_text(payload, encoding="utf-8")
    return {**pr["env"], "GH_FIXTURE": str(gh_fixture)}


def _pushed(pr) -> bool:
    return pr["push_log"].is_file() and pr["push_log"].stat().st_size > 0


def test_pr_refresh_skript_existiert_und_ist_ausfuehrbar(pr):
    p = Path(pr["script"])
    assert p.is_file()
    assert os.access(p, os.X_OK)


def test_pr_refresh_help_nennt_die_drei_guards_namentlich(run_cmd, pr):
    r = run_cmd(["bash", pr["script"], "--help"], env=pr["env"])
    # Positiv-Anker: --help muss erfolgreich laufen.
    assert r.returncode == 0, r.output
    # Guard-Begriffe muessen in der Guards-Sektion stehen.
    guards_lines = []
    inside = False
    for line in r.output.splitlines():
        if re.match(r"^Guards:", line):
            inside = True
        if inside:
            guards_lines.append(line)
            if line == "":
                break
    guards = "\n".join(guards_lines)
    assert guards.strip() != ""
    assert "force-with-lease" in guards
    assert "agent-lock" in guards
    assert "generiert" in guards


def test_pr_refresh_mergeable_pr_wird_uebersprungen_ohne_zu_pushen(run_cmd, pr):
    env = _fixture(pr, '{"number":1,"mergeable":"MERGEABLE","headRefName":"feature/x","author":{"login":"Paddione"}}')
    r = run_cmd(["bash", pr["script"], "1"], env=env)
    assert r.returncode == 0, r.output
    # Positiv-Anker: der Lauf hat den PR tatsaechlich bewertet.
    assert re.search(r"MERGEABLE", r.output, re.IGNORECASE)
    # ... und trotzdem nicht gepusht.
    assert not _pushed(pr)


def test_pr_refresh_fremder_autor_wird_abgelehnt_ohne_zu_pushen(run_cmd, pr):
    env = _fixture(pr, '{"number":2,"mergeable":"CONFLICTING","headRefName":"feature/y","author":{"login":"SomeoneElse"}}')
    r = run_cmd(["bash", pr["script"], "2"], env=env)
    assert r.returncode != 0
    assert "SomeoneElse" in r.output
    assert not _pushed(pr)


def test_pr_refresh_lokal_ausgecheckter_branch_wird_abgelehnt_ohne_zu_pushen(run_cmd, pr):
    # Branch aus der Worktree-Liste lesen; detached HEAD liefert keinen Branch -> skip.
    wt = subprocess.run(["git", "-C", str(pr["root"]), "worktree", "list", "--porcelain"],
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    own_branch = ""
    for line in wt.stdout.splitlines():
        if line.startswith("branch refs/heads/"):
            own_branch = line[len("branch refs/heads/"):]
            break
    if not own_branch:
        pytest.skip("kein Worktree mit ausgechecktem Branch (detached HEAD, z.B. GitHub Actions)")
    # Positiv-Anker: der Branch steht wirklich in der Worktree-Liste.
    r = run_cmd(["git", "-C", str(pr["root"]), "worktree", "list", "--porcelain"])
    assert r.returncode == 0, r.output
    assert f"branch refs/heads/{own_branch}" in r.stdout.splitlines()

    # Leeres Lock-Verzeichnis, damit Guard 3 (agent-lock) nicht vorher greift.
    locks = pr["tmp"] / "empty-locks"
    locks.mkdir()
    env = _fixture(pr, f'{{"number":9,"mergeable":"CONFLICTING","headRefName":"{own_branch}",'
                       f'"author":{{"login":"Paddione"}}}}')
    env["AGENT_LOCK_DIR"] = str(locks)
    r = run_cmd(["bash", pr["script"], "9"], env=env)
    assert r.returncode != 0, r.output
    assert "ausgecheckt" in r.output
    assert not _pushed(pr)


def test_pr_refresh_dry_run_mutiert_nichts(run_cmd, pr):
    env = _fixture(pr, '{"number":3,"mergeable":"CONFLICTING","headRefName":"feature/z","author":{"login":"Paddione"}}')
    r = run_cmd(["bash", pr["script"], "--dry-run", "3"], env=env)
    assert r.returncode == 0, r.output
    # Positiv-Anker: der Dry-run hat den PR verarbeitet (Nummer in einer Aktionszeile).
    action_lines = [line for line in r.output.splitlines() if re.match(r"^(DRY|\[dry-run\])", line)]
    assert any("3" in line for line in action_lines), r.output
    assert not _pushed(pr)


def test_pr_refresh_kennt_generierte_dateien_aus_gitattributes_statt_eigener_liste(run_cmd, pr, repo_root):
    # Positiv-Anker: .gitattributes fuehrt die Artefakte.
    count = len([line for line in (repo_root / ".gitattributes").read_text(encoding="utf-8").splitlines()
                 if "linguist-generated=true" in line])
    assert count >= 10
    # Das Skript leitet daraus ab, statt Pfade zu wiederholen.
    script_text = Path(pr["script"]).read_text(encoding="utf-8")
    assert re.search(r"gitattributes|filter-generated", script_text)
    assert len([line for line in script_text.splitlines() if "test-inventory.json" in line]) == 0


def test_pr_refresh_taskfile_einsprung_pr_refresh_existiert_s4_orphan_guard(repo_root):
    files = [repo_root / "Taskfile.yml"]
    files += sorted((repo_root / "taskfiles").glob("Taskfile.*.yml"))
    files += sorted((repo_root / "taskfiles").glob("Taskfile.*.yaml"))
    count = 0
    for f in files:
        for line in f.read_text(encoding="utf-8", errors="replace").splitlines():
            if re.match(r"^  [a-z][a-z0-9:_-]*:$", line):
                count += 1
    # Positiv-Anker: die Taskfile-Suite enthaelt ueberhaupt Tasks.
    assert count > 50
    # ... und pr:refresh ist einer davon.
    assert re.search(r"^  pr:refresh:", (repo_root / "taskfiles" / "Taskfile.process.yml").read_text(encoding="utf-8"),
                     re.MULTILINE)
