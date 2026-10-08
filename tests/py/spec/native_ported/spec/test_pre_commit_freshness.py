"""Native migration of tests/spec/pre-commit-freshness.bats."""

import re
from pathlib import Path

import pytest


def _hook(repo_root: Path) -> Path:
    return repo_root / ".githooks" / "pre-commit"


def _text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _pre_commit_files(hook: Path):
    """awk-Block _FRESHNESS_FILES=( ... ) -> Eintraege, getrimmt, ohne Leerzeilen."""
    out, capture = [], False
    for line in _text(hook).splitlines():
        if re.search(r"_FRESHNESS_FILES=\(", line):
            capture = True
            continue
        if capture and re.match(r"^\)", line):
            capture = False
            continue
        if capture and re.match(r"^[ \t]+[a-zA-Z0-9_./-]+$", line):
            out.append(line.strip())
    return [x for x in out if x != ""]


def _freshness_check_files(taskfile: Path):
    """awk-Block FILES=\"...\" in freshness:check -> Eintraege, getrimmt, ohne Leerzeilen."""
    out, capture = [], False
    for line in _text(taskfile).splitlines():
        if re.match(r'^[ \t]*FILES="', line):
            capture = True
            continue
        if capture and re.search(r'"$', line):
            capture = False
            continue
        if capture:
            out.append(line)
    return [x.strip() for x in out if x.strip() != ""]


def _awk_post_context(text: str, pattern: str, window: int = 15):
    """awk '/pat/{found=1; ctx=NR; next} found && NR<=ctx+15 {print NR": "$0}'."""
    found, ctx, out = False, 0, []
    for nr, line in enumerate(text.splitlines(), 1):
        if re.search(pattern, line):
            found, ctx = True, nr
            continue
        if found and nr <= ctx + window:
            out.append(f"{nr}: {line}")
    return "\n".join(out)


# ── (1) RED-Sanity ─────────────────────────────────────────────────────

def test_t001388_pre_commit_freshness_files_includes_test_inventory_json_red_against_main(repo_root):
    hook = _hook(repo_root)
    assert hook.is_file(), f"MISSING hook: {hook}"
    assert "components/website/src/data/test-inventory.json" in _pre_commit_files(hook), \
        "MISSING components/website/src/data/test-inventory.json from pre-commit _FRESHNESS_FILES"


# ── (2) Drift-Guard ────────────────────────────────────────────────────

def test_t001388_pre_commit_auto_stage_list_is_a_superset_of_freshness_check_files(repo_root):
    hook = _hook(repo_root)
    taskfile = repo_root / "taskfiles" / "Taskfile.quality.yml"
    assert hook.is_file(), f"MISSING hook: {hook}"
    assert taskfile.is_file(), f"MISSING taskfile: {taskfile}"
    hook_list = set(_pre_commit_files(hook))
    check_list = sorted(set(_freshness_check_files(taskfile)))
    missing = [p for p in check_list if p and p not in hook_list]
    assert not missing, (
        "DRIFT: these paths are in 'task freshness:check FILES' but NOT in '.githooks/pre-commit _FRESHNESS_FILES':\n"
        + "\n".join(missing)
        + "\nFix: add the missing entries to .githooks/pre-commit's _FRESHNESS_FILES array."
    )


# ── (3) Auto-Stage-Smoke ───────────────────────────────────────────────

def test_t001388_pre_commit_hook_iterates_freshness_files_and_runs_git_add_on_each_entry(repo_root):
    hook = _hook(repo_root)
    assert hook.is_file(), f"MISSING hook: {hook}"
    text = _text(hook)
    assert re.search(r"for _f in .*_FRESHNESS_FILES", text), "MISSING 'for _f in ${_FRESHNESS_FILES[@]}' loop"
    assert re.search(r'git[ \t]+.*add[ \t]+.*"\$_f"', text), "MISSING 'git add -- \"$_f\"' inside the loop"


# ── T001973: rebase/merge guards ───────────────────────────────────────

def test_t001973_post_merge_hook_contains_a_guard_that_exits_0_when_rebase_merge_dir_exists(repo_root):
    post_merge = repo_root / ".githooks" / "post-merge"
    assert post_merge.is_file(), f"MISSING hook: {post_merge}"
    text = _text(post_merge)
    assert re.search(r"rebase-merge", text), "MISSING 'rebase-merge' check"
    assert re.search(r"rebase-apply", text), "MISSING 'rebase-apply' check"
    assert re.search(r"MERGE_HEAD", text), "MISSING 'MERGE_HEAD' check"


def test_t001973_post_merge_hook_supports_freshness_hook_disabled_1_env_opt_out(repo_root):
    post_merge = repo_root / ".githooks" / "post-merge"
    assert post_merge.is_file(), f"MISSING hook: {post_merge}"
    assert re.search(r"FRESHNESS_HOOK_DISABLED", _text(post_merge)), "MISSING 'FRESHNESS_HOOK_DISABLED' env opt-out"


