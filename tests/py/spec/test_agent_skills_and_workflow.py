"""Tests migrating agent_skills_and_workflow specs to pytest (103 specs)."""

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

def test_agent_lock_claim_help_flag_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/agent-lock-claim-help-flag.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/agent-lock-claim-help-flag.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/agent-lock-claim-help-flag.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_automerge_preflight_check_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/automerge-preflight-check.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/automerge-preflight-check.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/automerge-preflight-check.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_bats_negation_keine_bang_pipeline_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/bats-negation-keine-bang-pipeline.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/bats-negation-keine-bang-pipeline.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/bats-negation-keine-bang-pipeline.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_check_pr_automerge_fail_closed_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/check-pr-automerge-fail-closed.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/check-pr-automerge-fail-closed.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/check-pr-automerge-fail-closed.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_devflow_worktree_cwd_guard_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/devflow-worktree-cwd-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/devflow-worktree-cwd-guard.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/devflow-worktree-cwd-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_finalize_archive_frontmatter_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/finalize-archive-frontmatter.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/finalize-archive-frontmatter.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/finalize-archive-frontmatter.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_finalize_hardening_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/finalize-hardening.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/finalize-hardening.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/finalize-hardening.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_finalize_plan_ref_whitespace_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/finalize-plan-ref-whitespace.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/finalize-plan-ref-whitespace.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/finalize-plan-ref-whitespace.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_finalize_worktree_branch_validation_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/finalize-worktree-branch-validation.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/finalize-worktree-branch-validation.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/finalize-worktree-branch-validation.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_guard_semantics_konvention_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/guard-semantics-konvention.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/guard-semantics-konvention.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/guard-semantics-konvention.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_harness_guard_registration_T900024_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/harness-guard-registration-T900024.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/harness-guard-registration-T900024.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/harness-guard-registration-T900024.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_interaction_contract_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/interaction-contract.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/interaction-contract.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/interaction-contract.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_messung_mit_befehl_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/messung-mit-befehl.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/messung-mit-befehl.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/messung-mit-befehl.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_nightly_vendor_sync_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/nightly-vendor-sync.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/nightly-vendor-sync.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/nightly-vendor-sync.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_plugin_activation_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/plugin-activation.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/plugin-activation.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/plugin-activation.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_portable_inventory_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/portable-inventory.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/portable-inventory.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/portable-inventory.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_post_merge_finalize_guards_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/post-merge-finalize-guards.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/post-merge-finalize-guards.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/post-merge-finalize-guards.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_post_merge_finalize_t900096_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/post-merge-finalize-t900096.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/post-merge-finalize-t900096.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/post-merge-finalize-t900096.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_repo_hygiene_tick_snapshot_guard_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/repo-hygiene-tick-snapshot-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/repo-hygiene-tick-snapshot-guard.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/repo-hygiene-tick-snapshot-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_review_gate_before_auto_merge_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/review-gate-before-auto-merge.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/review-gate-before-auto-merge.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/review-gate-before-auto-merge.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_skill_path_references_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/skill-path-references.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/skill-path-references.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/skill-path-references.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_skill_symlink_targets_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/skill-symlink-targets.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/skill-symlink-targets.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/skill-symlink-targets.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_superpowers_harness_parity_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/superpowers-harness-parity.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/superpowers-harness-parity.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/superpowers-harness-parity.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_vendor_sync_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/vendor-sync.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/vendor-sync.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/vendor-sync.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_worktree_git_op_finish_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/worktree-git-op-finish.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/worktree-git-op-finish.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/worktree-git-op-finish.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_worktree_mid_rebase_guard_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/worktree-mid-rebase-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/worktree-mid-rebase-guard.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/worktree-mid-rebase-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_worktree_remove_managed_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/worktree-remove-managed.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/worktree-remove-managed.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/worktree-remove-managed.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_worktree_write_guard_abspath_T900047_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/worktree-write-guard-abspath-T900047.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/worktree-write-guard-abspath-T900047.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/worktree-write-guard-abspath-T900047.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_worktree_write_guard_phase_a_allowlist_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/worktree-write-guard-phase-a-allowlist.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/worktree-write-guard-phase-a-allowlist.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/worktree-write-guard-phase-a-allowlist.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_worktree_write_guard_session_propagation_spec(repo_root: Path):
    """Executes tests/spec/agent-skills/worktree-write-guard-session-propagation.bats."""
    res = _run_bats(repo_root, "tests/spec/agent-skills/worktree-write-guard-session-propagation.bats")
    assert res.returncode == 0, f"tests/spec/agent-skills/worktree-write-guard-session-propagation.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_domains_vocabulary_spec(repo_root: Path):
    """Executes tests/spec/dev-flow-plan/domains-vocabulary.bats."""
    res = _run_bats(repo_root, "tests/spec/dev-flow-plan/domains-vocabulary.bats")
    assert res.returncode == 0, f"tests/spec/dev-flow-plan/domains-vocabulary.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_guard_parity_spec(repo_root: Path):
    """Executes tests/spec/dev-flow-plan/guard-parity.bats."""
    res = _run_bats(repo_root, "tests/spec/dev-flow-plan/guard-parity.bats")
    assert res.returncode == 0, f"tests/spec/dev-flow-plan/guard-parity.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_plan_commit_scope_guard_spec(repo_root: Path):
    """Executes tests/spec/dev-flow-plan/plan-commit-scope-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/dev-flow-plan/plan-commit-scope-guard.bats")
    assert res.returncode == 0, f"tests/spec/dev-flow-plan/plan-commit-scope-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_plan_dir_resolution_spec(repo_root: Path):
    """Executes tests/spec/dev-flow-plan/plan-dir-resolution.bats."""
    res = _run_bats(repo_root, "tests/spec/dev-flow-plan/plan-dir-resolution.bats")
    assert res.returncode == 0, f"tests/spec/dev-flow-plan/plan-dir-resolution.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_plan_intel_annotated_target_files_spec(repo_root: Path):
    """Executes tests/spec/dev-flow-plan/plan-intel-annotated-target-files.bats."""
    res = _run_bats(repo_root, "tests/spec/dev-flow-plan/plan-intel-annotated-target-files.bats")
    assert res.returncode == 0, f"tests/spec/dev-flow-plan/plan-intel-annotated-target-files.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_plan_intel_risks_dedupe_spec(repo_root: Path):
    """Executes tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats."""
    res = _run_bats(repo_root, "tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats")
    assert res.returncode == 0, f"tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_plan_lint_b1b_prose_path_spec(repo_root: Path):
    """Executes tests/spec/dev-flow-plan/plan-lint-b1b-prose-path.bats."""
    res = _run_bats(repo_root, "tests/spec/dev-flow-plan/plan-lint-b1b-prose-path.bats")
    assert res.returncode == 0, f"tests/spec/dev-flow-plan/plan-lint-b1b-prose-path.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_plan_lint_node_test_spec(repo_root: Path):
    """Executes tests/spec/dev-flow-plan/plan-lint-node-test.bats."""
    res = _run_bats(repo_root, "tests/spec/dev-flow-plan/plan-lint-node-test.bats")
    assert res.returncode == 0, f"tests/spec/dev-flow-plan/plan-lint-node-test.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_plan_lint_resourcing_spec(repo_root: Path):
    """Executes tests/spec/dev-flow-plan/plan-lint-resourcing.bats."""
    res = _run_bats(repo_root, "tests/spec/dev-flow-plan/plan-lint-resourcing.bats")
    assert res.returncode == 0, f"tests/spec/dev-flow-plan/plan-lint-resourcing.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_plan_lint_task_count_spec(repo_root: Path):
    """Executes tests/spec/dev-flow-plan/plan-lint-task-count.bats."""
    res = _run_bats(repo_root, "tests/spec/dev-flow-plan/plan-lint-task-count.bats")
    assert res.returncode == 0, f"tests/spec/dev-flow-plan/plan-lint-task-count.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_plan_lint_w3_prose_path_spec(repo_root: Path):
    """Executes tests/spec/dev-flow-plan/plan-lint-w3-prose-path.bats."""
    res = _run_bats(repo_root, "tests/spec/dev-flow-plan/plan-lint-w3-prose-path.bats")
    assert res.returncode == 0, f"tests/spec/dev-flow-plan/plan-lint-w3-prose-path.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_plan_preflight_repo_index_hint_spec(repo_root: Path):
    """Executes tests/spec/dev-flow-plan/plan-preflight-repo-index-hint.bats."""
    res = _run_bats(repo_root, "tests/spec/dev-flow-plan/plan-preflight-repo-index-hint.bats")
    assert res.returncode == 0, f"tests/spec/dev-flow-plan/plan-preflight-repo-index-hint.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_plan_preflight_staged_set_spec(repo_root: Path):
    """Executes tests/spec/dev-flow-plan/plan-preflight-staged-set.bats."""
    res = _run_bats(repo_root, "tests/spec/dev-flow-plan/plan-preflight-staged-set.bats")
    assert res.returncode == 0, f"tests/spec/dev-flow-plan/plan-preflight-staged-set.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_plan_preflight_spec(repo_root: Path):
    """Executes tests/spec/dev-flow-plan/plan-preflight.bats."""
    res = _run_bats(repo_root, "tests/spec/dev-flow-plan/plan-preflight.bats")
    assert res.returncode == 0, f"tests/spec/dev-flow-plan/plan-preflight.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_plan_qa_livez_probe_spec(repo_root: Path):
    """Executes tests/spec/dev-flow-plan/plan-qa-livez-probe.bats."""
    res = _run_bats(repo_root, "tests/spec/dev-flow-plan/plan-qa-livez-probe.bats")
    assert res.returncode == 0, f"tests/spec/dev-flow-plan/plan-qa-livez-probe.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_plan_qa_parse_and_outcome_spec(repo_root: Path):
    """Executes tests/spec/dev-flow-plan/plan-qa-parse-and-outcome.bats."""
    res = _run_bats(repo_root, "tests/spec/dev-flow-plan/plan-qa-parse-and-outcome.bats")
    assert res.returncode == 0, f"tests/spec/dev-flow-plan/plan-qa-parse-and-outcome.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_plan_qa_payload_spec(repo_root: Path):
    """Executes tests/spec/dev-flow-plan/plan-qa-payload.bats."""
    res = _run_bats(repo_root, "tests/spec/dev-flow-plan/plan-qa-payload.bats")
    assert res.returncode == 0, f"tests/spec/dev-flow-plan/plan-qa-payload.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_stage_plan_contract_spec(repo_root: Path):
    """Executes tests/spec/dev-flow-plan/stage-plan-contract.bats."""
    res = _run_bats(repo_root, "tests/spec/dev-flow-plan/stage-plan-contract.bats")
    assert res.returncode == 0, f"tests/spec/dev-flow-plan/stage-plan-contract.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_task_context_spec(repo_root: Path):
    """Executes tests/spec/dev-flow-plan/task-context.bats."""
    res = _run_bats(repo_root, "tests/spec/dev-flow-plan/task-context.bats")
    assert res.returncode == 0, f"tests/spec/dev-flow-plan/task-context.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_tcc_fixture_orphan_reap_spec(repo_root: Path):
    """Executes tests/spec/dev-flow-plan/tcc-fixture-orphan-reap.bats."""
    res = _run_bats(repo_root, "tests/spec/dev-flow-plan/tcc-fixture-orphan-reap.bats")
    assert res.returncode == 0, f"tests/spec/dev-flow-plan/tcc-fixture-orphan-reap.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_worktree_remove_claim_guard_spec(repo_root: Path):
    """Executes tests/spec/dev-flow-plan/worktree-remove-claim-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/dev-flow-plan/worktree-remove-claim-guard.bats")
    assert res.returncode == 0, f"tests/spec/dev-flow-plan/worktree-remove-claim-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_agent_lock_main_checkout_reclaim_spec(repo_root: Path):
    """Executes tests/spec/active-sessions-hub/agent-lock-main-checkout-reclaim.bats."""
    res = _run_bats(repo_root, "tests/spec/active-sessions-hub/agent-lock-main-checkout-reclaim.bats")
    assert res.returncode == 0, f"tests/spec/active-sessions-hub/agent-lock-main-checkout-reclaim.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_agent_lock_release_cwd_spec(repo_root: Path):
    """Executes tests/spec/active-sessions-hub/agent-lock-release-cwd.bats."""
    res = _run_bats(repo_root, "tests/spec/active-sessions-hub/agent-lock-release-cwd.bats")
    assert res.returncode == 0, f"tests/spec/active-sessions-hub/agent-lock-release-cwd.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_agent_lock_scope_regelwerk_spec(repo_root: Path):
    """Executes tests/spec/active-sessions-hub/agent-lock-scope-regelwerk.bats."""
    res = _run_bats(repo_root, "tests/spec/active-sessions-hub/agent-lock-scope-regelwerk.bats")
    assert res.returncode == 0, f"tests/spec/active-sessions-hub/agent-lock-scope-regelwerk.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_agent_lock_windows_drive_path_T900023_spec(repo_root: Path):
    """Executes tests/spec/active-sessions-hub/agent-lock-windows-drive-path-T900023.bats."""
    res = _run_bats(repo_root, "tests/spec/active-sessions-hub/agent-lock-windows-drive-path-T900023.bats")
    assert res.returncode == 0, f"tests/spec/active-sessions-hub/agent-lock-windows-drive-path-T900023.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_agy_session_id_stable_spec(repo_root: Path):
    """Executes tests/spec/active-sessions-hub/agy-session-id-stable.bats."""
    res = _run_bats(repo_root, "tests/spec/active-sessions-hub/agy-session-id-stable.bats")
    assert res.returncode == 0, f"tests/spec/active-sessions-hub/agy-session-id-stable.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_claim_persistence_verified_T002826_spec(repo_root: Path):
    """Executes tests/spec/active-sessions-hub/claim-persistence-verified-T002826.bats."""
    res = _run_bats(repo_root, "tests/spec/active-sessions-hub/claim-persistence-verified-T002826.bats")
    assert res.returncode == 0, f"tests/spec/active-sessions-hub/claim-persistence-verified-T002826.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_lock_ownership_cwd_independent_T003110_spec(repo_root: Path):
    """Executes tests/spec/active-sessions-hub/lock-ownership-cwd-independent-T003110.bats."""
    res = _run_bats(repo_root, "tests/spec/active-sessions-hub/lock-ownership-cwd-independent-T003110.bats")
    assert res.returncode == 0, f"tests/spec/active-sessions-hub/lock-ownership-cwd-independent-T003110.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_opencode_session_id_stable_spec(repo_root: Path):
    """Executes tests/spec/active-sessions-hub/opencode-session-id-stable.bats."""
    res = _run_bats(repo_root, "tests/spec/active-sessions-hub/opencode-session-id-stable.bats")
    assert res.returncode == 0, f"tests/spec/active-sessions-hub/opencode-session-id-stable.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_partial_claims_T900024_spec(repo_root: Path):
    """Executes tests/spec/active-sessions-hub/partial-claims-T900024.bats."""
    res = _run_bats(repo_root, "tests/spec/active-sessions-hub/partial-claims-T900024.bats")
    assert res.returncode == 0, f"tests/spec/active-sessions-hub/partial-claims-T900024.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_release_foreign_lock_guard_spec(repo_root: Path):
    """Executes tests/spec/active-sessions-hub/release-foreign-lock-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/active-sessions-hub/release-foreign-lock-guard.bats")
    assert res.returncode == 0, f"tests/spec/active-sessions-hub/release-foreign-lock-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_session_activity_visibility_T003098_spec(repo_root: Path):
    """Executes tests/spec/active-sessions-hub/session-activity-visibility-T003098.bats."""
    res = _run_bats(repo_root, "tests/spec/active-sessions-hub/session-activity-visibility-T003098.bats")
    assert res.returncode == 0, f"tests/spec/active-sessions-hub/session-activity-visibility-T003098.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_ssot_harness_stable_session_spec(repo_root: Path):
    """Executes tests/spec/active-sessions-hub/ssot-harness-stable-session.bats."""
    res = _run_bats(repo_root, "tests/spec/active-sessions-hub/ssot-harness-stable-session.bats")
    assert res.returncode == 0, f"tests/spec/active-sessions-hub/ssot-harness-stable-session.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_ticket_lock_closure_T003102_spec(repo_root: Path):
    """Executes tests/spec/active-sessions-hub/ticket-lock-closure-T003102.bats."""
    res = _run_bats(repo_root, "tests/spec/active-sessions-hub/ticket-lock-closure-T003102.bats")
    assert res.returncode == 0, f"tests/spec/active-sessions-hub/ticket-lock-closure-T003102.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_agentic_resource_lookup_spec(repo_root: Path):
    """Executes tests/spec/toolset-registry/agentic-resource-lookup.bats."""
    res = _run_bats(repo_root, "tests/spec/toolset-registry/agentic-resource-lookup.bats")
    assert res.returncode == 0, f"tests/spec/toolset-registry/agentic-resource-lookup.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_bp_roles_spec(repo_root: Path):
    """Executes tests/spec/toolset-registry/bp-roles.bats."""
    res = _run_bats(repo_root, "tests/spec/toolset-registry/bp-roles.bats")
    assert res.returncode == 0, f"tests/spec/toolset-registry/bp-roles.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_check_drift_detection_spec(repo_root: Path):
    """Executes tests/spec/toolset-registry/check-drift-detection.bats."""
    res = _run_bats(repo_root, "tests/spec/toolset-registry/check-drift-detection.bats")
    assert res.returncode == 0, f"tests/spec/toolset-registry/check-drift-detection.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_collect_kinds_spec(repo_root: Path):
    """Executes tests/spec/toolset-registry/collect-kinds.bats."""
    res = _run_bats(repo_root, "tests/spec/toolset-registry/collect-kinds.bats")
    assert res.returncode == 0, f"tests/spec/toolset-registry/collect-kinds.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_context_injection_spec(repo_root: Path):
    """Executes tests/spec/toolset-registry/context-injection.bats."""
    res = _run_bats(repo_root, "tests/spec/toolset-registry/context-injection.bats")
    assert res.returncode == 0, f"tests/spec/toolset-registry/context-injection.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_harness_specialization_spec(repo_root: Path):
    """Executes tests/spec/toolset-registry/harness-specialization.bats."""
    res = _run_bats(repo_root, "tests/spec/toolset-registry/harness-specialization.bats")
    assert res.returncode == 0, f"tests/spec/toolset-registry/harness-specialization.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_lock_summary_spec(repo_root: Path):
    """Executes tests/spec/toolset-registry/lock-summary.bats."""
    res = _run_bats(repo_root, "tests/spec/toolset-registry/lock-summary.bats")
    assert res.returncode == 0, f"tests/spec/toolset-registry/lock-summary.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_schema_gate_spec(repo_root: Path):
    """Executes tests/spec/toolset-registry/schema-gate.bats."""
    res = _run_bats(repo_root, "tests/spec/toolset-registry/schema-gate.bats")
    assert res.returncode == 0, f"tests/spec/toolset-registry/schema-gate.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_sync_all_harnesses_spec(repo_root: Path):
    """Executes tests/spec/toolset-registry/sync-all-harnesses.bats."""
    res = _run_bats(repo_root, "tests/spec/toolset-registry/sync-all-harnesses.bats")
    assert res.returncode == 0, f"tests/spec/toolset-registry/sync-all-harnesses.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_sync_surgical_spec(repo_root: Path):
    """Executes tests/spec/toolset-registry/sync-surgical.bats."""
    res = _run_bats(repo_root, "tests/spec/toolset-registry/sync-surgical.bats")
    assert res.returncode == 0, f"tests/spec/toolset-registry/sync-surgical.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_tool_level_spec(repo_root: Path):
    """Executes tests/spec/toolset-registry/tool-level.bats."""
    res = _run_bats(repo_root, "tests/spec/toolset-registry/tool-level.bats")
    assert res.returncode == 0, f"tests/spec/toolset-registry/tool-level.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_tools_suppressed_spec(repo_root: Path):
    """Executes tests/spec/toolset-registry/tools-suppressed.bats."""
    res = _run_bats(repo_root, "tests/spec/toolset-registry/tools-suppressed.bats")
    assert res.returncode == 0, f"tests/spec/toolset-registry/tools-suppressed.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_unreviewed_quarantine_spec(repo_root: Path):
    """Executes tests/spec/toolset-registry/unreviewed-quarantine.bats."""
    res = _run_bats(repo_root, "tests/spec/toolset-registry/unreviewed-quarantine.bats")
    assert res.returncode == 0, f"tests/spec/toolset-registry/unreviewed-quarantine.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_areas_csv_trim_spec(repo_root: Path):
    """Executes tests/spec/ticket-system/areas-csv-trim.bats."""
    res = _run_bats(repo_root, "tests/spec/ticket-system/areas-csv-trim.bats")
    assert res.returncode == 0, f"tests/spec/ticket-system/areas-csv-trim.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_backfill_id_sequence_spec(repo_root: Path):
    """Executes tests/spec/ticket-system/backfill-id-sequence.bats."""
    res = _run_bats(repo_root, "tests/spec/ticket-system/backfill-id-sequence.bats")
    assert res.returncode == 0, f"tests/spec/ticket-system/backfill-id-sequence.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_exec_sql_error_visibility_T900239_spec(repo_root: Path):
    """Executes tests/spec/ticket-system/exec-sql-error-visibility-T900239.bats."""
    res = _run_bats(repo_root, "tests/spec/ticket-system/exec-sql-error-visibility-T900239.bats")
    assert res.returncode == 0, f"tests/spec/ticket-system/exec-sql-error-visibility-T900239.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_get_timeline_brand_flag_removed_T900246_spec(repo_root: Path):
    """Executes tests/spec/ticket-system/get-timeline-brand-flag-removed-T900246.bats."""
    res = _run_bats(repo_root, "tests/spec/ticket-system/get-timeline-brand-flag-removed-T900246.bats")
    assert res.returncode == 0, f"tests/spec/ticket-system/get-timeline-brand-flag-removed-T900246.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_get_timeline_plan_brand_column_T900243_spec(repo_root: Path):
    """Executes tests/spec/ticket-system/get-timeline-plan-brand-column-T900243.bats."""
    res = _run_bats(repo_root, "tests/spec/ticket-system/get-timeline-plan-brand-column-T900243.bats")
    assert res.returncode == 0, f"tests/spec/ticket-system/get-timeline-plan-brand-column-T900243.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_list_status_comma_list_spec(repo_root: Path):
    """Executes tests/spec/ticket-system/list-status-comma-list.bats."""
    res = _run_bats(repo_root, "tests/spec/ticket-system/list-status-comma-list.bats")
    assert res.returncode == 0, f"tests/spec/ticket-system/list-status-comma-list.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_list_test_data_filter_spec(repo_root: Path):
    """Executes tests/spec/ticket-system/list-test-data-filter.bats."""
    res = _run_bats(repo_root, "tests/spec/ticket-system/list-test-data-filter.bats")
    assert res.returncode == 0, f"tests/spec/ticket-system/list-test-data-filter.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_read_path_fail_closed_spec(repo_root: Path):
    """Executes tests/spec/ticket-system/read-path-fail-closed.bats."""
    res = _run_bats(repo_root, "tests/spec/ticket-system/read-path-fail-closed.bats")
    assert res.returncode == 0, f"tests/spec/ticket-system/read-path-fail-closed.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_subcommand_help_spec(repo_root: Path):
    """Executes tests/spec/ticket-system/subcommand-help.bats."""
    res = _run_bats(repo_root, "tests/spec/ticket-system/subcommand-help.bats")
    assert res.returncode == 0, f"tests/spec/ticket-system/subcommand-help.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_phase_events_at_column_spec(repo_root: Path):
    """Executes tests/spec/ticket-mcp/phase-events-at-column.bats."""
    res = _run_bats(repo_root, "tests/spec/ticket-mcp/phase-events-at-column.bats")
    assert res.returncode == 0, f"tests/spec/ticket-mcp/phase-events-at-column.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_triage_projection_spec(repo_root: Path):
    """Executes tests/spec/ticket-mcp/triage-projection.bats."""
    res = _run_bats(repo_root, "tests/spec/ticket-mcp/triage-projection.bats")
    assert res.returncode == 0, f"tests/spec/ticket-mcp/triage-projection.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_triage_status_ssot_spec(repo_root: Path):
    """Executes tests/spec/ticket-ops/triage-status-ssot.bats."""
    res = _run_bats(repo_root, "tests/spec/ticket-ops/triage-status-ssot.bats")
    assert res.returncode == 0, f"tests/spec/ticket-ops/triage-status-ssot.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_wave1_state_refetch_spec(repo_root: Path):
    """Executes tests/spec/ticket-ops/wave1-state-refetch.bats."""
    res = _run_bats(repo_root, "tests/spec/ticket-ops/wave1-state-refetch.bats")
    assert res.returncode == 0, f"tests/spec/ticket-ops/wave1-state-refetch.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"
