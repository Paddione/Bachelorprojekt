"""Native migration of tests/spec/repo-hygiene/worktree-remove-generat-allowlist.bats."""
# (T003121)
# Block 2 executes the status filter form extracted from the runbook (the SSOT

# command itself), via bash -c, against a throwaway repository.

import re
from pathlib import Path

import pytest


@pytest.fixture
def ctx(repo_root: Path, run_cmd, tmp_path):
    return {"ops": repo_root / ".claude" / "skills" / "references" / "repo-hygiene-ops.md",
            "run": run_cmd, "tmp": tmp_path}


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


def _extract_form(text: str) -> str:
    """Mirror of the awk block: from the status-filter line to the first line without trailing backslash."""
    rx = re.compile(r"^git -C <path> status --porcelain.*cut -c4-")
    inside = False
    out = []
    for line in text.split("\n"):
        if rx.search(line):
            inside = True
        if inside:
            out.append(line)
            if not line.endswith("\\"):
                break
    return "\n".join(out)


def _make_dirty_worktree(run, wt: Path) -> None:
    (wt / "components" / "website" / "src" / "data").mkdir(parents=True)
    (wt / "scripts").mkdir(parents=True, exist_ok=True)
    def git(*args):
        return run(["git", "-C", str(wt), *args])
    git("init", "-q").check(0)
    git("symbolic-ref", "HEAD", "refs/heads/main").check(0)
    git("config", "user.email", "t003121@example.invalid").check(0)
    git("config", "user.name", "T003121 Guard").check(0)
    (wt / "components" / "website" / "src" / "data" / "test-inventory.json").write_text("{}\n", encoding="utf-8")
    (wt / "scripts" / "beispiel.sh").write_text("echo base\n", encoding="utf-8")
    git("add", "-A").check(0)
    git("commit", "-qm", "base").check(0)
    (wt / "components" / "website" / "src" / "data" / "test-inventory.json").write_text(
        '{"regeneriert": true}\n', encoding="utf-8")
    with open(wt / "scripts" / "beispiel.sh", "a", encoding="utf-8") as fh:
        fh.write("echo ungesicherte Arbeit\n")


def test_t003121_s1_discards_git_log_main_branch_as_merge_proof(ctx):
    assert ctx["ops"].is_file()
    sec = _section(ctx["ops"].read_text(encoding="utf-8"), r"^## 1[.]")
    assert sec, "section 1 empty"
    assert "git worktree remove" in sec
    assert "squash-and-merge" in sec
    assert re.search(r"blob-vergleich", sec, re.IGNORECASE)


def test_t003121_documented_allowlist_form_passes_generate_and_reports_real_work(ctx):
    text = ctx["ops"].read_text(encoding="utf-8")
    sec = _section(text, r"^## 1[.]")
    assert sec and "status --porcelain" in sec

    form = _extract_form(text)
    assert form, "allowlist form not found in runbook"
    assert ".agents/plans/" in form

    wt = ctx["tmp"] / "dirty"
    _make_dirty_worktree(ctx["run"], wt)
    form = form.replace("<path>", str(wt))

    res = ctx["run"](["bash", "-c", form])
    assert "scripts/beispiel.sh" in res.output

    res = ctx["run"](["bash", "-c", f"{form} | grep -cF 'components/website/src/data/test-inventory.json'"])
    assert res.output.strip() == "0"


def test_t003121_worktree_with_only_generate_deviations_counts_as_clean(ctx):
    text = ctx["ops"].read_text(encoding="utf-8")
    form = _extract_form(text)
    assert form, "allowlist form not found in runbook"

    wt = ctx["tmp"] / "nur-generat"
    _make_dirty_worktree(ctx["run"], wt)
    ctx["run"](["git", "-C", str(wt), "checkout", "--", "scripts/beispiel.sh"]).check(0)

    # Positiv-Anker: der Worktree ist fuer git weiterhin dirty.
    res = ctx["run"](["bash", "-c", f"git -C '{wt}' status --porcelain"])
    assert res.output.strip() != ""

    form = form.replace("<path>", str(wt))
    res = ctx["run"](["bash", "-c", form])
    assert res.output.strip() == ""
