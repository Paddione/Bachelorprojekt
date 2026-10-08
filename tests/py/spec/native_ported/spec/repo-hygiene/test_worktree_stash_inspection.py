"""Native migration of tests/spec/repo-hygiene/worktree-stash-inspection.bats."""
# (T002709)
# Blocks 2 and 3 extract the documented command forms from the runbook and run

# them in a throwaway repository with bash -c, as the bats original does.

import re
from pathlib import Path

import pytest


@pytest.fixture
def ctx(repo_root: Path, run_cmd, tmp_path):
    return {"ops": repo_root / ".claude" / "skills" / "references" / "repo-hygiene-ops.md",
            "run": run_cmd, "tmp": tmp_path}


def _make_stash_repo(run, wt: Path) -> None:
    wt.mkdir(parents=True)
    def git(*args):
        return run(["git", "-C", str(wt), *args])
    git("init", "-q").check(0)
    git("symbolic-ref", "HEAD", "refs/heads/main").check(0)
    git("config", "user.email", "t002709@example.invalid").check(0)
    git("config", "user.name", "T002709 Guard").check(0)
    (wt / "alpha.txt").write_text("base\n", encoding="utf-8")
    (wt / "beta.txt").write_text("base\n", encoding="utf-8")
    git("add", "-A").check(0)
    git("commit", "-qm", "base").check(0)
    with open(wt / "alpha.txt", "a", encoding="utf-8") as fh:
        fh.write("MARKER_ALPHA_T002709\n")
    with open(wt / "beta.txt", "a", encoding="utf-8") as fh:
        fh.write("MARKER_BETA_T002709\n")
    git("stash", "push", "-q", "-m", "t002709-fixture").check(0)


def _first_line_with(lines: list[str], *needles: str) -> str:
    for line in lines:
        if all(n in line for n in needles):
            return line
    return ""


def _sed_from(line: str, start: str) -> str:
    """Mirror of: sed 's/.*\\(<start>[^`]*\\).*/\\1/'"""
    m = re.match(r".*(" + re.escape(start) + r"[^`]*).*", line)
    return m.group(1) if m else line


def test_t002709_runbook_has_worktree_free_stash_section_before_worktrees(ctx):
    lines = ctx["ops"].read_text(encoding="utf-8").split("\n")
    assert ctx["ops"].is_file()
    headings = [l for l in lines if l.startswith("## ")]
    assert len(headings) >= 5, f"too few sections: {len(headings)}"

    worktree_ln = next((i for i, l in enumerate(lines, 1) if re.match(r"^## .*Stale Git Worktrees", l)), 0)
    assert worktree_ln, "worktree section missing"
    stash_ln = next((i for i, l in enumerate(lines, 1) if re.match(r"^## .*[Ss]tash", l)), 0)
    assert stash_ln, "stash section missing"
    assert stash_ln < worktree_ln


def test_t002709_documented_path_filtered_stash_inspection_yields_exactly_that_path(ctx):
    lines = ctx["ops"].read_text(encoding="utf-8").split("\n")
    diff_lines = [l for l in lines if "git diff" in l and "stash@{" in l]
    assert diff_lines, "no documented stash diff form"

    form = _sed_from(diff_lines[0], "git diff")
    form = form.replace("stash@{N}", "stash@{0}").replace("<pfad>", "alpha.txt")
    assert form

    wt = ctx["tmp"] / "inspect"
    _make_stash_repo(ctx["run"], wt)

    res = ctx["run"](["bash", "-c", f"cd '{wt}' && {form}"])
    assert res.returncode == 0, res.output
    assert "MARKER_ALPHA_T002709" in res.output

    res = ctx["run"](["bash", "-c", f"cd '{wt}' && {form} | grep -c 'MARKER_BETA_T002709'"])
    assert res.output.strip() == "0"


def test_t002709_stash_relevance_resolves_against_main_not_against_stash_diff(ctx):
    lines = ctx["ops"].read_text(encoding="utf-8").split("\n")
    grep_lines = [l for l in lines if "git grep" in l and "main" in l]
    assert grep_lines, "no documented git grep marker check"

    form = _sed_from(grep_lines[0], "git grep")
    form = form.replace("<marker>", "MARKER_ALPHA_T002709").replace("<pfad>", "alpha.txt")
    assert form

    wt = ctx["tmp"] / "relevance"
    _make_stash_repo(ctx["run"], wt)
    ctx["run"](["git", "-C", str(wt), "update-ref", "refs/remotes/origin/main", "main"]).check(0)

    # Before landing: the marker is not on main, the documented check says keep.
    res = ctx["run"](["bash", "-c", f"cd '{wt}' && {form}"])
    assert res.returncode != 0

    before = ctx["run"](["git", "-C", str(wt), "diff", "stash@{0}^", "stash@{0}"]).stdout
    assert before.strip() != ""

    with open(wt / "alpha.txt", "a", encoding="utf-8") as fh:
        fh.write("MARKER_ALPHA_T002709\n")
    ctx["run"](["git", "-C", str(wt), "add", "-A"]).check(0)
    ctx["run"](["git", "-C", str(wt), "commit", "-qm", "landet in main"]).check(0)
    ctx["run"](["git", "-C", str(wt), "update-ref", "refs/remotes/origin/main", "main"]).check(0)

    after = ctx["run"](["git", "-C", str(wt), "diff", "stash@{0}^", "stash@{0}"]).stdout
    assert before == after

    res = ctx["run"](["bash", "-c", f"cd '{wt}' && {form}"])
    assert res.returncode == 0, res.output
