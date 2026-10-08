"""Tests migrating remaining domain and root specs to pytest - Part 2 (121 specs)."""

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

def test_mediaviewer_spec(repo_root: Path):
    """Executes tests/spec/mediaviewer.bats."""
    res = _run_bats(repo_root, "tests/spec/mediaviewer.bats")
    assert res.returncode == 0, f"tests/spec/mediaviewer.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_apply_escalation_spec(repo_root: Path):
    """Executes tests/spec/merge-arbitration/apply-escalation.bats."""
    res = _run_bats(repo_root, "tests/spec/merge-arbitration/apply-escalation.bats")
    assert res.returncode == 0, f"tests/spec/merge-arbitration/apply-escalation.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_apply_idempotency_spec(repo_root: Path):
    """Executes tests/spec/merge-arbitration/apply-idempotency.bats."""
    res = _run_bats(repo_root, "tests/spec/merge-arbitration/apply-idempotency.bats")
    assert res.returncode == 0, f"tests/spec/merge-arbitration/apply-idempotency.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_detect_clustering_spec(repo_root: Path):
    """Executes tests/spec/merge-arbitration/detect-clustering.bats."""
    res = _run_bats(repo_root, "tests/spec/merge-arbitration/detect-clustering.bats")
    assert res.returncode == 0, f"tests/spec/merge-arbitration/detect-clustering.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_detect_generated_exclusion_spec(repo_root: Path):
    """Executes tests/spec/merge-arbitration/detect-generated-exclusion.bats."""
    res = _run_bats(repo_root, "tests/spec/merge-arbitration/detect-generated-exclusion.bats")
    assert res.returncode == 0, f"tests/spec/merge-arbitration/detect-generated-exclusion.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_detect_threshold_spec(repo_root: Path):
    """Executes tests/spec/merge-arbitration/detect-threshold.bats."""
    res = _run_bats(repo_root, "tests/spec/merge-arbitration/detect-threshold.bats")
    assert res.returncode == 0, f"tests/spec/merge-arbitration/detect-threshold.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_synthesize_syntax_gate_spec(repo_root: Path):
    """Executes tests/spec/merge-arbitration/synthesize-syntax-gate.bats."""
    res = _run_bats(repo_root, "tests/spec/merge-arbitration/synthesize-syntax-gate.bats")
    assert res.returncode == 0, f"tests/spec/merge-arbitration/synthesize-syntax-gate.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_mishap_bundle_2026_06_30_spec(repo_root: Path):
    """Executes tests/spec/mishap-bundle-2026-06-30.bats."""
    res = _run_bats(repo_root, "tests/spec/mishap-bundle-2026-06-30.bats")
    assert res.returncode == 0, f"tests/spec/mishap-bundle-2026-06-30.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_mishap_bundle_T002506_spec(repo_root: Path):
    """Executes tests/spec/mishap-bundle-T002506.bats."""
    res = _run_bats(repo_root, "tests/spec/mishap-bundle-T002506.bats")
    assert res.returncode == 0, f"tests/spec/mishap-bundle-T002506.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_mishap_bundle_infra_testspec_ci_spec(repo_root: Path):
    """Executes tests/spec/mishap-bundle-infra-testspec-ci.bats."""
    res = _run_bats(repo_root, "tests/spec/mishap-bundle-infra-testspec-ci.bats")
    assert res.returncode == 0, f"tests/spec/mishap-bundle-infra-testspec-ci.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_ci_test_agentlock_spec(repo_root: Path):
    """Executes tests/spec/mishap-bundle/ci-test-agentlock.bats."""
    res = _run_bats(repo_root, "tests/spec/mishap-bundle/ci-test-agentlock.bats")
    assert res.returncode == 0, f"tests/spec/mishap-bundle/ci-test-agentlock.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_mishap_categorize_erden_spec(repo_root: Path):
    """Executes tests/spec/mishap-categorize-erden.bats."""
    res = _run_bats(repo_root, "tests/spec/mishap-categorize-erden.bats")
    assert res.returncode == 0, f"tests/spec/mishap-categorize-erden.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_mishap_t002422_spec(repo_root: Path):
    """Executes tests/spec/mishap-t002422.bats."""
    res = _run_bats(repo_root, "tests/spec/mishap-t002422.bats")
    assert res.returncode == 0, f"tests/spec/mishap-t002422.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_mishap_t002424_spec(repo_root: Path):
    """Executes tests/spec/mishap-t002424.bats."""
    res = _run_bats(repo_root, "tests/spec/mishap-t002424.bats")
    assert res.returncode == 0, f"tests/spec/mishap-t002424.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_dedupe_korpus_spec(repo_root: Path):
    """Executes tests/spec/mishap-tracking/dedupe-korpus.bats."""
    res = _run_bats(repo_root, "tests/spec/mishap-tracking/dedupe-korpus.bats")
    assert res.returncode == 0, f"tests/spec/mishap-tracking/dedupe-korpus.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_go_tests_registriert_spec(repo_root: Path):
    """Executes tests/spec/mishap-tracking/go-tests-registriert.bats."""
    res = _run_bats(repo_root, "tests/spec/mishap-tracking/go-tests-registriert.bats")
    assert res.returncode == 0, f"tests/spec/mishap-tracking/go-tests-registriert.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_monitoring_alerts_spec(repo_root: Path):
    """Executes tests/spec/monitoring-alerts.bats."""
    res = _run_bats(repo_root, "tests/spec/monitoring-alerts.bats")
    assert res.returncode == 0, f"tests/spec/monitoring-alerts.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_backup_alerting_spec(repo_root: Path):
    """Executes tests/spec/monitoring-alerts/backup-alerting.bats."""
    res = _run_bats(repo_root, "tests/spec/monitoring-alerts/backup-alerting.bats")
    assert res.returncode == 0, f"tests/spec/monitoring-alerts/backup-alerting.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_backup_recipient_daily_repeat_spec(repo_root: Path):
    """Executes tests/spec/monitoring-alerts/backup-recipient-daily-repeat.bats."""
    res = _run_bats(repo_root, "tests/spec/monitoring-alerts/backup-recipient-daily-repeat.bats")
    assert res.returncode == 0, f"tests/spec/monitoring-alerts/backup-recipient-daily-repeat.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_networks_registry_spec(repo_root: Path):
    """Executes tests/spec/network-address-plan/networks-registry.bats."""
    res = _run_bats(repo_root, "tests/spec/network-address-plan/networks-registry.bats")
    assert res.returncode == 0, f"tests/spec/network-address-plan/networks-registry.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_newsletter_system_spec(repo_root: Path):
    """Executes tests/spec/newsletter-system.bats."""
    res = _run_bats(repo_root, "tests/spec/newsletter-system.bats")
    assert res.returncode == 0, f"tests/spec/newsletter-system.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_nextcloud_integration_spec(repo_root: Path):
    """Executes tests/spec/nextcloud-integration.bats."""
    res = _run_bats(repo_root, "tests/spec/nextcloud-integration.bats")
    assert res.returncode == 0, f"tests/spec/nextcloud-integration.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_notify_reminders_spec(repo_root: Path):
    """Executes tests/spec/notify-reminders.bats."""
    res = _run_bats(repo_root, "tests/spec/notify-reminders.bats")
    assert res.returncode == 0, f"tests/spec/notify-reminders.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_omp_harness_spec(repo_root: Path):
    """Executes tests/spec/omp-harness.bats."""
    res = _run_bats(repo_root, "tests/spec/omp-harness.bats")
    assert res.returncode == 0, f"tests/spec/omp-harness.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_openclaw_harness_spec(repo_root: Path):
    """Executes tests/spec/openclaw-harness.bats."""
    res = _run_bats(repo_root, "tests/spec/openclaw-harness.bats")
    assert res.returncode == 0, f"tests/spec/openclaw-harness.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_openclaw_ops_bot_spec(repo_root: Path):
    """Executes tests/spec/openclaw-ops-bot.bats."""
    res = _run_bats(repo_root, "tests/spec/openclaw-ops-bot.bats")
    assert res.returncode == 0, f"tests/spec/openclaw-ops-bot.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_opencode_config_ssot_spec(repo_root: Path):
    """Executes tests/spec/opencode-config-ssot.bats."""
    res = _run_bats(repo_root, "tests/spec/opencode-config-ssot.bats")
    assert res.returncode == 0, f"tests/spec/opencode-config-ssot.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_opencode_local_model_runner_spec(repo_root: Path):
    """Executes tests/spec/opencode-local-model-runner.bats."""
    res = _run_bats(repo_root, "tests/spec/opencode-local-model-runner.bats")
    assert res.returncode == 0, f"tests/spec/opencode-local-model-runner.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_os_retirement_code_spec(repo_root: Path):
    """Executes tests/spec/os-retirement-code.bats."""
    res = _run_bats(repo_root, "tests/spec/os-retirement-code.bats")
    assert res.returncode == 0, f"tests/spec/os-retirement-code.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_os_retirement_dir_spec(repo_root: Path):
    """Executes tests/spec/os-retirement-dir.bats."""
    res = _run_bats(repo_root, "tests/spec/os-retirement-dir.bats")
    assert res.returncode == 0, f"tests/spec/os-retirement-dir.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_os_retirement_prose_spec(repo_root: Path):
    """Executes tests/spec/os-retirement-prose.bats."""
    res = _run_bats(repo_root, "tests/spec/os-retirement-prose.bats")
    assert res.returncode == 0, f"tests/spec/os-retirement-prose.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_p0min_freeze_embed_spec(repo_root: Path):
    """Executes tests/spec/p0min-freeze-embed.bats."""
    res = _run_bats(repo_root, "tests/spec/p0min-freeze-embed.bats")
    assert res.returncode == 0, f"tests/spec/p0min-freeze-embed.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_pipeline_interface_spec(repo_root: Path):
    """Executes tests/spec/pipeline-interface.bats."""
    res = _run_bats(repo_root, "tests/spec/pipeline-interface.bats")
    assert res.returncode == 0, f"tests/spec/pipeline-interface.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_plan_context_spec(repo_root: Path):
    """Executes tests/spec/plan-context.bats."""
    res = _run_bats(repo_root, "tests/spec/plan-context.bats")
    assert res.returncode == 0, f"tests/spec/plan-context.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_plan_lifecycle_spec(repo_root: Path):
    """Executes tests/spec/plan-lifecycle.bats."""
    res = _run_bats(repo_root, "tests/spec/plan-lifecycle.bats")
    assert res.returncode == 0, f"tests/spec/plan-lifecycle.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_size_gate_spec(repo_root: Path):
    """Executes tests/spec/plan-partials-embedding/size-gate.bats."""
    res = _run_bats(repo_root, "tests/spec/plan-partials-embedding/size-gate.bats")
    assert res.returncode == 0, f"tests/spec/plan-partials-embedding/size-gate.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_epic_lastenheft_spec(repo_root: Path):
    """Executes tests/spec/planning-office/epic-lastenheft.bats."""
    res = _run_bats(repo_root, "tests/spec/planning-office/epic-lastenheft.bats")
    assert res.returncode == 0, f"tests/spec/planning-office/epic-lastenheft.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_pocket_id_client_seed_auth_header_spec(repo_root: Path):
    """Executes tests/spec/pocket-id-client-seed-auth-header.bats."""
    res = _run_bats(repo_root, "tests/spec/pocket-id-client-seed-auth-header.bats")
    assert res.returncode == 0, f"tests/spec/pocket-id-client-seed-auth-header.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_pocket_id_client_seed_early_abort_spec(repo_root: Path):
    """Executes tests/spec/pocket-id-client-seed-early-abort.bats."""
    res = _run_bats(repo_root, "tests/spec/pocket-id-client-seed-early-abort.bats")
    assert res.returncode == 0, f"tests/spec/pocket-id-client-seed-early-abort.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_pocket_id_client_seed_group_lookup_spec(repo_root: Path):
    """Executes tests/spec/pocket-id-client-seed-group-lookup.bats."""
    res = _run_bats(repo_root, "tests/spec/pocket-id-client-seed-group-lookup.bats")
    assert res.returncode == 0, f"tests/spec/pocket-id-client-seed-group-lookup.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_pocket_id_client_seed_pagination_spec(repo_root: Path):
    """Executes tests/spec/pocket-id-client-seed-pagination.bats."""
    res = _run_bats(repo_root, "tests/spec/pocket-id-client-seed-pagination.bats")
    assert res.returncode == 0, f"tests/spec/pocket-id-client-seed-pagination.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_pocket_id_client_seed_secret_writeback_spec(repo_root: Path):
    """Executes tests/spec/pocket-id-client-seed-secret-writeback.bats."""
    res = _run_bats(repo_root, "tests/spec/pocket-id-client-seed-secret-writeback.bats")
    assert res.returncode == 0, f"tests/spec/pocket-id-client-seed-secret-writeback.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_pocket_id_client_seed_skip_secret_spec(repo_root: Path):
    """Executes tests/spec/pocket-id-client-seed-skip-secret.bats."""
    res = _run_bats(repo_root, "tests/spec/pocket-id-client-seed-skip-secret.bats")
    assert res.returncode == 0, f"tests/spec/pocket-id-client-seed-skip-secret.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_pocket_id_client_seed_timeout_spec(repo_root: Path):
    """Executes tests/spec/pocket-id-client-seed-timeout.bats."""
    res = _run_bats(repo_root, "tests/spec/pocket-id-client-seed-timeout.bats")
    assert res.returncode == 0, f"tests/spec/pocket-id-client-seed-timeout.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_client_seed_service_endpoint_isolation_spec(repo_root: Path):
    """Executes tests/spec/pocket-id-seed-label-isolation/client-seed-service-endpoint-isolation.bats."""
    res = _run_bats(repo_root, "tests/spec/pocket-id-seed-label-isolation/client-seed-service-endpoint-isolation.bats")
    assert res.returncode == 0, f"tests/spec/pocket-id-seed-label-isolation/client-seed-service-endpoint-isolation.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_pr_refresh_spec(repo_root: Path):
    """Executes tests/spec/pr-refresh.bats."""
    res = _run_bats(repo_root, "tests/spec/pr-refresh.bats")
    assert res.returncode == 0, f"tests/spec/pr-refresh.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_pre_commit_freshness_spec(repo_root: Path):
    """Executes tests/spec/pre-commit-freshness.bats."""
    res = _run_bats(repo_root, "tests/spec/pre-commit-freshness.bats")
    assert res.returncode == 0, f"tests/spec/pre-commit-freshness.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_primary_agents_omo_spec(repo_root: Path):
    """Executes tests/spec/primary-agents-omo.bats."""
    res = _run_bats(repo_root, "tests/spec/primary-agents-omo.bats")
    assert res.returncode == 0, f"tests/spec/primary-agents-omo.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_public_symlinks_resolve_in_image_spec(repo_root: Path):
    """Executes tests/spec/public-symlinks-resolve-in-image.bats."""
    res = _run_bats(repo_root, "tests/spec/public-symlinks-resolve-in-image.bats")
    assert res.returncode == 0, f"tests/spec/public-symlinks-resolve-in-image.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_questionnaire_system_spec(repo_root: Path):
    """Executes tests/spec/questionnaire-system.bats."""
    res = _run_bats(repo_root, "tests/spec/questionnaire-system.bats")
    assert res.returncode == 0, f"tests/spec/questionnaire-system.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_qwen35_worker_modes_spec(repo_root: Path):
    """Executes tests/spec/qwen35-worker-modes.bats."""
    res = _run_bats(repo_root, "tests/spec/qwen35-worker-modes.bats")
    assert res.returncode == 0, f"tests/spec/qwen35-worker-modes.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_react_homepage_blocks_spec(repo_root: Path):
    """Executes tests/spec/react-homepage-blocks.bats."""
    res = _run_bats(repo_root, "tests/spec/react-homepage-blocks.bats")
    assert res.returncode == 0, f"tests/spec/react-homepage-blocks.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_react_login_edit_homepage_spec(repo_root: Path):
    """Executes tests/spec/react-login-edit-homepage.bats."""
    res = _run_bats(repo_root, "tests/spec/react-login-edit-homepage.bats")
    assert res.returncode == 0, f"tests/spec/react-login-edit-homepage.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_release_notes_erden_spec(repo_root: Path):
    """Executes tests/spec/release-notes-erden.bats."""
    res = _run_bats(repo_root, "tests/spec/release-notes-erden.bats")
    assert res.returncode == 0, f"tests/spec/release-notes-erden.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_repo_health_goals_spec(repo_root: Path):
    """Executes tests/spec/repo-health-goals.bats."""
    res = _run_bats(repo_root, "tests/spec/repo-health-goals.bats")
    assert res.returncode == 0, f"tests/spec/repo-health-goals.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_routing_check_freetoken_spec(repo_root: Path):
    """Executes tests/spec/routing-check-freetoken.bats."""
    res = _run_bats(repo_root, "tests/spec/routing-check-freetoken.bats")
    assert res.returncode == 0, f"tests/spec/routing-check-freetoken.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_wrapper_guards_spec(repo_root: Path):
    """Executes tests/spec/runner/wrapper-guards.bats."""
    res = _run_bats(repo_root, "tests/spec/runner/wrapper-guards.bats")
    assert res.returncode == 0, f"tests/spec/runner/wrapper-guards.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_rustdesk_server_spec(repo_root: Path):
    """Executes tests/spec/rustdesk-server.bats."""
    res = _run_bats(repo_root, "tests/spec/rustdesk-server.bats")
    assert res.returncode == 0, f"tests/spec/rustdesk-server.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_on_demand_lifecycle_spec(repo_root: Path):
    """Executes tests/spec/rustdesk-server/on-demand-lifecycle.bats."""
    res = _run_bats(repo_root, "tests/spec/rustdesk-server/on-demand-lifecycle.bats")
    assert res.returncode == 0, f"tests/spec/rustdesk-server/on-demand-lifecycle.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_s1_violations_batch2_spec(repo_root: Path):
    """Executes tests/spec/s1-violations-batch2.bats."""
    res = _run_bats(repo_root, "tests/spec/s1-violations-batch2.bats")
    assert res.returncode == 0, f"tests/spec/s1-violations-batch2.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_s1_violations_spec(repo_root: Path):
    """Executes tests/spec/s1-violations.bats."""
    res = _run_bats(repo_root, "tests/spec/s1-violations.bats")
    assert res.returncode == 0, f"tests/spec/s1-violations.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_s2_cycles_g_cq07_spec(repo_root: Path):
    """Executes tests/spec/s2-cycles-g-cq07.bats."""
    res = _run_bats(repo_root, "tests/spec/s2-cycles-g-cq07.bats")
    assert res.returncode == 0, f"tests/spec/s2-cycles-g-cq07.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_agent_lock_stale_holder_spec(repo_root: Path):
    """Executes tests/spec/scripts/agent-lock-stale-holder.bats."""
    res = _run_bats(repo_root, "tests/spec/scripts/agent-lock-stale-holder.bats")
    assert res.returncode == 0, f"tests/spec/scripts/agent-lock-stale-holder.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_check_worktree_live_no_env_spec(repo_root: Path):
    """Executes tests/spec/scripts/check-worktree-live-no-env.bats."""
    res = _run_bats(repo_root, "tests/spec/scripts/check-worktree-live-no-env.bats")
    assert res.returncode == 0, f"tests/spec/scripts/check-worktree-live-no-env.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_wip_finish_spec(repo_root: Path):
    """Executes tests/spec/scripts/wip-finish.bats."""
    res = _run_bats(repo_root, "tests/spec/scripts/wip-finish.bats")
    assert res.returncode == 0, f"tests/spec/scripts/wip-finish.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_wip_glance_spec(repo_root: Path):
    """Executes tests/spec/scripts/wip-glance.bats."""
    res = _run_bats(repo_root, "tests/spec/scripts/wip-glance.bats")
    assert res.returncode == 0, f"tests/spec/scripts/wip-glance.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_worktree_list_spec(repo_root: Path):
    """Executes tests/spec/scripts/worktree-list.bats."""
    res = _run_bats(repo_root, "tests/spec/scripts/worktree-list.bats")
    assert res.returncode == 0, f"tests/spec/scripts/worktree-list.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_dev_admin_session_guards_spec(repo_root: Path):
    """Executes tests/spec/sdlc/dev-admin-session-guards.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc/dev-admin-session-guards.bats")
    assert res.returncode == 0, f"tests/spec/sdlc/dev-admin-session-guards.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_sealed_secret_cluster_drift_spec(repo_root: Path):
    """Executes tests/spec/sealed-secret-cluster-drift.bats."""
    res = _run_bats(repo_root, "tests/spec/sealed-secret-cluster-drift.bats")
    assert res.returncode == 0, f"tests/spec/sealed-secret-cluster-drift.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_secret_rotation_exposure_spec(repo_root: Path):
    """Executes tests/spec/secret-rotation-exposure.bats."""
    res = _run_bats(repo_root, "tests/spec/secret-rotation-exposure.bats")
    assert res.returncode == 0, f"tests/spec/secret-rotation-exposure.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_schema_dev_secrets_sync_spec(repo_root: Path):
    """Executes tests/spec/secrets-deploy-automation/schema-dev-secrets-sync.bats."""
    res = _run_bats(repo_root, "tests/spec/secrets-deploy-automation/schema-dev-secrets-sync.bats")
    assert res.returncode == 0, f"tests/spec/secrets-deploy-automation/schema-dev-secrets-sync.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_security_spec(repo_root: Path):
    """Executes tests/spec/security.bats."""
    res = _run_bats(repo_root, "tests/spec/security.bats")
    assert res.returncode == 0, f"tests/spec/security.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_dead_selections_spec(repo_root: Path):
    """Executes tests/spec/selection-integrity/dead-selections.bats."""
    res = _run_bats(repo_root, "tests/spec/selection-integrity/dead-selections.bats")
    assert res.returncode == 0, f"tests/spec/selection-integrity/dead-selections.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_services_calendar_spec(repo_root: Path):
    """Executes tests/spec/services-calendar.bats."""
    res = _run_bats(repo_root, "tests/spec/services-calendar.bats")
    assert res.returncode == 0, f"tests/spec/services-calendar.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_sessions_server_spec(repo_root: Path):
    """Executes tests/spec/sessions-server.bats."""
    res = _run_bats(repo_root, "tests/spec/sessions-server.bats")
    assert res.returncode == 0, f"tests/spec/sessions-server.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_sf_retirement_rest_spec(repo_root: Path):
    """Executes tests/spec/sf-retirement-rest.bats."""
    res = _run_bats(repo_root, "tests/spec/sf-retirement-rest.bats")
    assert res.returncode == 0, f"tests/spec/sf-retirement-rest.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_sf_retirement_web_spec(repo_root: Path):
    """Executes tests/spec/sf-retirement-web.bats."""
    res = _run_bats(repo_root, "tests/spec/sf-retirement-web.bats")
    assert res.returncode == 0, f"tests/spec/sf-retirement-web.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_sidekick_assistant_spec(repo_root: Path):
    """Executes tests/spec/sidekick-assistant.bats."""
    res = _run_bats(repo_root, "tests/spec/sidekick-assistant.bats")
    assert res.returncode == 0, f"tests/spec/sidekick-assistant.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_staging_stack_repair_spec(repo_root: Path):
    """Executes tests/spec/staging-stack-repair.bats."""
    res = _run_bats(repo_root, "tests/spec/staging-stack-repair.bats")
    assert res.returncode == 0, f"tests/spec/staging-stack-repair.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_studio_sessions_reorganize_spec(repo_root: Path):
    """Executes tests/spec/studio-sessions-reorganize.bats."""
    res = _run_bats(repo_root, "tests/spec/studio-sessions-reorganize.bats")
    assert res.returncode == 0, f"tests/spec/studio-sessions-reorganize.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_unit_install_copy_guard_spec(repo_root: Path):
    """Executes tests/spec/systemd-units/unit-install-copy-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/systemd-units/unit-install-copy-guard.bats")
    assert res.returncode == 0, f"tests/spec/systemd-units/unit-install-copy-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_t001269_mishap_bundle_skills_dev_flow_execute_repo_worktree_state_ticket_mcp_spec(repo_root: Path):
    """Executes tests/spec/t001269-mishap-bundle-skills-dev-flow-execute-repo-worktree-state-ticket-mcp.bats."""
    res = _run_bats(repo_root, "tests/spec/t001269-mishap-bundle-skills-dev-flow-execute-repo-worktree-state-ticket-mcp.bats")
    assert res.returncode == 0, f"tests/spec/t001269-mishap-bundle-skills-dev-flow-execute-repo-worktree-state-ticket-mcp.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_t001353_mishap_bundle_ci_tickets_spec(repo_root: Path):
    """Executes tests/spec/t001353-mishap-bundle-ci-tickets.bats."""
    res = _run_bats(repo_root, "tests/spec/t001353-mishap-bundle-ci-tickets.bats")
    assert res.returncode == 0, f"tests/spec/t001353-mishap-bundle-ci-tickets.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_t001356_git02_conventional_commit_spec(repo_root: Path):
    """Executes tests/spec/t001356-git02-conventional-commit.bats."""
    res = _run_bats(repo_root, "tests/spec/t001356-git02-conventional-commit.bats")
    assert res.returncode == 0, f"tests/spec/t001356-git02-conventional-commit.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_t001363_mishap_bundle_spec(repo_root: Path):
    """Executes tests/spec/t001363-mishap-bundle.bats."""
    res = _run_bats(repo_root, "tests/spec/t001363-mishap-bundle.bats")
    assert res.returncode == 0, f"tests/spec/t001363-mishap-bundle.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_t001408_mishap_bundle_spec(repo_root: Path):
    """Executes tests/spec/t001408-mishap-bundle.bats."""
    res = _run_bats(repo_root, "tests/spec/t001408-mishap-bundle.bats")
    assert res.returncode == 0, f"tests/spec/t001408-mishap-bundle.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_t001582_mishap_bundle_spec(repo_root: Path):
    """Executes tests/spec/t001582-mishap-bundle.bats."""
    res = _run_bats(repo_root, "tests/spec/t001582-mishap-bundle.bats")
    assert res.returncode == 0, f"tests/spec/t001582-mishap-bundle.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_t001586_spec(repo_root: Path):
    """Executes tests/spec/t001586.bats."""
    res = _run_bats(repo_root, "tests/spec/t001586.bats")
    assert res.returncode == 0, f"tests/spec/t001586.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_t001591_spec(repo_root: Path):
    """Executes tests/spec/t001591.bats."""
    res = _run_bats(repo_root, "tests/spec/t001591.bats")
    assert res.returncode == 0, f"tests/spec/t001591.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_t002204_mishap_bundle_spec(repo_root: Path):
    """Executes tests/spec/t002204-mishap-bundle.bats."""
    res = _run_bats(repo_root, "tests/spec/t002204-mishap-bundle.bats")
    assert res.returncode == 0, f"tests/spec/t002204-mishap-bundle.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_t002374_mishap_bundle_spec(repo_root: Path):
    """Executes tests/spec/t002374-mishap-bundle.bats."""
    res = _run_bats(repo_root, "tests/spec/t002374-mishap-bundle.bats")
    assert res.returncode == 0, f"tests/spec/t002374-mishap-bundle.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_terminal_sidekick_spec(repo_root: Path):
    """Executes tests/spec/terminal-sidekick.bats."""
    res = _run_bats(repo_root, "tests/spec/terminal-sidekick.bats")
    assert res.returncode == 0, f"tests/spec/terminal-sidekick.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_ticket_mcp_spec(repo_root: Path):
    """Executes tests/spec/ticket-mcp.bats."""
    res = _run_bats(repo_root, "tests/spec/ticket-mcp.bats")
    assert res.returncode == 0, f"tests/spec/ticket-mcp.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_ticket_ops_claim_phase_a_T004602_spec(repo_root: Path):
    """Executes tests/spec/ticket-ops-claim-phase-a-T004602.bats."""
    res = _run_bats(repo_root, "tests/spec/ticket-ops-claim-phase-a-T004602.bats")
    assert res.returncode == 0, f"tests/spec/ticket-ops-claim-phase-a-T004602.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_seq_repair_spec(repo_root: Path):
    """Executes tests/spec/ticket-seq-integrity/seq-repair.bats."""
    res = _run_bats(repo_root, "tests/spec/ticket-seq-integrity/seq-repair.bats")
    assert res.returncode == 0, f"tests/spec/ticket-seq-integrity/seq-repair.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_ticket_system_spec(repo_root: Path):
    """Executes tests/spec/ticket-system.bats."""
    res = _run_bats(repo_root, "tests/spec/ticket-system.bats")
    assert res.returncode == 0, f"tests/spec/ticket-system.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_traefik_access_log_spec(repo_root: Path):
    """Executes tests/spec/traefik-access-log.bats."""
    res = _run_bats(repo_root, "tests/spec/traefik-access-log.bats")
    assert res.returncode == 0, f"tests/spec/traefik-access-log.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_ts_suppression_spec(repo_root: Path):
    """Executes tests/spec/ts-suppression.bats."""
    res = _run_bats(repo_root, "tests/spec/ts-suppression.bats")
    assert res.returncode == 0, f"tests/spec/ts-suppression.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_vaultwarden_integration_spec(repo_root: Path):
    """Executes tests/spec/vaultwarden-integration.bats."""
    res = _run_bats(repo_root, "tests/spec/vaultwarden-integration.bats")
    assert res.returncode == 0, f"tests/spec/vaultwarden-integration.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_context_status_spec(repo_root: Path):
    """Executes tests/spec/vim-ai-completion/context-status.bats."""
    res = _run_bats(repo_root, "tests/spec/vim-ai-completion/context-status.bats")
    assert res.returncode == 0, f"tests/spec/vim-ai-completion/context-status.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_install_config_spec(repo_root: Path):
    """Executes tests/spec/vim-ai-completion/install-config.bats."""
    res = _run_bats(repo_root, "tests/spec/vim-ai-completion/install-config.bats")
    assert res.returncode == 0, f"tests/spec/vim-ai-completion/install-config.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_request_stream_spec(repo_root: Path):
    """Executes tests/spec/vim-ai-completion/request-stream.bats."""
    res = _run_bats(repo_root, "tests/spec/vim-ai-completion/request-stream.bats")
    assert res.returncode == 0, f"tests/spec/vim-ai-completion/request-stream.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_config_guards_spec(repo_root: Path):
    """Executes tests/spec/warden-mcp/config-guards.bats."""
    res = _run_bats(repo_root, "tests/spec/warden-mcp/config-guards.bats")
    assert res.returncode == 0, f"tests/spec/warden-mcp/config-guards.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_launcher_spec(repo_root: Path):
    """Executes tests/spec/warden-mcp/launcher.bats."""
    res = _run_bats(repo_root, "tests/spec/warden-mcp/launcher.bats")
    assert res.returncode == 0, f"tests/spec/warden-mcp/launcher.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_workspace_deploy_secrets_scope_spec(repo_root: Path):
    """Executes tests/spec/workspace-deploy-secrets-scope.bats."""
    res = _run_bats(repo_root, "tests/spec/workspace-deploy-secrets-scope.bats")
    assert res.returncode == 0, f"tests/spec/workspace-deploy-secrets-scope.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_workspace_deploy_spec(repo_root: Path):
    """Executes tests/spec/workspace-deploy.bats."""
    res = _run_bats(repo_root, "tests/spec/workspace-deploy.bats")
    assert res.returncode == 0, f"tests/spec/workspace-deploy.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_flux_secrets_ordering_spec(repo_root: Path):
    """Executes tests/spec/workspace-deploy/flux-secrets-ordering.bats."""
    res = _run_bats(repo_root, "tests/spec/workspace-deploy/flux-secrets-ordering.bats")
    assert res.returncode == 0, f"tests/spec/workspace-deploy/flux-secrets-ordering.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_ntfy_token_escaping_T900059_spec(repo_root: Path):
    """Executes tests/spec/workspace-deploy/ntfy-token-escaping-T900059.bats."""
    res = _run_bats(repo_root, "tests/spec/workspace-deploy/ntfy-token-escaping-T900059.bats")
    assert res.returncode == 0, f"tests/spec/workspace-deploy/ntfy-token-escaping-T900059.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_workspace_foundation_spec(repo_root: Path):
    """Executes tests/spec/workspace-foundation.bats."""
    res = _run_bats(repo_root, "tests/spec/workspace-foundation.bats")
    assert res.returncode == 0, f"tests/spec/workspace-foundation.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_workspace_staging_db_tables_spec(repo_root: Path):
    """Executes tests/spec/workspace-staging-db-tables.bats."""
    res = _run_bats(repo_root, "tests/spec/workspace-staging-db-tables.bats")
    assert res.returncode == 0, f"tests/spec/workspace-staging-db-tables.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_assign_identity_spec(repo_root: Path):
    """Executes tests/spec/workstation-cluster-iso/assign-identity.bats."""
    res = _run_bats(repo_root, "tests/spec/workstation-cluster-iso/assign-identity.bats")
    assert res.returncode == 0, f"tests/spec/workstation-cluster-iso/assign-identity.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_build_node_iso_guards_spec(repo_root: Path):
    """Executes tests/spec/workstation-cluster-iso/build-node-iso-guards.bats."""
    res = _run_bats(repo_root, "tests/spec/workstation-cluster-iso/build-node-iso-guards.bats")
    assert res.returncode == 0, f"tests/spec/workstation-cluster-iso/build-node-iso-guards.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_k3s_join_guards_spec(repo_root: Path):
    """Executes tests/spec/workstation-cluster-iso/k3s-join-guards.bats."""
    res = _run_bats(repo_root, "tests/spec/workstation-cluster-iso/k3s-join-guards.bats")
    assert res.returncode == 0, f"tests/spec/workstation-cluster-iso/k3s-join-guards.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_setup_pxe_guards_spec(repo_root: Path):
    """Executes tests/spec/workstation-cluster-pxe/setup-pxe-guards.bats."""
    res = _run_bats(repo_root, "tests/spec/workstation-cluster-pxe/setup-pxe-guards.bats")
    assert res.returncode == 0, f"tests/spec/workstation-cluster-pxe/setup-pxe-guards.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_worktree_create_real_path_T004604_spec(repo_root: Path):
    """Executes tests/spec/worktree-create-real-path-T004604.bats."""
    res = _run_bats(repo_root, "tests/spec/worktree-create-real-path-T004604.bats")
    assert res.returncode == 0, f"tests/spec/worktree-create-real-path-T004604.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_worktree_cross_platform_spec(repo_root: Path):
    """Executes tests/spec/worktree-cross-platform.bats."""
    res = _run_bats(repo_root, "tests/spec/worktree-cross-platform.bats")
    assert res.returncode == 0, f"tests/spec/worktree-cross-platform.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_worktree_divergence_guard_T002387_spec(repo_root: Path):
    """Executes tests/spec/worktree-divergence-guard-T002387.bats."""
    res = _run_bats(repo_root, "tests/spec/worktree-divergence-guard-T002387.bats")
    assert res.returncode == 0, f"tests/spec/worktree-divergence-guard-T002387.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_main_sync_optout_spec(repo_root: Path):
    """Executes tests/spec/worktree-divergence-guard/main-sync-optout.bats."""
    res = _run_bats(repo_root, "tests/spec/worktree-divergence-guard/main-sync-optout.bats")
    assert res.returncode == 0, f"tests/spec/worktree-divergence-guard/main-sync-optout.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_stash_restore_visible_spec(repo_root: Path):
    """Executes tests/spec/worktree-divergence-guard/stash-restore-visible.bats."""
    res = _run_bats(repo_root, "tests/spec/worktree-divergence-guard/stash-restore-visible.bats")
    assert res.returncode == 0, f"tests/spec/worktree-divergence-guard/stash-restore-visible.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_worktree_gitdir_guard_spec(repo_root: Path):
    """Executes tests/spec/worktree-gitdir-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/worktree-gitdir-guard.bats")
    assert res.returncode == 0, f"tests/spec/worktree-gitdir-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_wsl_exit_docs_spec(repo_root: Path):
    """Executes tests/spec/wsl-exit-docs.bats."""
    res = _run_bats(repo_root, "tests/spec/wsl-exit-docs.bats")
    assert res.returncode == 0, f"tests/spec/wsl-exit-docs.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"
