"""Native migration of tests/spec/repo-hygiene/worktree-clean-check-existence.bats."""

# (T002932)

import os
import re
from pathlib import Path

import pytest


@pytest.fixture
def ctx(repo_root: Path, run_cmd, tmp_path):
    return {
        "check": repo_root / "scripts" / "worktree-clean-check.sh",
        "ops": repo_root / ".claude" / "skills" / "references" / "repo-hygiene-ops.md",
        "run": run_cmd,
        "tmp": tmp_path,
    }


def _git(run, wt: Path, *args):
    return run(["git", "-C", str(wt), *args])


def _make_repo(run, wt: Path) -> None:
    (wt / "components" / "website" / "src" / "data").mkdir(parents=True)
    (wt / "scripts").mkdir(parents=True, exist_ok=True)
    _git(run, wt, "init", "-q").check(0)
    _git(run, wt, "symbolic-ref", "HEAD", "refs/heads/main").check(0)
    _git(run, wt, "config", "user.email", "t002932@example.invalid").check(0)
    _git(run, wt, "config", "user.name", "T002932 Guard").check(0)
    (wt / "components" / "website" / "src" / "data" / "test-inventory.json").write_text("{}\n", encoding="utf-8")
    (wt / "scripts" / "beispiel.sh").write_text("echo base\n", encoding="utf-8")
    _git(run, wt, "add", "-A").check(0)
    _git(run, wt, "commit", "-qm", "base").check(0)


def test_t002932_existing_clean_worktree_is_still_reported_clean(ctx):
    assert os.access(ctx["check"], os.X_OK), "worktree-clean-check.sh not executable"
    wt = ctx["tmp"] / "sauber"
    _make_repo(ctx["run"], wt)
    res = ctx["run"](["bash", str(ctx["check"]), str(wt)])
    assert res.returncode == 0, res.output


def test_t002932_missing_worktree_directory_is_not_clean(ctx):
    assert os.access(ctx["check"], os.X_OK)
    missing = ctx["tmp"] / "gibt-es-nicht"
    assert not missing.exists()
    res = ctx["run"](["bash", str(ctx["check"]), str(missing)])
    assert res.returncode != 0
    assert str(missing) in res.output


def test_t002932_path_without_git_repository_is_not_clean(ctx):
    assert os.access(ctx["check"], os.X_OK)
    nogit = ctx["tmp"] / "kein-repo"
    nogit.mkdir()
    assert nogit.is_dir()
    res = ctx["run"](["bash", str(ctx["check"]), str(nogit)])
    assert res.returncode != 0


def test_t002932_generat_allowlist_from_s1_stays_effective(ctx):
    assert os.access(ctx["check"], os.X_OK)
    wt = ctx["tmp"] / "generat"
    _make_repo(ctx["run"], wt)
    (wt / "components" / "website" / "src" / "data" / "test-inventory.json").write_text(
        '{"regeneriert": true}\n', encoding="utf-8")

    # Positiv-Anker: fuer git ist der Worktree dirty.
    assert _git(ctx["run"], wt, "status", "--porcelain").stdout.strip() != ""

    res = ctx["run"](["bash", str(ctx["check"]), str(wt)])
    assert res.returncode == 0, res.output

    with open(wt / "scripts" / "beispiel.sh", "a", encoding="utf-8") as fh:
        fh.write("echo ungesicherte Arbeit\n")
    res = ctx["run"](["bash", str(ctx["check"]), str(wt)])
    assert res.returncode != 0
    assert "scripts/beispiel.sh" in res.output


def test_t002932_runbook_s1_invokes_the_check_script(ctx):
    ops = ctx["ops"]
    assert ops.is_file()
    text = ops.read_text(encoding="utf-8")
    sec = _section(text, r"^## 1[.]")
    assert sec, "section 1 empty"
    assert "git worktree remove" in sec
    assert "scripts/worktree-clean-check.sh" in sec


def _section(text: str, pattern: str) -> str:
    rx = re.compile(pattern)
    inside = False
    out = []
    for line in text.split("\n"):
        if rx.search(line):
            inside = True
            continue
        if inside and line.startswith("## "):
            inside = False
        if inside:
            out.append(line)
    return "\n".join(out)
