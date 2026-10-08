"""Native migration of tests/spec/sdlc-isolation/llm-up-health.bats."""

import os
import re
import shutil
import socket
from pathlib import Path

import pytest


@pytest.fixture
def paths(repo_root: Path) -> dict:
    return {"llm_up": repo_root / "scripts" / "sdlc" / "llm-up.sh",
            "health_gate": repo_root / "scripts" / "sdlc" / "health-gate.sh"}


def _tolerant(run_cmd, cmd, **kw):
    """`run` semantics: a missing binary yields exit 127 and its bash message."""
    try:
        return run_cmd(cmd, **kw)
    except FileNotFoundError:
        class R:
            returncode = 127
            stdout = ""
            stderr = f"{cmd[0]}: command not found"
            output = stderr
        return R()


def free_port() -> int:
    """Ephemeral loopback port (same as the python3 one-liner in the original)."""
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _curl_ok(run_cmd, url: str, max_time: str = "1") -> bool:
    if shutil.which("curl") is None:
        return False
    return _tolerant(run_cmd, ["curl", "-fsS", "--max-time", max_time, url]).returncode == 0


def _lines(output: str) -> list:
    return output.splitlines()


def test_sdlc_up_is_listed_as_a_task(run_cmd, repo_root):
    """sdlc:up is listed as a task"""
    result = _tolerant(run_cmd, ["task", "--list-all"])
    assert "sdlc:up" in result.output


def test_sdlc_down_is_listed_as_a_task(run_cmd, repo_root):
    """sdlc:down is listed as a task"""
    result = _tolerant(run_cmd, ["task", "--list-all"])
    assert "sdlc:down" in result.output


def test_dev_up_is_not_listed_as_a_task_namespace_belongs_to_dev_stack(run_cmd, repo_root):
    """dev:up is NOT listed as a task (namespace belongs to dev-stack)"""
    result = _tolerant(run_cmd, ["task", "--list-all"])
    # Positiv-Anker zuerst.
    assert result.output
    assert "workspace:deploy" in result.output
    assert not re.search(r"\bdev:up\b", result.output)


def test_sdlc_up_dry_run_calls_proxy_start_before_llm_up_sh_before_health_gate(run_cmd, repo_root):
    """sdlc:up dry-run calls proxy:start before llm-up.sh before health-gate"""
    output = _tolerant(run_cmd, ["task", "--dry", "sdlc:sdlc:up"]).output
    lines = _lines(output)

    def first_line(needle: str):
        for i, line in enumerate(lines, start=1):
            if needle in line:
                return i
        return None

    proxy = first_line("llm:proxy:start")
    loadout = first_line("llm-up.sh")
    health = first_line("health-gate")
    assert proxy
    assert loadout
    assert health
    assert proxy < loadout < health


def test_llm_up_sh_against_dead_port_fails_and_names_the_proxy(run_cmd, paths):
    """llm-up.sh against dead port fails and names the proxy"""
    port = free_port()
    if _curl_ok(run_cmd, f"http://127.0.0.1:{port}/"):
        pytest.skip(f"port {port} unexpectedly in use")
    # Positiv-Anker: der Fehlerpfad mit gesetztem SDLC_LLM_LOADOUT endet mit Exit != 0.
    anchor = _tolerant(run_cmd, ["bash", str(paths["llm_up"])],
                       env={"LLM_PROXY_PORT": str(port), "SDLC_LLM_LOADOUT": "anchor-loadout"})
    assert anchor.returncode != 0
    result = _tolerant(run_cmd, ["bash", str(paths["llm_up"])], env={"LLM_PROXY_PORT": str(port)})
    assert result.returncode != 0
    assert re.search(r"llm-up|proxy", result.output, re.I)


def test_llm_up_sh_with_unknown_loadout_slug_fails_and_names_the_slug(run_cmd, paths):
    """llm-up.sh with unknown loadout slug fails and names the slug"""
    port = os.environ.get("LLM_PROXY_PORT", "18235")
    if not _curl_ok(run_cmd, f"http://127.0.0.1:{port}/livez", max_time="2"):
        pytest.skip("llm-proxy not running locally (needed for the 404 path)")
    result = _tolerant(run_cmd, ["bash", str(paths["llm_up"])], env={"SDLC_LLM_LOADOUT": "nonexistent-loadout"})
    assert result.returncode != 0
    assert "nonexistent-loadout" in result.output


def test_llm_up_sh_down_against_dead_port_is_best_effort_exit_0(run_cmd, paths):
    """llm-up.sh down against dead port is best-effort (exit 0)"""
    port = free_port()
    if _curl_ok(run_cmd, f"http://127.0.0.1:{port}/"):
        pytest.skip(f"port {port} unexpectedly in use")
    result = _tolerant(run_cmd, ["bash", str(paths["llm_up"]), "down"], env={"LLM_PROXY_PORT": str(port)})
    assert result.returncode == 0, result.output


def test_health_gate_fails_when_the_proxy_is_not_ready_and_names_llm_proxy(run_cmd, paths):
    """health-gate fails when the proxy is not ready and names llm-proxy"""
    if _tolerant(run_cmd, ["kubectl", "config", "get-contexts", "devmesh"]).returncode != 0:
        pytest.skip("cluster devmesh context not configured")
    if _tolerant(run_cmd, ["kubectl", "--context", "devmesh", "get", "nodes", "--request-timeout=3s"]).returncode != 0:
        pytest.skip("cluster devmesh not reachable")
    port = free_port()
    if _curl_ok(run_cmd, f"http://127.0.0.1:{port}/"):
        pytest.skip(f"port {port} unexpectedly in use")
    result = _tolerant(run_cmd, ["bash", str(paths["health_gate"]), "--context", "devmesh", "--timeout", "5"],
                       env={"LLM_PROXY_PORT": str(port)})
    assert result.returncode != 0
    assert "llm-proxy" in result.output.lower()


def test_sdlc_down_dry_run_calls_llm_up_sh_down_before_proxy_stop(run_cmd):
    """sdlc:down dry-run calls llm-up.sh down before proxy:stop"""
    output = _tolerant(run_cmd, ["task", "--dry", "sdlc:sdlc:down"]).output
    lines = _lines(output)

    def first_line(needle: str):
        for i, line in enumerate(lines, start=1):
            if needle in line:
                return i
        return None

    loadout = first_line("llm-up.sh down")
    stop = first_line("llm:proxy:stop")
    assert loadout
    assert stop
    assert loadout < stop
