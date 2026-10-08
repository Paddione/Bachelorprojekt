"""Tests migrating local_llm_and_mesh specs to pytest (85 specs)."""

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

def test_bge_chain_order_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/bge-chain-order.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/bge-chain-order.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/bge-chain-order.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_bge_cpu_parallel_start_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/bge-cpu-parallel-start.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/bge-cpu-parallel-start.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/bge-cpu-parallel-start.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_bge_loadout_cpu_bound_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/bge-loadout-cpu-bound.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/bge-loadout-cpu-bound.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/bge-loadout-cpu-bound.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_bge_mcp_upstream_timeout_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/bge-mcp-upstream-timeout.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/bge-mcp-upstream-timeout.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/bge-mcp-upstream-timeout.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_bge_no_probe_import_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/bge-no-probe-import.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/bge-no-probe-import.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/bge-no-probe-import.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_bge_registry_roles_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/bge-registry-roles.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/bge-registry-roles.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/bge-registry-roles.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_bge_role_routes_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/bge-role-routes.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/bge-role-routes.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/bge-role-routes.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_bge_token_ssot_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/bge-token-ssot.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/bge-token-ssot.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/bge-token-ssot.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_brain_ingest_port_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/brain-ingest-port.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/brain-ingest-port.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/brain-ingest-port.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_dev_pod_loadouts_path_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/dev-pod-loadouts-path.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/dev-pod-loadouts-path.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/dev-pod-loadouts-path.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_dispatch_capture_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/dispatch-capture.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/dispatch-capture.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/dispatch-capture.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_embed_bge_fallback_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/embed-bge-fallback.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/embed-bge-fallback.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/embed-bge-fallback.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_gateway_consumer_lint_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/gateway-consumer-lint.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/gateway-consumer-lint.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/gateway-consumer-lint.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_gemma_kv_quant_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/gemma-kv-quant.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/gemma-kv-quant.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/gemma-kv-quant.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_gemma_loadout_autorestart_queue_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/gemma-loadout-autorestart-queue.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/gemma-loadout-autorestart-queue.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/gemma-loadout-autorestart-queue.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_glimmer_default_backend_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/glimmer-default-backend.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/glimmer-default-backend.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/glimmer-default-backend.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_gpu_lock_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/gpu-lock.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/gpu-lock.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/gpu-lock.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_host_listener_auth_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/host-listener-auth.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/host-listener-auth.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/host-listener-auth.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_kv_probe_endpoint_guard_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/kv-probe-endpoint-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/kv-probe-endpoint-guard.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/kv-probe-endpoint-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_llama_tool_names_match_binary_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/llama-tool-names-match-binary.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/llama-tool-names-match-binary.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/llama-tool-names-match-binary.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_loadout_aux_files_exist_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/loadout-aux-files-exist.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/loadout-aux-files-exist.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/loadout-aux-files-exist.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_loadout_enabled_flag_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/loadout-enabled-flag.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/loadout-enabled-flag.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/loadout-enabled-flag.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_loadout_env_property_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/loadout-env-property.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/loadout-env-property.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/loadout-env-property.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_loadout_model_files_exist_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/loadout-model-files-exist.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/loadout-model-files-exist.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/loadout-model-files-exist.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_loadout_model_lock_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/loadout-model-lock.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/loadout-model-lock.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/loadout-model-lock.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_loadouts_format_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/loadouts-format.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/loadouts-format.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/loadouts-format.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_model_path_large_file_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/model-path-large-file.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/model-path-large-file.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/model-path-large-file.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_opencode_agent_model_drift_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/opencode-agent-model-drift.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/opencode-agent-model-drift.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/opencode-agent-model-drift.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_opencode_routes_via_proxy_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/opencode-routes-via-proxy.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/opencode-routes-via-proxy.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/opencode-routes-via-proxy.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_pick_small_model_deterministic_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/pick-small-model-deterministic.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/pick-small-model-deterministic.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/pick-small-model-deterministic.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_proxy_env_token_guard_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/proxy-env-token-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/proxy-env-token-guard.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/proxy-env-token-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_proxy_tests_registered_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/proxy-tests-registered.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/proxy-tests-registered.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/proxy-tests-registered.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_readiness_primary_tier_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/readiness-primary-tier.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/readiness-primary-tier.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/readiness-primary-tier.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_retire_service_guard_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/retire-service-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/retire-service-guard.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/retire-service-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_support_model_slots_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/support-model-slots.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/support-model-slots.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/support-model-slots.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_tools_runtime_sandbox_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/tools-runtime-sandbox.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/tools-runtime-sandbox.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/tools-runtime-sandbox.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_ui_config_seed_spec(repo_root: Path):
    """Executes tests/spec/local-llm-proxy/ui-config-seed.bats."""
    res = _run_bats(repo_root, "tests/spec/local-llm-proxy/ui-config-seed.bats")
    assert res.returncode == 0, f"tests/spec/local-llm-proxy/ui-config-seed.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_db_backup_retention_spec(repo_root: Path):
    """Executes tests/spec/local-dev-mesh/db-backup-retention.bats."""
    res = _run_bats(repo_root, "tests/spec/local-dev-mesh/db-backup-retention.bats")
    assert res.returncode == 0, f"tests/spec/local-dev-mesh/db-backup-retention.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_dev_local_render_spec(repo_root: Path):
    """Executes tests/spec/local-dev-mesh/dev-local-render.bats."""
    res = _run_bats(repo_root, "tests/spec/local-dev-mesh/dev-local-render.bats")
    assert res.returncode == 0, f"tests/spec/local-dev-mesh/dev-local-render.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_dev_stack_tasks_spec(repo_root: Path):
    """Executes tests/spec/local-dev-mesh/dev-stack-tasks.bats."""
    res = _run_bats(repo_root, "tests/spec/local-dev-mesh/dev-stack-tasks.bats")
    assert res.returncode == 0, f"tests/spec/local-dev-mesh/dev-stack-tasks.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_devmesh_networks_spec(repo_root: Path):
    """Executes tests/spec/local-dev-mesh/devmesh-networks.bats."""
    res = _run_bats(repo_root, "tests/spec/local-dev-mesh/devmesh-networks.bats")
    assert res.returncode == 0, f"tests/spec/local-dev-mesh/devmesh-networks.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_devmesh_taskfile_spec(repo_root: Path):
    """Executes tests/spec/local-dev-mesh/devmesh-taskfile.bats."""
    res = _run_bats(repo_root, "tests/spec/local-dev-mesh/devmesh-taskfile.bats")
    assert res.returncode == 0, f"tests/spec/local-dev-mesh/devmesh-taskfile.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_gpu_enable_spec(repo_root: Path):
    """Executes tests/spec/local-dev-mesh/gpu-enable.bats."""
    res = _run_bats(repo_root, "tests/spec/local-dev-mesh/gpu-enable.bats")
    assert res.returncode == 0, f"tests/spec/local-dev-mesh/gpu-enable.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_k3d_acceptance_gate_spec(repo_root: Path):
    """Executes tests/spec/local-dev-mesh/k3d-acceptance-gate.bats."""
    res = _run_bats(repo_root, "tests/spec/local-dev-mesh/k3d-acceptance-gate.bats")
    assert res.returncode == 0, f"tests/spec/local-dev-mesh/k3d-acceptance-gate.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_k3d_tooling_removed_spec(repo_root: Path):
    """Executes tests/spec/local-dev-mesh/k3d-tooling-removed.bats."""
    res = _run_bats(repo_root, "tests/spec/local-dev-mesh/k3d-tooling-removed.bats")
    assert res.returncode == 0, f"tests/spec/local-dev-mesh/k3d-tooling-removed.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_k3s_install_spec(repo_root: Path):
    """Executes tests/spec/local-dev-mesh/k3s-install.bats."""
    res = _run_bats(repo_root, "tests/spec/local-dev-mesh/k3s-install.bats")
    assert res.returncode == 0, f"tests/spec/local-dev-mesh/k3s-install.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_llm_services_spec(repo_root: Path):
    """Executes tests/spec/local-dev-mesh/llm-services.bats."""
    res = _run_bats(repo_root, "tests/spec/local-dev-mesh/llm-services.bats")
    assert res.returncode == 0, f"tests/spec/local-dev-mesh/llm-services.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_migrate_from_k3d_spec(repo_root: Path):
    """Executes tests/spec/local-dev-mesh/migrate-from-k3d.bats."""
    res = _run_bats(repo_root, "tests/spec/local-dev-mesh/migrate-from-k3d.bats")
    assert res.returncode == 0, f"tests/spec/local-dev-mesh/migrate-from-k3d.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_no_k3d_context_spec(repo_root: Path):
    """Executes tests/spec/local-dev-mesh/no-k3d-context.bats."""
    res = _run_bats(repo_root, "tests/spec/local-dev-mesh/no-k3d-context.bats")
    assert res.returncode == 0, f"tests/spec/local-dev-mesh/no-k3d-context.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_preflight_spec(repo_root: Path):
    """Executes tests/spec/local-dev-mesh/preflight.bats."""
    res = _run_bats(repo_root, "tests/spec/local-dev-mesh/preflight.bats")
    assert res.returncode == 0, f"tests/spec/local-dev-mesh/preflight.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_status_spec(repo_root: Path):
    """Executes tests/spec/local-dev-mesh/status.bats."""
    res = _run_bats(repo_root, "tests/spec/local-dev-mesh/status.bats")
    assert res.returncode == 0, f"tests/spec/local-dev-mesh/status.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_tailnet_check_spec(repo_root: Path):
    """Executes tests/spec/local-dev-mesh/tailnet-check.bats."""
    res = _run_bats(repo_root, "tests/spec/local-dev-mesh/tailnet-check.bats")
    assert res.returncode == 0, f"tests/spec/local-dev-mesh/tailnet-check.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_tailnet_policy_spec(repo_root: Path):
    """Executes tests/spec/local-dev-mesh/tailnet-policy.bats."""
    res = _run_bats(repo_root, "tests/spec/local-dev-mesh/tailnet-policy.bats")
    assert res.returncode == 0, f"tests/spec/local-dev-mesh/tailnet-policy.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_ticket_devmesh_guard_spec(repo_root: Path):
    """Executes tests/spec/local-dev-mesh/ticket-devmesh-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/local-dev-mesh/ticket-devmesh-guard.bats")
    assert res.returncode == 0, f"tests/spec/local-dev-mesh/ticket-devmesh-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_comfy_image_mcp_spec(repo_root: Path):
    """Executes tests/spec/llm-local-dev/comfy-image-mcp.bats."""
    res = _run_bats(repo_root, "tests/spec/llm-local-dev/comfy-image-mcp.bats")
    assert res.returncode == 0, f"tests/spec/llm-local-dev/comfy-image-mcp.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_comfy_image_postprocess_spec(repo_root: Path):
    """Executes tests/spec/llm-local-dev/comfy-image-postprocess.bats."""
    res = _run_bats(repo_root, "tests/spec/llm-local-dev/comfy-image-postprocess.bats")
    assert res.returncode == 0, f"tests/spec/llm-local-dev/comfy-image-postprocess.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_fit_ngl_conflict_spec(repo_root: Path):
    """Executes tests/spec/llm-local-dev/fit-ngl-conflict.bats."""
    res = _run_bats(repo_root, "tests/spec/llm-local-dev/fit-ngl-conflict.bats")
    assert res.returncode == 0, f"tests/spec/llm-local-dev/fit-ngl-conflict.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_glimmer_worker_mcp_spec(repo_root: Path):
    """Executes tests/spec/llm-local-dev/glimmer-worker-mcp.bats."""
    res = _run_bats(repo_root, "tests/spec/llm-local-dev/glimmer-worker-mcp.bats")
    assert res.returncode == 0, f"tests/spec/llm-local-dev/glimmer-worker-mcp.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_plan_runner_ticket_ref_spec(repo_root: Path):
    """Executes tests/spec/llm-local-dev/plan-runner-ticket-ref.bats."""
    res = _run_bats(repo_root, "tests/spec/llm-local-dev/plan-runner-ticket-ref.bats")
    assert res.returncode == 0, f"tests/spec/llm-local-dev/plan-runner-ticket-ref.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_plan_runner_spec(repo_root: Path):
    """Executes tests/spec/llm-local-dev/plan-runner.bats."""
    res = _run_bats(repo_root, "tests/spec/llm-local-dev/plan-runner.bats")
    assert res.returncode == 0, f"tests/spec/llm-local-dev/plan-runner.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_qwen_tensor_split_spec(repo_root: Path):
    """Executes tests/spec/llm-local-dev/qwen-tensor-split.bats."""
    res = _run_bats(repo_root, "tests/spec/llm-local-dev/qwen-tensor-split.bats")
    assert res.returncode == 0, f"tests/spec/llm-local-dev/qwen-tensor-split.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_qwen35_08b_training_spec(repo_root: Path):
    """Executes tests/spec/llm-local-dev/qwen35-08b-training.bats."""
    res = _run_bats(repo_root, "tests/spec/llm-local-dev/qwen35-08b-training.bats")
    assert res.returncode == 0, f"tests/spec/llm-local-dev/qwen35-08b-training.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_qwen35_2b_training_spec(repo_root: Path):
    """Executes tests/spec/llm-local-dev/qwen35-2b-training.bats."""
    res = _run_bats(repo_root, "tests/spec/llm-local-dev/qwen35-2b-training.bats")
    assert res.returncode == 0, f"tests/spec/llm-local-dev/qwen35-2b-training.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_qwen35_4b_training_spec(repo_root: Path):
    """Executes tests/spec/llm-local-dev/qwen35-4b-training.bats."""
    res = _run_bats(repo_root, "tests/spec/llm-local-dev/qwen35-4b-training.bats")
    assert res.returncode == 0, f"tests/spec/llm-local-dev/qwen35-4b-training.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_single_static_model_spec(repo_root: Path):
    """Executes tests/spec/llm-local-dev/single-static-model.bats."""
    res = _run_bats(repo_root, "tests/spec/llm-local-dev/single-static-model.bats")
    assert res.returncode == 0, f"tests/spec/llm-local-dev/single-static-model.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_system_message_merge_spec(repo_root: Path):
    """Executes tests/spec/llm-local-dev/system-message-merge.bats."""
    res = _run_bats(repo_root, "tests/spec/llm-local-dev/system-message-merge.bats")
    assert res.returncode == 0, f"tests/spec/llm-local-dev/system-message-merge.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_bge_bulk_pool_spec(repo_root: Path):
    """Executes tests/spec/llm-pipeline/bge-bulk-pool.bats."""
    res = _run_bats(repo_root, "tests/spec/llm-pipeline/bge-bulk-pool.bats")
    assert res.returncode == 0, f"tests/spec/llm-pipeline/bge-bulk-pool.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_bge_thread_quota_spec(repo_root: Path):
    """Executes tests/spec/llm-pipeline/bge-thread-quota.bats."""
    res = _run_bats(repo_root, "tests/spec/llm-pipeline/bge-thread-quota.bats")
    assert res.returncode == 0, f"tests/spec/llm-pipeline/bge-thread-quota.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_bge_usecase_reachability_spec(repo_root: Path):
    """Executes tests/spec/llm-pipeline/bge-usecase-reachability.bats."""
    res = _run_bats(repo_root, "tests/spec/llm-pipeline/bge-usecase-reachability.bats")
    assert res.returncode == 0, f"tests/spec/llm-pipeline/bge-usecase-reachability.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_knowledge_ingest_live_sources_spec(repo_root: Path):
    """Executes tests/spec/llm-pipeline/knowledge-ingest-live-sources.bats."""
    res = _run_bats(repo_root, "tests/spec/llm-pipeline/knowledge-ingest-live-sources.bats")
    assert res.returncode == 0, f"tests/spec/llm-pipeline/knowledge-ingest-live-sources.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_kv_offload_spec(repo_root: Path):
    """Executes tests/spec/llm-pipeline/kv-offload.bats."""
    res = _run_bats(repo_root, "tests/spec/llm-pipeline/kv-offload.bats")
    assert res.returncode == 0, f"tests/spec/llm-pipeline/kv-offload.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_gguf_fixture_bridge_spec(repo_root: Path):
    """Executes tests/spec/unsloth-eval-harness/gguf-fixture-bridge.bats."""
    res = _run_bats(repo_root, "tests/spec/unsloth-eval-harness/gguf-fixture-bridge.bats")
    assert res.returncode == 0, f"tests/spec/unsloth-eval-harness/gguf-fixture-bridge.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_regression_gate_spec(repo_root: Path):
    """Executes tests/spec/unsloth-eval-harness/regression-gate.bats."""
    res = _run_bats(repo_root, "tests/spec/unsloth-eval-harness/regression-gate.bats")
    assert res.returncode == 0, f"tests/spec/unsloth-eval-harness/regression-gate.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_scoring_rules_spec(repo_root: Path):
    """Executes tests/spec/unsloth-eval-harness/scoring-rules.bats."""
    res = _run_bats(repo_root, "tests/spec/unsloth-eval-harness/scoring-rules.bats")
    assert res.returncode == 0, f"tests/spec/unsloth-eval-harness/scoring-rules.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_tandem_candidates_spec(repo_root: Path):
    """Executes tests/spec/unsloth-eval-harness/tandem-candidates.bats."""
    res = _run_bats(repo_root, "tests/spec/unsloth-eval-harness/tandem-candidates.bats")
    assert res.returncode == 0, f"tests/spec/unsloth-eval-harness/tandem-candidates.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_testset_shape_spec(repo_root: Path):
    """Executes tests/spec/unsloth-eval-harness/testset-shape.bats."""
    res = _run_bats(repo_root, "tests/spec/unsloth-eval-harness/testset-shape.bats")
    assert res.returncode == 0, f"tests/spec/unsloth-eval-harness/testset-shape.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_agent_discovery_spec(repo_root: Path):
    """Executes tests/spec/unsloth-training-env/agent-discovery.bats."""
    res = _run_bats(repo_root, "tests/spec/unsloth-training-env/agent-discovery.bats")
    assert res.returncode == 0, f"tests/spec/unsloth-training-env/agent-discovery.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_measure_corpus_spec(repo_root: Path):
    """Executes tests/spec/unsloth-training-env/measure-corpus.bats."""
    res = _run_bats(repo_root, "tests/spec/unsloth-training-env/measure-corpus.bats")
    assert res.returncode == 0, f"tests/spec/unsloth-training-env/measure-corpus.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_template_guard_spec(repo_root: Path):
    """Executes tests/spec/unsloth-training-env/template-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/unsloth-training-env/template-guard.bats")
    assert res.returncode == 0, f"tests/spec/unsloth-training-env/template-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_train_config_spec(repo_root: Path):
    """Executes tests/spec/unsloth-training-env/train-config.bats."""
    res = _run_bats(repo_root, "tests/spec/unsloth-training-env/train-config.bats")
    assert res.returncode == 0, f"tests/spec/unsloth-training-env/train-config.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"

def test_vision_route_spec(repo_root: Path):
    """Executes tests/spec/unsloth-training-env/vision-route.bats."""
    res = _run_bats(repo_root, "tests/spec/unsloth-training-env/vision-route.bats")
    assert res.returncode == 0, f"tests/spec/unsloth-training-env/vision-route.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"
