"""Native migration of tests/unit/check-commit-vs-diff.bats."""
import os
import subprocess
from pathlib import Path

import pytest


@pytest.fixture
def ctx(tmp_path, repo_root, run_cmd):
    """Port of setup(): REPO_ROOT, SCRIPT, HOOK and an isolated TMP dir."""

    def new_repo():
        repo = tmp_path / "repo"
        repo.mkdir()
        for cmd in (
            ["git", "init", "-q"],
            ["git", "config", "user.email", "t@t"],
            ["git", "config", "user.name", "t"],
        ):
            run_cmd(cmd, cwd=repo).check(0)
        return repo

    def stage(repo, files, adds):
        for rel, content in files.items():
            path = repo / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
        run_cmd(["git", "add", "--", *adds], cwd=repo).check(0)

    def subject(text):
        msg = tmp_path / "msg-subject"
        msg.write_text(text, encoding="utf-8")
        return str(msg)

    return {
        "tmp": tmp_path,
        "script": str(repo_root / "scripts" / "check-commit-vs-diff.sh"),
        "hook": str(repo_root / ".githooks" / "commit-msg"),
        "new_repo": new_repo,
        "stage": stage,
        "subject": subject,
    }


def _run_script(run_cmd, ctx, repo, text, env=None):
    return run_cmd(["bash", ctx["script"], ctx["subject"](text)], cwd=repo, env=env)


# 1. Script exists and is executable

def test_check_commit_vs_diff_sh_exists(ctx):
    assert Path(ctx["script"]).is_file()


def test_check_commit_vs_diff_sh_is_executable(ctx):
    assert os.access(ctx["script"], os.X_OK)


# 2. Subject-line classification (allow cases)

def test_allows_fix_real_code_production_code_change(ctx, run_cmd):
    repo = ctx["new_repo"]()
    text = "src/middleware.ts"
    ctx["stage"](repo, {"src/middleware.ts": "real code"}, ["src/middleware.ts"])
    r = _run_script(run_cmd, ctx, repo, text)
    assert r.returncode == 0, r.output


def test_allows_fix_real_code_test_production_and_test_in_same_commit(ctx, run_cmd):
    repo = ctx["new_repo"]()
    ctx["stage"](
        repo,
        {"src/middleware.ts": "real", "src/middleware.test.ts": "test"},
        ["src/"],
    )
    r = _run_script(run_cmd, ctx, repo, "fix(infra): chain middleware sequence\n")
    assert r.returncode == 0, r.output


def test_allows_test_red_only_red_test_commit_uses_test_prefix(ctx, run_cmd):
    repo = ctx["new_repo"]()
    ctx["stage"](repo, {"src/middleware.test.ts": "test"}, ["src/"])
    r = _run_script(run_cmd, ctx, repo, "test(red): verify locals.requestLogger is set\n")
    assert r.returncode == 0, r.output


def test_allows_chore_plan_only_plan_only_commit_uses_chore_plans(ctx, run_cmd):
    repo = ctx["new_repo"]()
    ctx["stage"](repo, {".agents/plans/t001434/tasks.md": "plan"}, [".agents/plans/"])
    r = _run_script(run_cmd, ctx, repo, "chore(plans): stage t001434 for execution [T001434]\n")
    assert r.returncode == 0, r.output


def test_allows_docs_readme_update_is_not_an_implementation_claim(ctx, run_cmd):
    repo = ctx["new_repo"]()
    ctx["stage"](repo, {"README.md": "hello"}, ["README.md"])
    r = _run_script(run_cmd, ctx, repo, "docs: update README\n")
    assert r.returncode == 0, r.output


def test_allows_ci_workflow_bump_is_not_an_implementation_claim(ctx, run_cmd):
    repo = ctx["new_repo"]()
    ctx["stage"](repo, {".github/workflows/ci.yml": "on: push"}, [".github/"])
    r = _run_script(run_cmd, ctx, repo, "ci: bump action versions\n")
    assert r.returncode == 0, r.output


def test_allows_fix_kustomize_yaml_manifest_counts_as_production_code(ctx, run_cmd):
    repo = ctx["new_repo"]()
    ctx["stage"](repo, {"k3d/configmap-domains.yaml": "data:"}, ["k3d/"])
    r = _run_script(run_cmd, ctx, repo, "fix(infra): tweak configmap\n")
    assert r.returncode == 0, r.output


def test_allows_fix_scope_less_no_scope_implementation_title_is_fine_if_real_code_staged(ctx, run_cmd):
    repo = ctx["new_repo"]()
    ctx["stage"](repo, {"src/typo.ts": "export const E = 1;"}, ["src/"])
    r = _run_script(run_cmd, ctx, repo, "fix: typo in error message\n")
    assert r.returncode == 0, r.output


