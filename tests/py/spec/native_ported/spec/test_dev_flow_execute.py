"""Native migration of tests/spec/dev-flow-execute.bats."""
import re
from pathlib import Path



def _read_lines(path: Path):
    return path.read_text(encoding="utf-8").splitlines()


def _count_matching_lines(lines, pattern: str, flags: int = 0) -> int:
    regex = re.compile(pattern, flags)
    return sum(1 for line in lines if regex.search(line))


def _grep_lines(lines, pattern: str, flags: int = 0):
    regex = re.compile(pattern, flags)
    return [(number, line) for number, line in enumerate(lines, start=1) if regex.search(line)]


def _implementer_step_2(skill_lines):
    """Lines of the '## Schritt 2:' section, up to the next '## ' heading (awk equivalent)."""
    collected = []
    flag = False
    for line in skill_lines:
        if re.match(r"^## Schritt 2:", line):
            flag = True
            continue
        if line.startswith("## "):
            flag = False
        if flag:
            collected.append(line)
    return collected


def _freshness_for_loop(taskfile_lines):
    """Lines from 'for f in $FILES; do' through 'if [ $ERRORS -gt 0 ]; then' (awk equivalent)."""
    collected = []
    flag = False
    for line in taskfile_lines:
        if line == "        for f in $FILES; do":
            flag = True
        if flag:
            collected.append(line)
        if flag and line == "        if [ $ERRORS -gt 0 ]; then":
            flag = False
    return collected


# ── Mishap 1: Worktree cleanup owned by orchestrator, not implementer ─────


def test_t002352_m1_implementer_facing_step_2_does_not_mention_git_worktree_remove(repo_root):
    skill = repo_root / ".agents" / "skills" / "dev-flow-execute" / "SKILL.md"
    assert _grep_lines(_read_lines(skill), re.escape("git worktree remove")) == []


def test_t002352_m1_cd_x_and_cmd_or_fallback_pattern_absent_from_dev_flow_execute_phases(repo_root):
    phases = repo_root / ".claude" / "skills" / "references" / "dev-flow-execute-phases.md"
    assert _grep_lines(_read_lines(phases), r"cd [^&]+ && .+ \|\|") == []


def test_t002352_m1_implementer_step_2_does_not_mention_worktree_cleanup_or_deletion(repo_root):
    skill = repo_root / ".agents" / "skills" / "dev-flow-execute" / "SKILL.md"
    section = _implementer_step_2(_read_lines(skill))
    hits = _grep_lines(
        section,
        r"(worktree.*(remov|clean|delet|lösch)|\.worktrees.*rm|branch -D)",
        re.IGNORECASE,
    )
    assert hits == [], "implementer section mentions worktree cleanup"


# ── Mishap 2: SSOT negative-assertion tests must filter Scenario blocks ────


def test_t002352_m2_all_spec_bats_tests_using_negative_grep_over_ssot_documents_have_scenario_filters(
    repo_root,
):
    spec_dir = repo_root / "tests" / "spec"
    for batsfile in sorted(spec_dir.glob("*.bats")):
        lines = _read_lines(batsfile)
        if not _grep_lines(lines, r"grep.*plan/specs"):
            continue
        has_negative = _count_matching_lines(lines, r"\$status -ne 0|fail.*grep.*found|not grep")
        if has_negative > 0:
            has_filter = _count_matching_lines(lines, r"Scenario:|in_s[ \t]*=|!in_s")
            assert has_filter >= 1, (
                f"ERROR: {batsfile.name} has negative grep over plan/specs without Scenario filter"
            )


# T002352-M2 retired (T900852): the scenario filter tested spec-content
# filtering in mcp-gateway.bats; A1b removed the feature with its spec,
# so the negation-probe meta-assertion has no subject left.

# ── Mishap 3: freshness:check must distinguish "not staged" from "stale" ───


def test_t002352_m3_freshness_check_diff_check_loop_uses_regenerated_but_not_staged_not_is_stale(
    repo_root,
):
    taskfile = repo_root / "taskfiles" / "Taskfile.quality.yml"
    for_loop = _freshness_for_loop(_read_lines(taskfile))
    assert _count_matching_lines(for_loop, "is stale") == 0


def test_t002352_m3_freshness_check_has_regenerated_but_not_staged_message(repo_root):
    taskfile = _read_lines(repo_root / "taskfiles" / "Taskfile.quality.yml")
    assert _count_matching_lines(taskfile, "regenerated but not staged") >= 1


def test_t002352_m3_freshness_check_has_staged_but_not_committed_message(repo_root):
    taskfile = _read_lines(repo_root / "taskfiles" / "Taskfile.quality.yml")
    assert _count_matching_lines(taskfile, "staged but not committed") >= 1


def test_t002352_m3_freshness_check_message_says_to_add_commit_not_re_regenerate(repo_root):
    taskfile = _read_lines(repo_root / "taskfiles" / "Taskfile.quality.yml")
    assert _count_matching_lines(taskfile, "run 'git add") >= 1
