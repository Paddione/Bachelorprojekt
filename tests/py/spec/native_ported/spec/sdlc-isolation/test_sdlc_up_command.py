"""Native migration of tests/spec/sdlc-isolation/sdlc-up-command.bats."""
import os
import re
import shutil

import pytest

HEALTH_GATE = "scripts/sdlc/health-gate.sh"


def _task(run_cmd, repo_root, *args):
    """Run `task` (as the BATS `run $TASK ...` did); skip when task is not installed."""
    if shutil.which("task") is None:
        pytest.skip("task not installed")
    return run_cmd(["task", *args], cwd=repo_root, timeout=300)


def _line_of(output: str, needle: str):
    """Emulate `grep -n <needle> | head -1 | cut -d: -f1` (1-based), None when absent."""
    for idx, line in enumerate(output.splitlines(), start=1):
        if needle in line:
            return idx
    return None


def _context_exists(run_cmd, repo_root, context):
    if shutil.which("kubectl") is None:
        return False
    res = run_cmd(["kubectl", "config", "get-contexts", context], cwd=repo_root, timeout=300)
    return res.returncode == 0


def test_sdlc_up_is_listed_as_a_task(run_cmd, repo_root):
    assert "sdlc:up" in _task(run_cmd, repo_root, "--list-all").output


def test_sdlc_down_is_listed_as_a_task(run_cmd, repo_root):
    assert "sdlc:down" in _task(run_cmd, repo_root, "--list-all").output


def test_sdlc_dev_is_listed_as_a_task(run_cmd, repo_root):
    assert "sdlc:dev" in _task(run_cmd, repo_root, "--list-all").output


def test_dev_up_is_not_listed_as_a_task_namespace_belongs_to_dev_stack(run_cmd, repo_root):
    output = _task(run_cmd, repo_root, "--list-all").output
    assert not re.search(r"(?<![A-Za-z0-9_])dev:up(?![A-Za-z0-9_])", output)


def test_dev_down_is_not_listed_as_a_task_namespace_belongs_to_dev_stack(run_cmd, repo_root):
    output = _task(run_cmd, repo_root, "--list-all").output
    assert not re.search(r"(?<![A-Za-z0-9_])dev:down(?![A-Za-z0-9_])", output)


def test_task_list_is_not_empty_positive_anchor_for_negative_assertions(run_cmd, repo_root):
    output = _task(run_cmd, repo_root, "--list-all").output
    assert output
    assert "workspace:deploy" in output


def test_sdlc_up_dry_run_calls_proxy_start_before_health_gate(run_cmd, repo_root):
    output = _task(run_cmd, repo_root, "--dry", "sdlc:sdlc:up").output
    proxy_line = _line_of(output, "llm:proxy:start")
    health_line = _line_of(output, "health-gate")
    assert proxy_line is not None
    assert health_line is not None
    assert proxy_line < health_line


def test_sdlc_up_dry_run_includes_health_gate_as_the_final_step(run_cmd, repo_root):
    output = _task(run_cmd, repo_root, "--dry", "sdlc:sdlc:up").output
    assert "health-gate" in output


def test_health_gate_sh_script_file_exists(repo_root):
    script = repo_root / HEALTH_GATE
    assert script.is_file()
    assert os.access(script, os.X_OK)


def test_health_gate_exits_non_zero_when_cluster_is_unreachable(run_cmd, repo_root):
    res = run_cmd(
        ["bash", HEALTH_GATE, "--context", "no-such-cluster", "--timeout", "2"],
        cwd=repo_root,
        timeout=300,
    )
    assert res.returncode != 0
    assert re.search(r"(?i)(cluster|context|reachable|unavailable|no-such)", res.output)


def test_health_gate_output_names_a_missing_component_explicitly(run_cmd, repo_root):
    res = run_cmd(
        ["bash", HEALTH_GATE, "--context", "no-such-cluster", "--timeout", "2"],
        cwd=repo_root,
        timeout=300,
    )
    assert res.returncode != 0
    assert re.search(
        r"(?i)(cluster|shared-db|pocket-id|sdlc-console|bge-embed|bge-rerank|llm-proxy|proxy)",
        res.output,
    )


def test_health_gate_with_reachable_cluster_but_missing_deployments_exits_non_zero(run_cmd, repo_root):
    if not _context_exists(run_cmd, repo_root, "devmesh"):
        pytest.skip("cluster devmesh context not configured")
    res = run_cmd(
        ["bash", HEALTH_GATE, "--context", "devmesh", "--timeout", "5"],
        cwd=repo_root,
        timeout=300,
    )
    if res.returncode == 0:
        pytest.skip("all deployments are ready - cannot test failure path")
    assert re.search(
        r"(?i)(shared-db|pocket-id|sdlc-console|bge-embed|bge-rerank|llm-proxy|proxy)",
        res.output,
    )


def test_health_gate_never_exits_0_when_a_component_is_not_ready(run_cmd, repo_root):
    if not _context_exists(run_cmd, repo_root, "devmesh"):
        pytest.skip("cluster devmesh context not configured")
    res = run_cmd(
        ["bash", HEALTH_GATE, "--context", "devmesh", "--timeout", "5"],
        cwd=repo_root,
        timeout=300,
    )
    if re.search(r"(?i)not ready|unavailable|failed|missing", res.output):
        assert res.returncode != 0


def test_sdlc_up_dry_run_does_not_invoke_an_astro_dev_server_does_not_block(run_cmd, repo_root):
    output = _task(run_cmd, repo_root, "--dry", "sdlc:sdlc:up").output
    assert not re.search(r"(?i)(astro dev|pnpm dev|npm run dev)", output)


def test_sdlc_dev_exists_separately_and_carries_build_target_sdlc(run_cmd, repo_root):
    output = _task(run_cmd, repo_root, "--dry", "sdlc:sdlc:dev").output
    assert "BUILD_TARGET=sdlc" in output


def test_sdlc_up_dry_run_checks_the_rollout_before_proxy_start_and_creates_no_cluster(run_cmd, repo_root):
    output = _task(run_cmd, repo_root, "--dry", "sdlc:sdlc:up").output
    rollout_line = _line_of(output, "rollout status")
    proxy_line = _line_of(output, "llm:proxy:start")
    assert rollout_line is not None
    assert proxy_line is not None
    assert rollout_line < proxy_line
    assert not re.search(r"k3d cluster|cluster:create", output)


def test_sdlc_down_dry_run_stops_the_proxy_and_deletes_no_cluster(run_cmd, repo_root):
    output = _task(run_cmd, repo_root, "--dry", "sdlc:sdlc:down").output
    assert "llm:proxy:stop" in output
    assert not re.search(r"k3d cluster|cluster:delete", output)
