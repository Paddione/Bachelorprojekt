"""Tests migrating remaining domain and root specs to pytest - Part 1 (121 specs)."""

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

def test_active_sessions_hub_spec(repo_root: Path):
    """Executes tests/spec/active-sessions-hub.bats."""
    res = _run_bats(repo_root, "tests/spec/active-sessions-hub.bats")
    assert res.returncode == 0, f"tests/spec/active-sessions-hub.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_collision_own_worktree_spec(repo_root: Path):
    """Executes tests/spec/agent-behavior/collision-own-worktree.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-behavior/collision-own-worktree.bats")
    assert res.returncode == 0, f"tests/spec/agent-behavior/collision-own-worktree.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_no_tools_allowlist_spec(repo_root: Path):
    """Executes tests/spec/agent-behavior/no-tools-allowlist.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-behavior/no-tools-allowlist.bats")
    assert res.returncode == 0, f"tests/spec/agent-behavior/no-tools-allowlist.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_loadouts_spec(repo_root: Path):
    """Executes tests/spec/agent-bench/loadouts.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-bench/loadouts.bats")
    assert res.returncode == 0, f"tests/spec/agent-bench/loadouts.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_matrix_cli_spec(repo_root: Path):
    """Executes tests/spec/agent-bench/matrix-cli.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-bench/matrix-cli.bats")
    assert res.returncode == 0, f"tests/spec/agent-bench/matrix-cli.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_report_corpus_spec(repo_root: Path):
    """Executes tests/spec/agent-bench/report-corpus.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-bench/report-corpus.bats")
    assert res.returncode == 0, f"tests/spec/agent-bench/report-corpus.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_pid_dead_worktree_match_T002849_spec(repo_root: Path):
    """Executes tests/spec/agent-lock-reclaim/pid-dead-worktree-match-T002849.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-lock-reclaim/pid-dead-worktree-match-T002849.bats")
    assert res.returncode == 0, f"tests/spec/agent-lock-reclaim/pid-dead-worktree-match-T002849.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_g_agentic01_unresolved_tools_spec(repo_root: Path):
    """Executes tests/spec/agentic-tooling-quality-goals/g-agentic01-unresolved-tools.bats."""
    res = _run_bats(repo_root, "tests/spec/agentic-tooling-quality-goals/g-agentic01-unresolved-tools.bats")
    assert res.returncode == 0, f"tests/spec/agentic-tooling-quality-goals/g-agentic01-unresolved-tools.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_auth_sso_spec(repo_root: Path):
    """Executes tests/spec/auth-sso.bats."""
    res = _run_bats(repo_root, "tests/spec/auth-sso.bats")
    assert res.returncode == 0, f"tests/spec/auth-sso.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_filen_remote_retention_spec(repo_root: Path):
    """Executes tests/spec/backup-pipeline/filen-remote-retention.bats."""
    res = _run_bats(repo_root, "tests/spec/backup-pipeline/filen-remote-retention.bats")
    assert res.returncode == 0, f"tests/spec/backup-pipeline/filen-remote-retention.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_render_escaping_spec(repo_root: Path):
    """Executes tests/spec/backup-pipeline/render-escaping.bats."""
    res = _run_bats(repo_root, "tests/spec/backup-pipeline/render-escaping.bats")
    assert res.returncode == 0, f"tests/spec/backup-pipeline/render-escaping.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_basic_invoices_spec(repo_root: Path):
    """Executes tests/spec/basic-invoices.bats."""
    res = _run_bats(repo_root, "tests/spec/basic-invoices.bats")
    assert res.returncode == 0, f"tests/spec/basic-invoices.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_batch_git_worktree_integrity_spec(repo_root: Path):
    """Executes tests/spec/batch-git-worktree-integrity.bats."""
    res = _run_bats(repo_root, "tests/spec/batch-git-worktree-integrity.bats")
    assert res.returncode == 0, f"tests/spec/batch-git-worktree-integrity.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_batch_repo_hygiene_ops_fixes_spec(repo_root: Path):
    """Executes tests/spec/batch-repo-hygiene-ops-fixes.bats."""
    res = _run_bats(repo_root, "tests/spec/batch-repo-hygiene-ops-fixes.bats")
    assert res.returncode == 0, f"tests/spec/batch-repo-hygiene-ops-fixes.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_runtime_drift_auto_kill_spec(repo_root: Path):
    """Executes tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-auto-kill.bats."""
    res = _run_bats(repo_root, "tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-auto-kill.bats")
    assert res.returncode == 0, f"tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-auto-kill.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_runtime_drift_check_spec(repo_root: Path):
    """Executes tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-check.bats."""
    res = _run_bats(repo_root, "tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-check.bats")
    assert res.returncode == 0, f"tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-check.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_archive_plan_gitshow_fallback_spec(repo_root: Path):
    """Executes tests/spec/batch-worktree-guard-tooling-fixes/archive-plan-gitshow-fallback.bats."""
    res = _run_bats(repo_root, "tests/spec/batch-worktree-guard-tooling-fixes/archive-plan-gitshow-fallback.bats")
    assert res.returncode == 0, f"tests/spec/batch-worktree-guard-tooling-fixes/archive-plan-gitshow-fallback.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_deploy_route_sdlc_exclusion_spec(repo_root: Path):
    """Executes tests/spec/batch-worktree-guard-tooling-fixes/deploy-route-sdlc-exclusion.bats."""
    res = _run_bats(repo_root, "tests/spec/batch-worktree-guard-tooling-fixes/deploy-route-sdlc-exclusion.bats")
    assert res.returncode == 0, f"tests/spec/batch-worktree-guard-tooling-fixes/deploy-route-sdlc-exclusion.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_precommit_accepts_batch_branches_spec(repo_root: Path):
    """Executes tests/spec/batch-worktree-guard-tooling-fixes/precommit-accepts-batch-branches.bats."""
    res = _run_bats(repo_root, "tests/spec/batch-worktree-guard-tooling-fixes/precommit-accepts-batch-branches.bats")
    assert res.returncode == 0, f"tests/spec/batch-worktree-guard-tooling-fixes/precommit-accepts-batch-branches.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_brain_auto_memory_spec(repo_root: Path):
    """Executes tests/spec/brain-auto-memory.bats."""
    res = _run_bats(repo_root, "tests/spec/brain-auto-memory.bats")
    assert res.returncode == 0, f"tests/spec/brain-auto-memory.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_brain_foundation_spec(repo_root: Path):
    """Executes tests/spec/brain-foundation.bats."""
    res = _run_bats(repo_root, "tests/spec/brain-foundation.bats")
    assert res.returncode == 0, f"tests/spec/brain-foundation.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_chunking_spec(repo_root: Path):
    """Executes tests/spec/brain-k4-brain-wiki/chunking.bats."""
    res = _run_bats(repo_root, "tests/spec/brain-k4-brain-wiki/chunking.bats")
    assert res.returncode == 0, f"tests/spec/brain-k4-brain-wiki/chunking.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_parent_moc_spec(repo_root: Path):
    """Executes tests/spec/brain-k4-brain-wiki/parent-moc.bats."""
    res = _run_bats(repo_root, "tests/spec/brain-k4-brain-wiki/parent-moc.bats")
    assert res.returncode == 0, f"tests/spec/brain-k4-brain-wiki/parent-moc.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_retrieval_eval_spec(repo_root: Path):
    """Executes tests/spec/brain-k4-brain-wiki/retrieval-eval.bats."""
    res = _run_bats(repo_root, "tests/spec/brain-k4-brain-wiki/retrieval-eval.bats")
    assert res.returncode == 0, f"tests/spec/brain-k4-brain-wiki/retrieval-eval.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_brain_quality_goals_spec(repo_root: Path):
    """Executes tests/spec/brain-quality-goals.bats."""
    res = _run_bats(repo_root, "tests/spec/brain-quality-goals.bats")
    assert res.returncode == 0, f"tests/spec/brain-quality-goals.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_ci_cd_spec(repo_root: Path):
    """Executes tests/spec/ci-cd.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-cd.bats")
    assert res.returncode == 0, f"tests/spec/ci-cd.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_ci_red_intake_autoresolve_spec(repo_root: Path):
    """Executes tests/spec/ci-red-intake-autoresolve.bats."""
    res = _run_bats(repo_root, "tests/spec/ci-red-intake-autoresolve.bats")
    assert res.returncode == 0, f"tests/spec/ci-red-intake-autoresolve.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_client_directory_spec(repo_root: Path):
    """Executes tests/spec/client-directory.bats."""
    res = _run_bats(repo_root, "tests/spec/client-directory.bats")
    assert res.returncode == 0, f"tests/spec/client-directory.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_coaching_sessions_polish_guide_spec(repo_root: Path):
    """Executes tests/spec/coaching-sessions-polish-guide.bats."""
    res = _run_bats(repo_root, "tests/spec/coaching-sessions-polish-guide.bats")
    assert res.returncode == 0, f"tests/spec/coaching-sessions-polish-guide.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_questionnaire_insights_spec(repo_root: Path):
    """Executes tests/spec/coaching/questionnaire-insights.bats."""
    res = _run_bats(repo_root, "tests/spec/coaching/questionnaire-insights.bats")
    assert res.returncode == 0, f"tests/spec/coaching/questionnaire-insights.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_session_summaries_spec(repo_root: Path):
    """Executes tests/spec/coaching/session-summaries.bats."""
    res = _run_bats(repo_root, "tests/spec/coaching/session-summaries.bats")
    assert res.returncode == 0, f"tests/spec/coaching/session-summaries.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_commit_signing_spec(repo_root: Path):
    """Executes tests/spec/commit-signing.bats."""
    res = _run_bats(repo_root, "tests/spec/commit-signing.bats")
    assert res.returncode == 0, f"tests/spec/commit-signing.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_database_spec(repo_root: Path):
    """Executes tests/spec/database.bats."""
    res = _run_bats(repo_root, "tests/spec/database.bats")
    assert res.returncode == 0, f"tests/spec/database.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_db_identity_guard_spec(repo_root: Path):
    """Executes tests/spec/db-guard/db-identity-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/db-guard/db-identity-guard.bats")
    assert res.returncode == 0, f"tests/spec/db-guard/db-identity-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_decommission_guard_spec(repo_root: Path):
    """Executes tests/spec/decommission/decommission-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/decommission/decommission-guard.bats")
    assert res.returncode == 0, f"tests/spec/decommission/decommission-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_onboard_machine_spec(repo_root: Path):
    """Executes tests/spec/dev-machine-onboarding/onboard-machine.bats."""
    res = _run_bats(repo_root, "tests/spec/dev-machine-onboarding/onboard-machine.bats")
    assert res.returncode == 0, f"tests/spec/dev-machine-onboarding/onboard-machine.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_dev_pod_spec(repo_root: Path):
    """Executes tests/spec/dev-pod-mcp-bundle/dev-pod.bats."""
    res = _run_bats(repo_root, "tests/spec/dev-pod-mcp-bundle/dev-pod.bats")
    assert res.returncode == 0, f"tests/spec/dev-pod-mcp-bundle/dev-pod.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_graph_index_spec(repo_root: Path):
    """Executes tests/spec/devflow-mcp/graph-index.bats."""
    res = _run_bats(repo_root, "tests/spec/devflow-mcp/graph-index.bats")
    assert res.returncode == 0, f"tests/spec/devflow-mcp/graph-index.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_plan_stage_spec(repo_root: Path):
    """Executes tests/spec/devflow-mcp/plan-stage.bats."""
    res = _run_bats(repo_root, "tests/spec/devflow-mcp/plan-stage.bats")
    assert res.returncode == 0, f"tests/spec/devflow-mcp/plan-stage.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_retrieval_spec(repo_root: Path):
    """Executes tests/spec/devflow-mcp/retrieval.bats."""
    res = _run_bats(repo_root, "tests/spec/devflow-mcp/retrieval.bats")
    assert res.returncode == 0, f"tests/spec/devflow-mcp/retrieval.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_devflow_selection_archive_hardening_spec(repo_root: Path):
    """Executes tests/spec/devflow-selection-archive-hardening.bats."""
    res = _run_bats(repo_root, "tests/spec/devflow-selection-archive-hardening.bats")
    assert res.returncode == 0, f"tests/spec/devflow-selection-archive-hardening.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_merge_commit_selection_spec(repo_root: Path):
    """Executes tests/spec/devflow-selection-archive-hardening/merge-commit-selection.bats."""
    res = _run_bats(repo_root, "tests/spec/devflow-selection-archive-hardening/merge-commit-selection.bats")
    assert res.returncode == 0, f"tests/spec/devflow-selection-archive-hardening/merge-commit-selection.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_branch_name_guard_spec(repo_root: Path):
    """Executes tests/spec/divergence-guard/branch-name-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/divergence-guard/branch-name-guard.bats")
    assert res.returncode == 0, f"tests/spec/divergence-guard/branch-name-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_branch_prefix_suggestion_spec(repo_root: Path):
    """Executes tests/spec/divergence-guard/branch-prefix-suggestion.bats."""
    res = _run_bats(repo_root, "tests/spec/divergence-guard/branch-prefix-suggestion.bats")
    assert res.returncode == 0, f"tests/spec/divergence-guard/branch-prefix-suggestion.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_main_checkout_foreign_guard_spec(repo_root: Path):
    """Executes tests/spec/divergence-guard/main-checkout-foreign-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/divergence-guard/main-checkout-foreign-guard.bats")
    assert res.returncode == 0, f"tests/spec/divergence-guard/main-checkout-foreign-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_stash_drop_by_message_spec(repo_root: Path):
    """Executes tests/spec/divergence-guard/stash-drop-by-message.bats."""
    res = _run_bats(repo_root, "tests/spec/divergence-guard/stash-drop-by-message.bats")
    assert res.returncode == 0, f"tests/spec/divergence-guard/stash-drop-by-message.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_worktree_create_git_op_guard_spec(repo_root: Path):
    """Executes tests/spec/divergence-guard/worktree-create-git-op-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/divergence-guard/worktree-create-git-op-guard.bats")
    assert res.returncode == 0, f"tests/spec/divergence-guard/worktree-create-git-op-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_docker_build_speedup_spec(repo_root: Path):
    """Executes tests/spec/docker-build-speedup.bats."""
    res = _run_bats(repo_root, "tests/spec/docker-build-speedup.bats")
    assert res.returncode == 0, f"tests/spec/docker-build-speedup.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_taskfile_runtime_spec(repo_root: Path):
    """Executes tests/spec/dsh-harness-integration/taskfile-runtime.bats."""
    res = _run_bats(repo_root, "tests/spec/dsh-harness-integration/taskfile-runtime.bats")
    assert res.returncode == 0, f"tests/spec/dsh-harness-integration/taskfile-runtime.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_e2e_test_infrastructure_spec(repo_root: Path):
    """Executes tests/spec/e2e-test-infrastructure.bats."""
    res = _run_bats(repo_root, "tests/spec/e2e-test-infrastructure.bats")
    assert res.returncode == 0, f"tests/spec/e2e-test-infrastructure.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_env_seal_empty_value_keys_spec(repo_root: Path):
    """Executes tests/spec/env-seal-empty-value-keys.bats."""
    res = _run_bats(repo_root, "tests/spec/env-seal-empty-value-keys.bats")
    assert res.returncode == 0, f"tests/spec/env-seal-empty-value-keys.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_feature_product_linking_spec(repo_root: Path):
    """Executes tests/spec/feature-product-linking.bats."""
    res = _run_bats(repo_root, "tests/spec/feature-product-linking.bats")
    assert res.returncode == 0, f"tests/spec/feature-product-linking.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_model_registry_spec(repo_root: Path):
    """Executes tests/spec/finetune/model-registry.bats."""
    res = _run_bats(repo_root, "tests/spec/finetune/model-registry.bats")
    assert res.returncode == 0, f"tests/spec/finetune/model-registry.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_fix_ticket_tracking_T002279_spec(repo_root: Path):
    """Executes tests/spec/fix-ticket-tracking-T002279.bats."""
    res = _run_bats(repo_root, "tests/spec/fix-ticket-tracking-T002279.bats")
    assert res.returncode == 0, f"tests/spec/fix-ticket-tracking-T002279.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_bootstrap_envsubst_spec(repo_root: Path):
    """Executes tests/spec/flux-render-security/bootstrap-envsubst.bats."""
    res = _run_bats(repo_root, "tests/spec/flux-render-security/bootstrap-envsubst.bats")
    assert res.returncode == 0, f"tests/spec/flux-render-security/bootstrap-envsubst.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_immutable_image_refs_spec(repo_root: Path):
    """Executes tests/spec/flux-render-security/immutable-image-refs.bats."""
    res = _run_bats(repo_root, "tests/spec/flux-render-security/immutable-image-refs.bats")
    assert res.returncode == 0, f"tests/spec/flux-render-security/immutable-image-refs.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_no_default_secrets_spec(repo_root: Path):
    """Executes tests/spec/flux-render-security/no-default-secrets.bats."""
    res = _run_bats(repo_root, "tests/spec/flux-render-security/no-default-secrets.bats")
    assert res.returncode == 0, f"tests/spec/flux-render-security/no-default-secrets.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_runtime_var_unwrapping_spec(repo_root: Path):
    """Executes tests/spec/flux-render-security/runtime-var-unwrapping.bats."""
    res = _run_bats(repo_root, "tests/spec/flux-render-security/runtime-var-unwrapping.bats")
    assert res.returncode == 0, f"tests/spec/flux-render-security/runtime-var-unwrapping.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_githooks_worktree_fallback_spec(repo_root: Path):
    """Executes tests/spec/githooks-worktree-fallback.bats."""
    res = _run_bats(repo_root, "tests/spec/githooks-worktree-fallback.bats")
    assert res.returncode == 0, f"tests/spec/githooks-worktree-fallback.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_guard_preconditions_spec(repo_root: Path):
    """Executes tests/spec/guard-preconditions/guard-preconditions.bats."""
    res = _run_bats(repo_root, "tests/spec/guard-preconditions/guard-preconditions.bats")
    assert res.returncode == 0, f"tests/spec/guard-preconditions/guard-preconditions.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_harness_workflow_split_spec(repo_root: Path):
    """Executes tests/spec/harness-workflow-split.bats."""
    res = _run_bats(repo_root, "tests/spec/harness-workflow-split.bats")
    assert res.returncode == 0, f"tests/spec/harness-workflow-split.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_health_goals_erden_spec(repo_root: Path):
    """Executes tests/spec/health-goals-erden.bats."""
    res = _run_bats(repo_root, "tests/spec/health-goals-erden.bats")
    assert res.returncode == 0, f"tests/spec/health-goals-erden.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_hermes_mcp_access_spec(repo_root: Path):
    """Executes tests/spec/hermes-mcp-access.bats."""
    res = _run_bats(repo_root, "tests/spec/hermes-mcp-access.bats")
    assert res.returncode == 0, f"tests/spec/hermes-mcp-access.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_k4_surgery_guard_spec(repo_root: Path):
    """Executes tests/spec/k4-surgery-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/k4-surgery-guard.bats")
    assert res.returncode == 0, f"tests/spec/k4-surgery-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_langfuse_agent_tracing_spec(repo_root: Path):
    """Executes tests/spec/langfuse-agent-tracing.bats."""
    res = _run_bats(repo_root, "tests/spec/langfuse-agent-tracing.bats")
    assert res.returncode == 0, f"tests/spec/langfuse-agent-tracing.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_llm_local_dev_spec(repo_root: Path):
    """Executes tests/spec/llm-local-dev.bats."""
    res = _run_bats(repo_root, "tests/spec/llm-local-dev.bats")
    assert res.returncode == 0, f"tests/spec/llm-local-dev.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_local_llm_proxy_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_mcp_gateway_spec(repo_root: Path):
    """Executes tests/spec/mcp-gateway.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-gateway.bats")
    assert res.returncode == 0, f"tests/spec/mcp-gateway.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_mcp_skill_integration_spec(repo_root: Path):
    """Executes tests/spec/mcp-skill-integration.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-skill-integration.bats")
    assert res.returncode == 0, f"tests/spec/mcp-skill-integration.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_mcp_task_runner_spec(repo_root: Path):
    """Executes tests/spec/mcp-task-runner.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-task-runner.bats")
    assert res.returncode == 0, f"tests/spec/mcp-task-runner.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_mcp_tooling_spec(repo_root: Path):
    """Executes tests/spec/mcp-tooling.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-tooling.bats")
    assert res.returncode == 0, f"tests/spec/mcp-tooling.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"
