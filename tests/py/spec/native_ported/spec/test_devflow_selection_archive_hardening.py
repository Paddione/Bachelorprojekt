"""Native migration of tests/spec/devflow-selection-archive-hardening.bats."""

# (T002255, T002256)

import os
import re
from pathlib import Path

import pytest


@pytest.fixture
def ctx(repo_root: Path, run_cmd):
    return {
        "root": repo_root,
        "filter": repo_root / "scripts" / "filter-generated.sh",
        "taskfile_test": repo_root / "taskfiles" / "Taskfile.test.yml",
        "taskfile_quality": repo_root / "taskfiles" / "Taskfile.quality.yml",
        "post_merge": repo_root / "scripts" / "devflow-post-merge-deploy.sh",
        "archive_ref": repo_root / ".claude" / "skills" / "references" / "plan-archive-steps.md",
        "mcp_guide": repo_root / ".claude" / "skills" / "references" / "mcp-tool-guide.md",
        "deploy_routing": repo_root / ".claude" / "skills" / "references" / "deploy-routing.md",
        "run": run_cmd,
    }


def _filter(c, stdin_printf: str):
    return c["run"](["bash", "-c", f"cd '{c['root']}' && printf '{stdin_printf}' | bash '{c['filter']}'"])


def _text(path: Path) -> str:
    assert path.is_file(), f"missing file: {path}"
    return path.read_text(encoding="utf-8")


# A1 — scripts/filter-generated.sh

def test_t002255_a1_filter_generated_sh_exists_and_is_executable(ctx):
    assert ctx["filter"].is_file()
    assert os.access(ctx["filter"], os.X_OK)


def test_t002255_a1_filter_removes_generated_paths_keeps_source(ctx):
    res = _filter(ctx, "components/website/src/data/test-inventory.json\\nscripts/foo.sh\\n"
                       "components/website/src/pages/index.astro\\n")
    assert res.returncode == 0, res.output
    assert "test-inventory.json" not in res.output
    assert "scripts/foo.sh" in res.output
    assert "components/website/src/pages/index.astro" in res.output


def test_t002255_a1_filter_prints_paths_unchanged_without_check_attr_suffix(ctx):
    res = _filter(ctx, "scripts/foo.sh\\n")
    assert res.returncode == 0, res.output
    assert res.output == "scripts/foo.sh"


def test_t002255_a1_filter_tolerates_empty_input_exit_0_no_output(ctx):
    res = _filter(ctx, "")
    assert res.returncode == 0, res.output
    assert res.output == ""


def test_t002255_a1_filter_exit_0_when_all_input_paths_are_generated(ctx):
    # Critical edge: a diff with ONLY generated files (freshness-regen bot commits).
    res = _filter(ctx, "components/website/src/data/test-inventory.json\\n"
                       "components/website/src/data/route-manifest.json\\n")
    assert res.returncode == 0, res.output
    assert res.output == ""


# A2 — Verdrahtung in den beiden Konsumenten

def test_t002255_a2_test_changed_pipes_changed_through_filter_generated_sh(ctx):
    assert "filter-generated.sh" in _text(ctx["taskfile_test"])


def test_t002255_a2_freshness_check_stays_unfiltered(ctx):
    # The artifact list in freshness:check must NOT be filtered, or the gate filters itself away.
    lines = _text(ctx["taskfile_quality"]).split("\n")
    start = next((i for i, l in enumerate(lines) if l.startswith("  freshness:check:")), None)
    assert start is not None, "freshness:check block not found"
    block = []
    for line in lines[start:]:
        if block and re.match(r"^  [a-z]", line):
            block.append(line)
            break
        block.append(line)
    count = sum(1 for line in block if "filter-generated.sh" in line)
    assert count == 0


def test_t002255_a2_devflow_post_merge_deploy_pipes_changed_through_filter_generated_sh(ctx):
    assert "filter-generated.sh" in _text(ctx["post_merge"])


def test_t002255_a2_post_merge_deploy_no_longer_builds_container_images(ctx):
    assert not re.search(r"^\s*task (feature:website|feature:brett|docs:deploy)",
                         _text(ctx["post_merge"]), re.MULTILINE)


def test_t002255_a2_post_merge_deploy_names_the_responsible_ci_workflow_instead(ctx):
    assert re.search(r"build-website\.yml|build-brett\.yml", _text(ctx["post_merge"]))


def test_t002255_a2_post_merge_deploy_keeps_feature_deploy_as_break_glass(ctx):
    assert re.search(r"task feature:deploy", _text(ctx["post_merge"]))


def test_t002255_a2_fail_closed_message_from_t002242_m3_is_preserved(ctx):
    assert re.search(r"FAILED_TASKS|deploy blocked", _text(ctx["post_merge"]))


def test_t002255_a2_deploy_routing_md_documents_generated_paths_as_non_trigger(ctx):
    assert re.search(r"linguist-generated|generierte? (Pfade|Artefakte)",
                     _text(ctx["deploy_routing"]), re.IGNORECASE)


# B — plan-archive-steps.md

def test_t002256_b2_no_checkout_b_from_fix_branch_anymore(ctx):
    assert not re.search(r'git checkout -b "\$ARCHIVE_BRANCH"\s*$', _text(ctx["archive_ref"]), re.MULTILINE)


def test_t002256_b3_mcp_tool_guide_documents_worktree_restriction(ctx):
    assert re.search(r"worktree", _text(ctx["mcp_guide"]), re.IGNORECASE)


def test_t002256_b3_worktree_note_names_both_tools_stage_plan_and_archive_plan(ctx):
    lines = _text(ctx["mcp_guide"]).split("\n")
    hits = [i for i, l in enumerate(lines) if re.search("worktree", l, re.IGNORECASE)]
    selected = set()
    for i in hits:
        selected.update(range(max(0, i - 4), min(len(lines), i + 5)))
    block = "\n".join(lines[i] for i in sorted(selected))
    assert "stage_plan" in block
    assert "archive_plan" in block


def test_t002256_b3_plan_archive_steps_no_longer_recommends_archive_plan_as_mcp_first(ctx):
    assert not re.search(r"^[^>]*MCP-first", _text(ctx["archive_ref"]), re.MULTILINE)


def test_t002256_b3_plan_archive_steps_names_ticket_sh_archive_plan_as_primary_path(ctx):
    lines = _text(ctx["archive_ref"]).split("\n")
    script_line = next((i for i, l in enumerate(lines, 1) if "ticket.sh archive-plan" in l), 0)
    mcp_line = next((i for i, l in enumerate(lines, 1) if "mcp__ticket-mcp__archive_plan" in l), 0)
    assert script_line, "ticket.sh archive-plan not referenced"
    assert mcp_line == 0 or script_line < mcp_line