def test_t001973_pre_commit_hook_contains_a_guard_around_the_freshness_auto_stage_block(repo_root):
    pre_commit = _hook(repo_root)
    assert pre_commit.is_file(), f"MISSING hook: {pre_commit}"
    text = _text(pre_commit)
    assert re.search(r"rebase-merge", text), "MISSING 'rebase-merge' check"
    assert re.search(r"FRESHNESS_HOOK_DISABLED", text), "MISSING 'FRESHNESS_HOOK_DISABLED' env opt-out"
    context = _awk_post_context(text, r"rebase-merge|FRESHNESS_HOOK_DISABLED")
    assert re.search(r"freshness:_FRESHNESS_FILES|freshness:regenerate", context), \
        f"guard does not appear to wrap the freshness block in {pre_commit}"


def test_t001973_post_merge_guard_exits_0_cleanly_t000581_sfreshness_regenerate_skip_safe(repo_root):
    post_merge = repo_root / ".githooks" / "post-merge"
    assert post_merge.is_file(), f"MISSING hook: {post_merge}"
    text = _text(post_merge)
    ok = re.search(r"rebase-merge.*exit 0|exit 0.*rebase-merge", text) or \
        re.search(r"^[ \t]*exit 0[ \t]*#.*\[T001973\]", text, re.MULTILINE)
    assert ok, "guard does not appear to exit 0 cleanly in post-merge"


# ── T002239-M1 ─────────────────────────────────────────────────────────

def test_t002239_m1_post_merge_hook_restores_docs_mermaid_snapshots_after_regen(repo_root):
    post_merge = repo_root / ".githooks" / "post-merge"
    assert post_merge.is_file(), f"MISSING hook: {post_merge}"
    assert re.search(r"checkout.*mermaid-snapshots", _text(post_merge)), \
        "MISSING 'checkout -- docs/mermaid-snapshots/' in post-merge"


def test_t002239_m1_post_merge_hook_still_calls_freshness_regenerate_control_test(repo_root):
    post_merge = repo_root / ".githooks" / "post-merge"
    assert post_merge.is_file(), f"MISSING hook: {post_merge}"
    assert re.search(r"freshness:regenerate", _text(post_merge)), \
        "MISSING 'task freshness:regenerate' in post-merge — guard over-suppressed!"


# ── [T002284] ──────────────────────────────────────────────────────────

def test_t002284_pre_commit_warns_when_regeneration_neutralizes_an_already_staged_freshness_file(repo_root):
    hook = _hook(repo_root)
    assert hook.is_file(), f"MISSING hook: {hook}"
    text = _text(hook)
    assert re.search(r"_pre_staged_freshness", text), "MISSING '_pre_staged_freshness' pre-state snapshot"
    assert re.search(r"neutralized by regeneration", text), "MISSING neutralized-staged-diff warning"


def test_t001973_pre_commit_hook_still_calls_task_freshness_regenerate_control_test(repo_root):
    pre_commit = _hook(repo_root)
    assert pre_commit.is_file(), f"MISSING hook: {pre_commit}"
    assert re.search(r"task[ \t]+.*freshness:regenerate", _text(pre_commit)), \
        "MISSING 'task ... freshness:regenerate' in pre-commit — guard over-suppressed!"


# ── T003075 ────────────────────────────────────────────────────────────

def test_t003075_pre_commit_blocks_the_commit_exit_1_when_task_freshness_regenerate_fails(repo_root):
    pre_commit = _hook(repo_root)
    assert pre_commit.is_file(), f"MISSING hook: {pre_commit}"
    block_lines, capture = [], False
    for line in _text(pre_commit).splitlines():
        if re.search(r"task freshness:regenerate", line):
            capture = True
        if capture:
            block_lines.append(line)
            if re.search(r"^# --- branch-naming", line):
                break
    block = "\n".join(block_lines)
    assert block.strip() != "", f"could not isolate freshness block in {pre_commit}"
    assert re.search(r"exit 1", block), \
        "freshness block has no 'exit 1' in its failure branch — regen failures are still only warned about"


def test_t003075_pre_commit_supports_skip_freshness_regen_1_as_an_emergency_bypass(repo_root):
    pre_commit = _hook(repo_root)
    assert pre_commit.is_file(), f"MISSING hook: {pre_commit}"
    assert re.search(r"SKIP_FRESHNESS_REGEN", _text(pre_commit)), "MISSING 'SKIP_FRESHNESS_REGEN' bypass env var"


def test_t003075_pre_commit_still_skips_the_whole_freshness_block_when_task_is_not_in_path_control(repo_root):
    pre_commit = _hook(repo_root)
    assert pre_commit.is_file(), f"MISSING hook: {pre_commit}"
    assert "command -v task >/dev/null" in _text(pre_commit), \
        "MISSING outer 'command -v task' guard — tool-missing exemption may have been removed"
