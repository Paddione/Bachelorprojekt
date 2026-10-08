"""Tests migrating platform_and_infra specs to pytest (87 specs)."""

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

def test_agy_mcp_permissions_spec(repo_root: Path):
    """Executes tests/spec/mcp-gateway/agy-mcp-permissions.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-gateway/agy-mcp-permissions.bats")
    assert res.returncode == 0, f"tests/spec/mcp-gateway/agy-mcp-permissions.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_agy_token_expansion_spec(repo_root: Path):
    """Executes tests/spec/mcp-gateway/agy-token-expansion.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-gateway/agy-token-expansion.bats")
    assert res.returncode == 0, f"tests/spec/mcp-gateway/agy-token-expansion.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_authenticated_http_headers_isolation_spec(repo_root: Path):
    """Executes tests/spec/mcp-gateway/authenticated-http-headers-isolation.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-gateway/authenticated-http-headers-isolation.bats")
    assert res.returncode == 0, f"tests/spec/mcp-gateway/authenticated-http-headers-isolation.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_authenticated_http_headers_spec(repo_root: Path):
    """Executes tests/spec/mcp-gateway/authenticated-http-headers.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-gateway/authenticated-http-headers.bats")
    assert res.returncode == 0, f"tests/spec/mcp-gateway/authenticated-http-headers.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_bge_host_routing_spec(repo_root: Path):
    """Executes tests/spec/mcp-gateway/bge-host-routing.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-gateway/bge-host-routing.bats")
    assert res.returncode == 0, f"tests/spec/mcp-gateway/bge-host-routing.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_bge_http_only_get_spec(repo_root: Path):
    """Executes tests/spec/mcp-gateway/bge-http-only-get.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-gateway/bge-http-only-get.bats")
    assert res.returncode == 0, f"tests/spec/mcp-gateway/bge-http-only-get.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_bge_mcp_windows_esm_url_spec(repo_root: Path):
    """Executes tests/spec/mcp-gateway/bge-mcp-windows-esm-url.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-gateway/bge-mcp-windows-esm-url.bats")
    assert res.returncode == 0, f"tests/spec/mcp-gateway/bge-mcp-windows-esm-url.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_client_env_check_spec(repo_root: Path):
    """Executes tests/spec/mcp-gateway/client-env-check.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-gateway/client-env-check.bats")
    assert res.returncode == 0, f"tests/spec/mcp-gateway/client-env-check.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_dev_shell_ssh_spec(repo_root: Path):
    """Executes tests/spec/mcp-gateway/dev-shell-ssh.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-gateway/dev-shell-ssh.bats")
    assert res.returncode == 0, f"tests/spec/mcp-gateway/dev-shell-ssh.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_guarded_proxy_streaming_spec(repo_root: Path):
    """Executes tests/spec/mcp-gateway/guarded-proxy-streaming.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-gateway/guarded-proxy-streaming.bats")
    assert res.returncode == 0, f"tests/spec/mcp-gateway/guarded-proxy-streaming.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_http_security_boundary_spec(repo_root: Path):
    """Executes tests/spec/mcp-gateway/http-security-boundary.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-gateway/http-security-boundary.bats")
    assert res.returncode == 0, f"tests/spec/mcp-gateway/http-security-boundary.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_mcp_postgres_multistatement_spec(repo_root: Path):
    """Executes tests/spec/mcp-gateway/mcp-postgres-multistatement.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-gateway/mcp-postgres-multistatement.bats")
    assert res.returncode == 0, f"tests/spec/mcp-gateway/mcp-postgres-multistatement.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_mcp_postgres_readonly_role_spec(repo_root: Path):
    """Executes tests/spec/mcp-gateway/mcp-postgres-readonly-role.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-gateway/mcp-postgres-readonly-role.bats")
    assert res.returncode == 0, f"tests/spec/mcp-gateway/mcp-postgres-readonly-role.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_mcp_sync_drift_no_secret_leak_spec(repo_root: Path):
    """Executes tests/spec/mcp-gateway/mcp-sync-drift-no-secret-leak.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-gateway/mcp-sync-drift-no-secret-leak.bats")
    assert res.returncode == 0, f"tests/spec/mcp-gateway/mcp-sync-drift-no-secret-leak.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_mcp_sync_qwen_drift_no_secret_leak_spec(repo_root: Path):
    """Executes tests/spec/mcp-gateway/mcp-sync-qwen-drift-no-secret-leak.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-gateway/mcp-sync-qwen-drift-no-secret-leak.bats")
    assert res.returncode == 0, f"tests/spec/mcp-gateway/mcp-sync-qwen-drift-no-secret-leak.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_native_server_startup_token_spec(repo_root: Path):
    """Executes tests/spec/mcp-gateway/native-server-startup-token.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-gateway/native-server-startup-token.bats")
    assert res.returncode == 0, f"tests/spec/mcp-gateway/native-server-startup-token.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_node_mcp_server_startup_spec(repo_root: Path):
    """Executes tests/spec/mcp-gateway/node-mcp-server-startup.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-gateway/node-mcp-server-startup.bats")
    assert res.returncode == 0, f"tests/spec/mcp-gateway/node-mcp-server-startup.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_opencode_env_placeholder_spec(repo_root: Path):
    """Executes tests/spec/mcp-gateway/opencode-env-placeholder.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-gateway/opencode-env-placeholder.bats")
    assert res.returncode == 0, f"tests/spec/mcp-gateway/opencode-env-placeholder.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_qwen_token_expansion_spec(repo_root: Path):
    """Executes tests/spec/mcp-gateway/qwen-token-expansion.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-gateway/qwen-token-expansion.bats")
    assert res.returncode == 0, f"tests/spec/mcp-gateway/qwen-token-expansion.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_start_windows_unc_spec(repo_root: Path):
    """Executes tests/spec/mcp-gateway/start-windows-unc.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-gateway/start-windows-unc.bats")
    assert res.returncode == 0, f"tests/spec/mcp-gateway/start-windows-unc.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_token_drift_auto_sync_spec(repo_root: Path):
    """Executes tests/spec/mcp-gateway/token-drift-auto-sync.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-gateway/token-drift-auto-sync.bats")
    assert res.returncode == 0, f"tests/spec/mcp-gateway/token-drift-auto-sync.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_watchdog_tunnel_liveness_spec(repo_root: Path):
    """Executes tests/spec/mcp-gateway/watchdog-tunnel-liveness.bats."""
    res = _run_bats(repo_root, "tests/spec/mcp-gateway/watchdog-tunnel-liveness.bats")
    assert res.returncode == 0, f"tests/spec/mcp-gateway/watchdog-tunnel-liveness.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_dashboard_rescan_spec(repo_root: Path):
    """Executes tests/spec/health-goals/dashboard-rescan.bats."""
    res = _run_bats(repo_root, "tests/spec/health-goals/dashboard-rescan.bats")
    assert res.returncode == 0, f"tests/spec/health-goals/dashboard-rescan.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_g_git03_spec(repo_root: Path):
    """Executes tests/spec/health-goals/g-git03.bats."""
    res = _run_bats(repo_root, "tests/spec/health-goals/g-git03.bats")
    assert res.returncode == 0, f"tests/spec/health-goals/g-git03.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_goal_integrity_spec(repo_root: Path):
    """Executes tests/spec/health-goals/goal-integrity.bats."""
    res = _run_bats(repo_root, "tests/spec/health-goals/goal-integrity.bats")
    assert res.returncode == 0, f"tests/spec/health-goals/goal-integrity.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_goals_data_path_consistency_spec(repo_root: Path):
    """Executes tests/spec/health-goals/goals-data-path-consistency.bats."""
    res = _run_bats(repo_root, "tests/spec/health-goals/goals-data-path-consistency.bats")
    assert res.returncode == 0, f"tests/spec/health-goals/goals-data-path-consistency.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_goals_data_sdlc_target_spec(repo_root: Path):
    """Executes tests/spec/health-goals/goals-data-sdlc-target.bats."""
    res = _run_bats(repo_root, "tests/spec/health-goals/goals-data-sdlc-target.bats")
    assert res.returncode == 0, f"tests/spec/health-goals/goals-data-sdlc-target.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_id_parity_spec(repo_root: Path):
    """Executes tests/spec/health-goals/id-parity.bats."""
    res = _run_bats(repo_root, "tests/spec/health-goals/id-parity.bats")
    assert res.returncode == 0, f"tests/spec/health-goals/id-parity.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_knowledge_goals_spec(repo_root: Path):
    """Executes tests/spec/health-goals/knowledge-goals.bats."""
    res = _run_bats(repo_root, "tests/spec/health-goals/knowledge-goals.bats")
    assert res.returncode == 0, f"tests/spec/health-goals/knowledge-goals.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_korczewski_brand_pause_spec(repo_root: Path):
    """Executes tests/spec/health-goals/korczewski-brand-pause.bats."""
    res = _run_bats(repo_root, "tests/spec/health-goals/korczewski-brand-pause.bats")
    assert res.returncode == 0, f"tests/spec/health-goals/korczewski-brand-pause.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_llm_stack_goals_spec(repo_root: Path):
    """Executes tests/spec/health-goals/llm-stack-goals.bats."""
    res = _run_bats(repo_root, "tests/spec/health-goals/llm-stack-goals.bats")
    assert res.returncode == 0, f"tests/spec/health-goals/llm-stack-goals.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_measured_at_field_spec(repo_root: Path):
    """Executes tests/spec/health-goals/measured-at-field.bats."""
    res = _run_bats(repo_root, "tests/spec/health-goals/measured-at-field.bats")
    assert res.returncode == 0, f"tests/spec/health-goals/measured-at-field.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_measurement_integrity_spec(repo_root: Path):
    """Executes tests/spec/health-goals/measurement-integrity.bats."""
    res = _run_bats(repo_root, "tests/spec/health-goals/measurement-integrity.bats")
    assert res.returncode == 0, f"tests/spec/health-goals/measurement-integrity.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_runtime_health_goals_spec(repo_root: Path):
    """Executes tests/spec/health-goals/runtime-health-goals.bats."""
    res = _run_bats(repo_root, "tests/spec/health-goals/runtime-health-goals.bats")
    assert res.returncode == 0, f"tests/spec/health-goals/runtime-health-goals.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_runtime_measure_execution_spec(repo_root: Path):
    """Executes tests/spec/health-goals/runtime-measure-execution.bats."""
    res = _run_bats(repo_root, "tests/spec/health-goals/runtime-measure-execution.bats")
    assert res.returncode == 0, f"tests/spec/health-goals/runtime-measure-execution.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_service_health_goals_spec(repo_root: Path):
    """Executes tests/spec/health-goals/service-health-goals.bats."""
    res = _run_bats(repo_root, "tests/spec/health-goals/service-health-goals.bats")
    assert res.returncode == 0, f"tests/spec/health-goals/service-health-goals.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_worktree_hygiene_goals_spec(repo_root: Path):
    """Executes tests/spec/health-goals/worktree-hygiene-goals.bats."""
    res = _run_bats(repo_root, "tests/spec/health-goals/worktree-hygiene-goals.bats")
    assert res.returncode == 0, f"tests/spec/health-goals/worktree-hygiene-goals.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_zielfamilien_audit_spec(repo_root: Path):
    """Executes tests/spec/health-goals/zielfamilien-audit.bats."""
    res = _run_bats(repo_root, "tests/spec/health-goals/zielfamilien-audit.bats")
    assert res.returncode == 0, f"tests/spec/health-goals/zielfamilien-audit.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_auto_sync_spec(repo_root: Path):
    """Executes tests/spec/application-pipeline/auto-sync.bats."""
    res = _run_bats(repo_root, "tests/spec/application-pipeline/auto-sync.bats")
    assert res.returncode == 0, f"tests/spec/application-pipeline/auto-sync.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_evidence_catalog_spec(repo_root: Path):
    """Executes tests/spec/application-pipeline/evidence-catalog.bats."""
    res = _run_bats(repo_root, "tests/spec/application-pipeline/evidence-catalog.bats")
    assert res.returncode == 0, f"tests/spec/application-pipeline/evidence-catalog.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_import_bootstrap_spec(repo_root: Path):
    """Executes tests/spec/application-pipeline/import-bootstrap.bats."""
    res = _run_bats(repo_root, "tests/spec/application-pipeline/import-bootstrap.bats")
    assert res.returncode == 0, f"tests/spec/application-pipeline/import-bootstrap.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_ingest_cli_spec(repo_root: Path):
    """Executes tests/spec/application-pipeline/ingest-cli.bats."""
    res = _run_bats(repo_root, "tests/spec/application-pipeline/ingest-cli.bats")
    assert res.returncode == 0, f"tests/spec/application-pipeline/ingest-cli.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_match_scoring_spec(repo_root: Path):
    """Executes tests/spec/application-pipeline/match-scoring.bats."""
    res = _run_bats(repo_root, "tests/spec/application-pipeline/match-scoring.bats")
    assert res.returncode == 0, f"tests/spec/application-pipeline/match-scoring.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_render_cli_spec(repo_root: Path):
    """Executes tests/spec/application-pipeline/render-cli.bats."""
    res = _run_bats(repo_root, "tests/spec/application-pipeline/render-cli.bats")
    assert res.returncode == 0, f"tests/spec/application-pipeline/render-cli.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_schema_spec(repo_root: Path):
    """Executes tests/spec/application-pipeline/schema.bats."""
    res = _run_bats(repo_root, "tests/spec/application-pipeline/schema.bats")
    assert res.returncode == 0, f"tests/spec/application-pipeline/schema.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_theme_validation_spec(repo_root: Path):
    """Executes tests/spec/application-pipeline/theme-validation.bats."""
    res = _run_bats(repo_root, "tests/spec/application-pipeline/theme-validation.bats")
    assert res.returncode == 0, f"tests/spec/application-pipeline/theme-validation.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_build_target_split_spec(repo_root: Path):
    """Executes tests/spec/sdlc-isolation/build-target-split.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-isolation/build-target-split.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-isolation/build-target-split.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_e2_local_stack_spec(repo_root: Path):
    """Executes tests/spec/sdlc-isolation/e2-local-stack.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-isolation/e2-local-stack.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-isolation/e2-local-stack.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_e3_backup_spec(repo_root: Path):
    """Executes tests/spec/sdlc-isolation/e3-backup.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-isolation/e3-backup.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-isolation/e3-backup.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_e3_tickets_lokal_spec(repo_root: Path):
    """Executes tests/spec/sdlc-isolation/e3-tickets-lokal.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-isolation/e3-tickets-lokal.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-isolation/e3-tickets-lokal.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_fleet_sequence_split_spec(repo_root: Path):
    """Executes tests/spec/sdlc-isolation/fleet-sequence-split.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-isolation/fleet-sequence-split.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-isolation/fleet-sequence-split.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_llm_up_health_spec(repo_root: Path):
    """Executes tests/spec/sdlc-isolation/llm-up-health.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-isolation/llm-up-health.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-isolation/llm-up-health.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_sdlc_default_loadout_spec(repo_root: Path):
    """Executes tests/spec/sdlc-isolation/sdlc-default-loadout.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-isolation/sdlc-default-loadout.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-isolation/sdlc-default-loadout.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_sdlc_up_command_spec(repo_root: Path):
    """Executes tests/spec/sdlc-isolation/sdlc-up-command.bats."""
    res = _run_bats(repo_root, "tests/spec/sdlc-isolation/sdlc-up-command.bats")
    assert res.returncode == 0, f"tests/spec/sdlc-isolation/sdlc-up-command.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_bats_missing_file_exit0_spec(repo_root: Path):
    """Executes tests/spec/e2e-test-infrastructure/bats-missing-file-exit0.bats."""
    res = _run_bats(repo_root, "tests/spec/e2e-test-infrastructure/bats-missing-file-exit0.bats")
    assert res.returncode == 0, f"tests/spec/e2e-test-infrastructure/bats-missing-file-exit0.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_bats_nonascii_testnames_spec(repo_root: Path):
    """Executes tests/spec/e2e-test-infrastructure/bats-nonascii-testnames.bats."""
    res = _run_bats(repo_root, "tests/spec/e2e-test-infrastructure/bats-nonascii-testnames.bats")
    assert res.returncode == 0, f"tests/spec/e2e-test-infrastructure/bats-nonascii-testnames.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_no_group_modifiers_spec(repo_root: Path):
    """Executes tests/spec/e2e-test-infrastructure/no-group-modifiers.bats."""
    res = _run_bats(repo_root, "tests/spec/e2e-test-infrastructure/no-group-modifiers.bats")
    assert res.returncode == 0, f"tests/spec/e2e-test-infrastructure/no-group-modifiers.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_no_wrong_reporoot_resolution_spec(repo_root: Path):
    """Executes tests/spec/e2e-test-infrastructure/no-wrong-reporoot-resolution.bats."""
    res = _run_bats(repo_root, "tests/spec/e2e-test-infrastructure/no-wrong-reporoot-resolution.bats")
    assert res.returncode == 0, f"tests/spec/e2e-test-infrastructure/no-wrong-reporoot-resolution.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_purge_fn_website_sync_spec(repo_root: Path):
    """Executes tests/spec/e2e-test-infrastructure/purge-fn-website-sync.bats."""
    res = _run_bats(repo_root, "tests/spec/e2e-test-infrastructure/purge-fn-website-sync.bats")
    assert res.returncode == 0, f"tests/spec/e2e-test-infrastructure/purge-fn-website-sync.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_purge_test_data_missing_table_spec(repo_root: Path):
    """Executes tests/spec/e2e-test-infrastructure/purge-test-data-missing-table.bats."""
    res = _run_bats(repo_root, "tests/spec/e2e-test-infrastructure/purge-test-data-missing-table.bats")
    assert res.returncode == 0, f"tests/spec/e2e-test-infrastructure/purge-test-data-missing-table.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_vision_sweep_spec(repo_root: Path):
    """Executes tests/spec/e2e-test-infrastructure/vision-sweep.bats."""
    res = _run_bats(repo_root, "tests/spec/e2e-test-infrastructure/vision-sweep.bats")
    assert res.returncode == 0, f"tests/spec/e2e-test-infrastructure/vision-sweep.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_dead_path_references_spec(repo_root: Path):
    """Executes tests/spec/repo-hygiene/dead-path-references.bats."""
    res = _run_bats(repo_root, "tests/spec/repo-hygiene/dead-path-references.bats")
    assert res.returncode == 0, f"tests/spec/repo-hygiene/dead-path-references.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_precheck_foreign_session_spec(repo_root: Path):
    """Executes tests/spec/repo-hygiene/precheck-foreign-session.bats."""
    res = _run_bats(repo_root, "tests/spec/repo-hygiene/precheck-foreign-session.bats")
    assert res.returncode == 0, f"tests/spec/repo-hygiene/precheck-foreign-session.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_signal_gaps_spec(repo_root: Path):
    """Executes tests/spec/repo-hygiene/signal-gaps.bats."""
    res = _run_bats(repo_root, "tests/spec/repo-hygiene/signal-gaps.bats")
    assert res.returncode == 0, f"tests/spec/repo-hygiene/signal-gaps.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_windows_guards_spec(repo_root: Path):
    """Executes tests/spec/repo-hygiene/windows-guards.bats."""
    res = _run_bats(repo_root, "tests/spec/repo-hygiene/windows-guards.bats")
    assert res.returncode == 0, f"tests/spec/repo-hygiene/windows-guards.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_worktree_clean_check_existence_spec(repo_root: Path):
    """Executes tests/spec/repo-hygiene/worktree-clean-check-existence.bats."""
    res = _run_bats(repo_root, "tests/spec/repo-hygiene/worktree-clean-check-existence.bats")
    assert res.returncode == 0, f"tests/spec/repo-hygiene/worktree-clean-check-existence.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_worktree_remove_generat_allowlist_spec(repo_root: Path):
    """Executes tests/spec/repo-hygiene/worktree-remove-generat-allowlist.bats."""
    res = _run_bats(repo_root, "tests/spec/repo-hygiene/worktree-remove-generat-allowlist.bats")
    assert res.returncode == 0, f"tests/spec/repo-hygiene/worktree-remove-generat-allowlist.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_worktree_stash_inspection_spec(repo_root: Path):
    """Executes tests/spec/repo-hygiene/worktree-stash-inspection.bats."""
    res = _run_bats(repo_root, "tests/spec/repo-hygiene/worktree-stash-inspection.bats")
    assert res.returncode == 0, f"tests/spec/repo-hygiene/worktree-stash-inspection.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_components_group_spec(repo_root: Path):
    """Executes tests/spec/repo-structure/components-group.bats."""
    res = _run_bats(repo_root, "tests/spec/repo-structure/components-group.bats")
    assert res.returncode == 0, f"tests/spec/repo-structure/components-group.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_inventory_registered_spec(repo_root: Path):
    """Executes tests/spec/repo-structure/inventory-registered.bats."""
    res = _run_bats(repo_root, "tests/spec/repo-structure/inventory-registered.bats")
    assert res.returncode == 0, f"tests/spec/repo-structure/inventory-registered.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_packages_assets_spec(repo_root: Path):
    """Executes tests/spec/repo-structure/packages-assets.bats."""
    res = _run_bats(repo_root, "tests/spec/repo-structure/packages-assets.bats")
    assert res.returncode == 0, f"tests/spec/repo-structure/packages-assets.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_release_please_paths_spec(repo_root: Path):
    """Executes tests/spec/repo-structure/release-please-paths.bats."""
    res = _run_bats(repo_root, "tests/spec/repo-structure/release-please-paths.bats")
    assert res.returncode == 0, f"tests/spec/repo-structure/release-please-paths.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_root_agent_md_spec(repo_root: Path):
    """Executes tests/spec/repo-structure/root-agent-md.bats."""
    res = _run_bats(repo_root, "tests/spec/repo-structure/root-agent-md.bats")
    assert res.returncode == 0, f"tests/spec/repo-structure/root-agent-md.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_spec_suite_website_leak_spec(repo_root: Path):
    """Executes tests/spec/repo-structure/spec-suite-website-leak.bats."""
    res = _run_bats(repo_root, "tests/spec/repo-structure/spec-suite-website-leak.bats")
    assert res.returncode == 0, f"tests/spec/repo-structure/spec-suite-website-leak.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_website_moved_spec(repo_root: Path):
    """Executes tests/spec/repo-structure/website-moved.bats."""
    res = _run_bats(repo_root, "tests/spec/repo-structure/website-moved.bats")
    assert res.returncode == 0, f"tests/spec/repo-structure/website-moved.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_alibaba_token_key_guard_spec(repo_root: Path):
    """Executes tests/spec/security/alibaba-token-key-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/security/alibaba-token-key-guard.bats")
    assert res.returncode == 0, f"tests/spec/security/alibaba-token-key-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_cluster_admin_audit_spec(repo_root: Path):
    """Executes tests/spec/security/cluster-admin-audit.bats."""
    res = _run_bats(repo_root, "tests/spec/security/cluster-admin-audit.bats")
    assert res.returncode == 0, f"tests/spec/security/cluster-admin-audit.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_githooks_installed_guard_spec(repo_root: Path):
    """Executes tests/spec/security/githooks-installed-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/security/githooks-installed-guard.bats")
    assert res.returncode == 0, f"tests/spec/security/githooks-installed-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_stray_secret_dump_guard_spec(repo_root: Path):
    """Executes tests/spec/security/stray-secret-dump-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/security/stray-secret-dump-guard.bats")
    assert res.returncode == 0, f"tests/spec/security/stray-secret-dump-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_website_clusterrole_least_privilege_spec(repo_root: Path):
    """Executes tests/spec/security/website-clusterrole-least-privilege.bats."""
    res = _run_bats(repo_root, "tests/spec/security/website-clusterrole-least-privilege.bats")
    assert res.returncode == 0, f"tests/spec/security/website-clusterrole-least-privilege.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_workload_exec_rbac_spec(repo_root: Path):
    """Executes tests/spec/security/workload-exec-rbac.bats."""
    res = _run_bats(repo_root, "tests/spec/security/workload-exec-rbac.bats")
    assert res.returncode == 0, f"tests/spec/security/workload-exec-rbac.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_deregister_reap_spec(repo_root: Path):
    """Executes tests/spec/sessions-server/deregister-reap.bats."""
    res = _run_bats(repo_root, "tests/spec/sessions-server/deregister-reap.bats")
    assert res.returncode == 0, f"tests/spec/sessions-server/deregister-reap.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_domain_config_spec(repo_root: Path):
    """Executes tests/spec/sessions-server/domain-config.bats."""
    res = _run_bats(repo_root, "tests/spec/sessions-server/domain-config.bats")
    assert res.returncode == 0, f"tests/spec/sessions-server/domain-config.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_form_lifecycle_spec(repo_root: Path):
    """Executes tests/spec/sessions-server/form-lifecycle.bats."""
    res = _run_bats(repo_root, "tests/spec/sessions-server/form-lifecycle.bats")
    assert res.returncode == 0, f"tests/spec/sessions-server/form-lifecycle.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_reap_untracked_spec(repo_root: Path):
    """Executes tests/spec/sessions-server/reap-untracked.bats."""
    res = _run_bats(repo_root, "tests/spec/sessions-server/reap-untracked.bats")
    assert res.returncode == 0, f"tests/spec/sessions-server/reap-untracked.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_register_list_spec(repo_root: Path):
    """Executes tests/spec/sessions-server/register-list.bats."""
    res = _run_bats(repo_root, "tests/spec/sessions-server/register-list.bats")
    assert res.returncode == 0, f"tests/spec/sessions-server/register-list.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_wildcard_render_guard_spec(repo_root: Path):
    """Executes tests/spec/sessions-server/wildcard-render-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/sessions-server/wildcard-render-guard.bats")
    assert res.returncode == 0, f"tests/spec/sessions-server/wildcard-render-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"