def test_allows_feat_breaking_change_marker_still_allowed(ctx, run_cmd):
    repo = ctx["new_repo"]()
    ctx["stage"](repo, {"src/api/v2.ts": "export {}"}, ["src/"])
    r = _run_script(run_cmd, ctx, repo, "feat(api)!: drop legacy /v1 endpoints\n")
    assert r.returncode == 0, r.output


# 3. Block cases, the T001434 pattern

def test_blocks_fix_red_only_test_the_t001434_pattern(ctx, run_cmd):
    repo = ctx["new_repo"]()
    ctx["stage"](repo, {"src/middleware.test.ts": "test"}, ["src/"])
    text = "fix(infra): chain loggingMiddleware in middleware.ts via sequence() [T001434]\n"
    r = _run_script(run_cmd, ctx, repo, text)
    assert r.returncode != 0
    assert "T001434 mishap pattern" in r.output
    assert "test(red):" in r.output
    assert "chore(plan):" in r.output


def test_blocks_fix_plan_only(ctx, run_cmd):
    repo = ctx["new_repo"]()
    ctx["stage"](repo, {".agents/plans/x/tasks.md": "plan"}, [".agents/plans/"])
    r = _run_script(run_cmd, ctx, repo, "fix(infra): chain middleware\n")
    assert r.returncode != 0


def test_blocks_fix_plan_and_test_combined(ctx, run_cmd):
    repo = ctx["new_repo"]()
    ctx["stage"](
        repo,
        {"src/middleware.test.ts": "test", ".agents/plans/x/tasks.md": "plan"},
        ["src/", ".agents/plans/"],
    )
    r = _run_script(run_cmd, ctx, repo, "fix(infra): chain middleware\n")
    assert r.returncode != 0


def test_blocks_fix_spec_only_plan_specs(ctx, run_cmd):
    repo = ctx["new_repo"]()
    ctx["stage"](repo, {"docs/superpowers/specs/centralized-logging.md": "spec"}, ["docs/superpowers/specs/"])
    r = _run_script(run_cmd, ctx, repo, "fix(infra): chain middleware\n")
    assert r.returncode != 0


def test_blocks_feat_plan_only(ctx, run_cmd):
    repo = ctx["new_repo"]()
    ctx["stage"](
        repo,
        {".agents/plans/x/tasks.md": "p", ".agents/plans/x/proposal.md": "p"},
        [".agents/plans/x/"],
    )
    r = _run_script(run_cmd, ctx, repo, "feat(infra): add logging chain\n")
    assert r.returncode != 0


def test_blocks_refactor_plan_only(ctx, run_cmd):
    repo = ctx["new_repo"]()
    ctx["stage"](repo, {".agents/plans/cleanup/tasks.md": "p"}, [".agents/plans/cleanup/"])
    r = _run_script(run_cmd, ctx, repo, "refactor(scripts): consolidate guards\n")
    assert r.returncode != 0


def test_blocks_perf_plan_only(ctx, run_cmd):
    repo = ctx["new_repo"]()
    ctx["stage"](repo, {".agents/plans/perf/tasks.md": "p"}, [".agents/plans/perf/"])
    r = _run_script(run_cmd, ctx, repo, "perf(db): index tickets table\n")
    assert r.returncode != 0


def test_blocks_doc_only_files_superpowers_specs_with_implementation_title(ctx, run_cmd):
    repo = ctx["new_repo"]()
    ctx["stage"](repo, {"docs/superpowers/specs/2026-07-02-design.md": "spec"}, ["docs/superpowers/specs/"])
    r = _run_script(run_cmd, ctx, repo, "fix(infra): chain middleware\n")
    assert r.returncode != 0


# 4. Bypass semantics

def test_skip_commit_vs_diff_1_bypasses_the_check_commit_msg_hook(ctx, run_cmd):
    repo = ctx["new_repo"]()
    ctx["stage"](repo, {"src/middleware.test.ts": "test"}, ["src/"])
    r = run_cmd(
        ["bash", ctx["hook"], ctx["subject"]("fix(infra): should be allowed with SKIP_COMMIT_VS_DIFF=1\n")],
        cwd=repo,
        env={"SKIP_COMMIT_VS_DIFF": "1"},
    )
    assert r.returncode == 0, r.output


# 5. Self-test

def test_self_test_passes_15_cases(ctx, run_cmd):
    r = run_cmd(["bash", ctx["script"], "--self-test"], timeout=300)
    assert r.returncode == 0, r.output
    assert "self-test passed" in r.output
