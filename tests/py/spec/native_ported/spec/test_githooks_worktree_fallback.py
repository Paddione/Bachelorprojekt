"""Native migration of tests/spec/githooks-worktree-fallback.bats."""

# (T005567)

import re
from pathlib import Path

import pytest

GUARD_SCRIPT = """#!/usr/bin/env bash
msg="$(cat "$1" 2>/dev/null || echo "$1")"
echo "$msg" | grep -qE 'T[0-9]{4,}' || { echo "FIX-GUARD: no ticket id in message" >&2; exit 1; }
exit 0
"""

HOOK = """#!/usr/bin/env bash
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
guard="$repo_root/scripts/check-fix-ticket-guard.sh"
if [ ! -f "$guard" ]; then
  common_dir="$(git rev-parse --git-common-dir 2>/dev/null || true)"
  [ -n "$common_dir" ] && [ -d "$common_dir/.." ] && guard="$(cd "$common_dir/.." && pwd)/scripts/check-fix-ticket-guard.sh"
fi
if [ ! -f "$guard" ]; then
  echo "commit-msg: guard script not found (worktree nor main checkout)" >&2
  exit 1
fi
if ! bash "$guard" "$1"; then
  echo "commit-msg: fix-ticket guard rejected" >&2
  exit 1
fi
exit 0
"""


@pytest.fixture
def sandbox(run_cmd, tmp_path):
    """Main checkout with guard script and hook; worktree on its own branch without the guard."""
    main = tmp_path / "main"
    wt = tmp_path / "wt"
    (main / "scripts").mkdir(parents=True)
    (main / ".githooks").mkdir(parents=True)

    def git(*args, cwd=main):
        return run_cmd(["git", *args], cwd=cwd)

    git("init", "-q", "-b", "main")
    git("config", "user.email", "test@example.com")
    git("config", "user.name", "Bats Test")
    git("config", "core.hooksPath", ".githooks")

    guard = main / "scripts" / "check-fix-ticket-guard.sh"
    guard.write_text(GUARD_SCRIPT, encoding="utf-8")
    guard.chmod(0o755)
    hook = main / ".githooks" / "commit-msg"
    hook.write_text(HOOK, encoding="utf-8")
    hook.chmod(0o755)

    git("add", "-A")
    git("commit", "-q", "-m", "chore(test): scaffold main [T005567]").check(0)
    git("worktree", "add", "-q", "-b", "fix/feature-x", str(wt)).check(0)
    run_cmd(["git", "rm", "-q", "scripts/check-fix-ticket-guard.sh"], cwd=wt).check(0)
    run_cmd(
        ["git", "-c", "core.hooksPath=/dev/null", "commit", "-q", "-m",
         "chore(test): branch state without guard script [T005567]"],
        cwd=wt,
    ).check(0)
    return {"main": main, "wt": wt, "run": run_cmd}


def test_t005567_commit_in_worktree_without_guard_script_passes_via_main_checkout_fallback(sandbox):
    wt, run = sandbox["wt"], sandbox["run"]
    (wt / "feature.txt").write_text("feature work\n", encoding="utf-8")
    run(["git", "add", "feature.txt"], cwd=wt).check(0)
    res = run(["git", "commit", "-m", "fix(test): feature without guard script in worktree [T005567]"], cwd=wt)
    assert res.returncode == 0, f"Hook hat Commit blockiert: {res.output}"
    log = run(["git", "log", "--oneline", "-1"], cwd=wt)
    assert "feature without guard" in log.stdout


def test_t005567_real_commit_msg_hook_carries_main_checkout_fallback(repo_root: Path):
    hook = repo_root / ".githooks" / "commit-msg"
    assert hook.is_file(), f"Hook fehlt: {hook}"
    text = hook.read_text(encoding="utf-8")
    assert re.search(r"show-toplevel|repo_root", text), "keine repo_root-Aufloesung im Hook"
    assert re.search(r"git-common-dir|git_common|common_dir", text), (
        "Hook ohne Haupt-Checkout-Fallback (git-common-dir)"
    )
