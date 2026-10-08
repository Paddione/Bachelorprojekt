"""Tests migrating ci-cd specs to pytest."""

import subprocess
from pathlib import Path
import pytest


def _run_bats(repo_root: Path, bats_file: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["bats", bats_file],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )

def test_actionlint_workflow_gate_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/actionlint-workflow-gate.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/actionlint-workflow-gate.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/actionlint-workflow-gate.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_arbitration_scoped_kubeconfig_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/arbitration-scoped-kubeconfig.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/arbitration-scoped-kubeconfig.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/arbitration-scoped-kubeconfig.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_automerge_run_scope_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/automerge-run-scope.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/automerge-run-scope.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/automerge-run-scope.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_awk_interval_portability_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/awk-interval-portability.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/awk-interval-portability.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/awk-interval-portability.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_baseline_guard_read_pr_body_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/baseline-guard-read-pr-body.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/baseline-guard-read-pr-body.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/baseline-guard-read-pr-body.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_bats_no_live_branch_assertion_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/bats-no-live-branch-assertion.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/bats-no-live-branch-assertion.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/bats-no-live-branch-assertion.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_brainstorm_firewall_namespace_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/brainstorm-firewall-namespace.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/brainstorm-firewall-namespace.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/brainstorm-firewall-namespace.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_branch_allowlist_ssot_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/branch-allowlist-ssot.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/branch-allowlist-ssot.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/branch-allowlist-ssot.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_branch_reaper_empty_answer_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/branch-reaper-empty-answer.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/branch-reaper-empty-answer.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/branch-reaper-empty-answer.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_branch_reaper_freshness_regen_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/branch-reaper-freshness-regen.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/branch-reaper-freshness-regen.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/branch-reaper-freshness-regen.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_branch_reaper_local_ref_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/branch-reaper-local-ref.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/branch-reaper-local-ref.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/branch-reaper-local-ref.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_branch_reaper_merged_pr_signal_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/branch-reaper-merged-pr-signal.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/branch-reaper-merged-pr-signal.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/branch-reaper-merged-pr-signal.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_branch_reaper_sweep_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/branch-reaper-sweep.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/branch-reaper-sweep.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/branch-reaper-sweep.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_branch_reaper_undecided_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/branch-reaper-undecided.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/branch-reaper-undecided.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/branch-reaper-undecided.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_branch_reaper_unknown_ticket_merged_pr_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/branch-reaper-unknown-ticket-merged-pr.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/branch-reaper-unknown-ticket-merged-pr.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/branch-reaper-unknown-ticket-merged-pr.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_branch_reaper_unmerged_keep_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/branch-reaper-unmerged-keep.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/branch-reaper-unmerged-keep.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/branch-reaper-unmerged-keep.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_branch_reaper_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/branch-reaper.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/branch-reaper.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/branch-reaper.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_cfr_trend_window_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/cfr-trend-window.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/cfr-trend-window.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/cfr-trend-window.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_changed_tests_collection_parity_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/changed-tests-collection-parity.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/changed-tests-collection-parity.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/changed-tests-collection-parity.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_changed_tests_env_hermetic_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/changed-tests-env-hermetic.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/changed-tests-env-hermetic.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/changed-tests-env-hermetic.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_changed_tests_uncommitted_diff_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/changed-tests-uncommitted-diff.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/changed-tests-uncommitted-diff.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/changed-tests-uncommitted-diff.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_ci_wait_loop_nonempty_guard_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/ci-wait-loop-nonempty-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/ci-wait-loop-nonempty-guard.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/ci-wait-loop-nonempty-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_devflow_ci_watch_merged_exit_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/devflow-ci-watch-merged-exit.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/devflow-ci-watch-merged-exit.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/devflow-ci-watch-merged-exit.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_devflow_ci_watch_rollup_headsha_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/devflow-ci-watch-rollup-headsha.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/devflow-ci-watch-rollup-headsha.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/devflow-ci-watch-rollup-headsha.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_devflow_ci_watch_run_lookup_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/devflow-ci-watch-run-lookup.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/devflow-ci-watch-run-lookup.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/devflow-ci-watch-run-lookup.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_devflow_ciwatch_ticket_path_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/devflow-ciwatch-ticket-path.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/devflow-ciwatch-ticket-path.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/devflow-ciwatch-ticket-path.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_devflow_execute_hardening_t002365_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/devflow-execute-hardening-t002365.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/devflow-execute-hardening-t002365.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/devflow-execute-hardening-t002365.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_e2e_project_selection_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/e2e-project-selection.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/e2e-project-selection.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/e2e-project-selection.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_fetch_refspec_forced_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/fetch-refspec-forced.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/fetch-refspec-forced.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/fetch-refspec-forced.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_fix_ticket_commit_guard_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/fix-ticket-commit-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/fix-ticket-commit-guard.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/fix-ticket-commit-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_freshness_check_base_mismatch_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/freshness-check-base-mismatch.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/freshness-check-base-mismatch.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/freshness-check-base-mismatch.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_freshness_paths_exist_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/freshness-paths-exist.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/freshness-paths-exist.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/freshness-paths-exist.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_freshness_regen_rebase_guard_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/freshness-regen-rebase-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/freshness-regen-rebase-guard.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/freshness-regen-rebase-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_generated_artifacts_registry_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/generated-artifacts-registry.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/generated-artifacts-registry.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/generated-artifacts-registry.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_generated_path_separators_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/generated-path-separators.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/generated-path-separators.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/generated-path-separators.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_gh_repo_context_guard_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/gh-repo-context-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/gh-repo-context-guard.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/gh-repo-context-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_ghcr_digest_auth_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/ghcr-digest-auth.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/ghcr-digest-auth.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/ghcr-digest-auth.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_git_flow_poll_and_branch_order_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/git-flow-poll-and-branch-order.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/git-flow-poll-and-branch-order.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/git-flow-poll-and-branch-order.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_github_only_ci_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/github-only-ci.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/github-only-ci.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/github-only-ci.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_health_goals_pr_path_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/health-goals-pr-path.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/health-goals-pr-path.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/health-goals-pr-path.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_hybrid_runner_placement_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/hybrid-runner-placement.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/hybrid-runner-placement.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/hybrid-runner-placement.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_main_direct_push_guard_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/main-direct-push-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/main-direct-push-guard.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/main-direct-push-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_mishap_t002425_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/mishap-t002425.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/mishap-t002425.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/mishap-t002425.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_pr_auto_title_scope_extraction_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/pr-auto-title-scope-extraction.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/pr-auto-title-scope-extraction.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/pr-auto-title-scope-extraction.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_pr_refresh_batch_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/pr-refresh-batch.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/pr-refresh-batch.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/pr-refresh-batch.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_pre_push_artifact_guard_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/pre-push-artifact-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/pre-push-artifact-guard.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/pre-push-artifact-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_pre_push_scope_base_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/pre-push-scope-base.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/pre-push-scope-base.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/pre-push-scope-base.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_preflight_multi_ticket_id_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/preflight-multi-ticket-id.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/preflight-multi-ticket-id.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/preflight-multi-ticket-id.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_runner_role_assignment_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/runner-role-assignment.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/runner-role-assignment.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/runner-role-assignment.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_self_hosted_fork_guard_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/self-hosted-fork-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/self-hosted-fork-guard.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/self-hosted-fork-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_self_hosted_no_root_install_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/self-hosted-no-root-install.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/self-hosted-no-root-install.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/self-hosted-no-root-install.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_skip_ci_marker_guard_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/skip-ci-marker-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/skip-ci-marker-guard.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/skip-ci-marker-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_spec_dir_convention_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/spec-dir-convention.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/spec-dir-convention.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/spec-dir-convention.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_spec_shard_optimization_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/spec-shard-optimization.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/spec-shard-optimization.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/spec-shard-optimization.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_spec_shard_partition_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/spec-shard-partition.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/spec-shard-partition.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/spec-shard-partition.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_spec_test_no_fixed_sleep_polling_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/spec-test-no-fixed-sleep-polling.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/spec-test-no-fixed-sleep-polling.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/spec-test-no-fixed-sleep-polling.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_spec_test_no_tracked_file_mutation_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/spec-test-no-tracked-file-mutation.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/spec-test-no-tracked-file-mutation.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/spec-test-no-tracked-file-mutation.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_spec_tracked_file_guard_isolation_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/spec-tracked-file-guard-isolation.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/spec-tracked-file-guard-isolation.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/spec-tracked-file-guard-isolation.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_spec_tracked_file_guard_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/spec-tracked-file-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/spec-tracked-file-guard.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/spec-tracked-file-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_taskfile_no_stale_website_root_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/taskfile-no-stale-website-root.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/taskfile-no-stale-website-root.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/taskfile-no-stale-website-root.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_taskfile_shebang_portability_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/taskfile-shebang-portability.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/taskfile-shebang-portability.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/taskfile-shebang-portability.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_taskfiles_dir_convention_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/taskfiles-dir-convention.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/taskfiles-dir-convention.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/taskfiles-dir-convention.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_test_inventory_coverage_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/test-inventory-coverage.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/test-inventory-coverage.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/test-inventory-coverage.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_unit_tests_no_dependency_skips_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/unit-tests-no-dependency-skips.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/unit-tests-no-dependency-skips.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/unit-tests-no-dependency-skips.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_unknown_scope_names_source_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/unknown-scope-names-source.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/unknown-scope-names-source.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/unknown-scope-names-source.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_website_fast_path_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/website-fast-path.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/website-fast-path.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/website-fast-path.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_windows_path_portability_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/windows-path-portability.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/windows-path-portability.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/windows-path-portability.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_workflow_self_trigger_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/workflow-self-trigger.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/workflow-self-trigger.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/workflow-self-trigger.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_worktrees_not_tracked_spec(repo_root: Path):
    """Executes tests/spec/ci-cd/worktrees-not-tracked.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd/worktrees-not-tracked.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd/worktrees-not-tracked.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"
