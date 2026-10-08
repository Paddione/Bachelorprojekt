"""Native migration of tests/spec/sdlc-isolation/e2-local-stack.bats."""

# Helpers mirror tests/lib/guard-preconditions.sh (require_command, require_k8s_rollout).

import re
import shutil
import subprocess
import time
from pathlib import Path

import pytest


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


def _cluster_running(run_cmd) -> bool:
    return _tolerant(run_cmd, ["kubectl", "--context", "devmesh", "get", "nodes", "--request-timeout=3s"]).returncode == 0


def _jsonpath(run_cmd, ctx, ns, kind, name, path) -> str:
    return _tolerant(run_cmd, ["kubectl", "--context", ctx, "get", kind, name, "-n", ns,
                               "-o", f"jsonpath={{{path}}}"]).stdout


def _require_k8s_rollout(run_cmd, ctx: str, ns: str, kind: str, name: str) -> None:
    """guard-preconditions.sh: require_k8s_rollout -> skip with named reason."""
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl nicht installiert — Kubernetes-Probe nicht pruefbar (Umgebung, kein Produktfehler; T900651)")
    if _tolerant(run_cmd, ["kubectl", "--context", ctx, "get", "nodes", "--request-timeout=3s"]).returncode != 0:
        pytest.skip(f"cluster {ctx} not running")
    ready = _jsonpath(run_cmd, ctx, ns, kind, name, ".status.readyReplicas")
    replicas = _jsonpath(run_cmd, ctx, ns, kind, name, ".spec.replicas")
    ready_s = ready or "0"
    replicas_s = replicas or "1"
    if not (ready_s == replicas_s and ready_s != "0"):
        pytest.skip(f"{kind}/{name} in {ctx}/{ns} nicht ausgerollt (readyReplicas={ready or '0'}/{replicas or '?'}) "
                    "— lokaler Stack unvollstaendig (Umgebung, kein Produktfehler; T900651)")


@pytest.fixture
def stack(repo_root: Path) -> dict:
    return {
        "sdlc_stack": repo_root / "k3d" / "sdlc-stack",
        "auth_dir": repo_root / "components" / "website" / "src" / "lib" / "auth",
        "docs": repo_root / "docs" / "sdlc-stack",
        "repo": repo_root,
    }


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_e2_overlay_exists_and_references_sdlc_resources(stack):
    """E2: Overlay exists and references SDLC resources"""
    kust = stack["sdlc_stack"] / "kustomization.yaml"
    assert kust.is_file()
    text = _read(kust)
    for needle in ("../llm-gpu.yaml", "../shared-db.yaml", "../pocket-id.yaml", "sdlc-console.yaml", "sdlc-ingress.yaml"):
        assert needle in text, needle


def test_e2_console_deployment_references_website_sdlc_image_and_fallback_auth(stack):
    """E2: Console deployment references website-sdlc image and fallback auth"""
    console = stack["sdlc_stack"] / "sdlc-console.yaml"
    assert console.is_file()
    text = _read(console)
    assert "ghcr.io/paddione/website-sdlc" in text
    assert "POCKET_ID_FALLBACK_FRONTEND_URL" in text


def test_e2_console_zieht_latest_bei_jedem_neustart_image_pull_policy_always_t003740(stack):
    """E2: Console zieht :latest bei jedem Neustart — imagePullPolicy Always (T003740)"""
    console = stack["sdlc_stack"] / "sdlc-console.yaml"
    assert console.is_file()
    assert "imagePullPolicy: Always" in _read(console)
    assert "sdlc:refresh" in _read(stack["repo"] / "taskfiles" / "Taskfile.sdlc.yml")


def test_e2_auth_provider_file_and_test_exist(stack):
    """E2: Auth provider file and test exist"""
    assert (stack["auth_dir"] / "provider.ts").is_file()
    assert (stack["auth_dir"] / "provider.test.ts").is_file()


def test_e2_auth_provider_test_covers_fail_closed_scenario(stack):
    """E2: Auth provider test covers fail-closed scenario"""
    text = _read(stack["auth_dir"] / "provider.test.ts")
    assert re.search(r"(fail.closed|Fall 1|both.*(down|unreachable)|AuthUnavailableError)", text)


def test_e2_runbook_exists_and_documents_wsl_memory_baseline(stack):
    """E2: Runbook exists and documents WSL memory baseline"""
    readme = stack["docs"] / "README.md"
    assert readme.is_file()
    assert re.search(r"(40.?GB|39.?GB|memory|WSL.Speicher)", _read(readme))


def test_e2_taskfile_include_in_taskfile_yml(stack):
    """E2: Taskfile include in Taskfile.yml"""
    assert "Taskfile.sdlc.yml" in _read(stack["repo"] / "Taskfile.yml")


def test_e2_dod_sdlc_console_deployment_is_ready(run_cmd):
    """E2 DoD: sdlc-console deployment is Ready"""
    _require_k8s_rollout(run_cmd, "devmesh", "workspace", "deploy", "sdlc-console")
    out = _tolerant(run_cmd, ["kubectl", "--context", "devmesh", "get", "deploy", "sdlc-console", "-n", "workspace",
                              "-o", "jsonpath={.status.readyReplicas}"])
    assert out.returncode == 0, out.output
    assert "1" in out.stdout


def test_e2_dod_build_target_sdlc_im_container_gesetzt_t003740(run_cmd):
    """E2 DoD: BUILD_TARGET=sdlc im Container gesetzt (T003740)"""
    _require_k8s_rollout(run_cmd, "devmesh", "workspace", "deploy", "sdlc-console")
    result = _tolerant(run_cmd, ["kubectl", "--context", "devmesh", "exec", "-n", "workspace",
                                 "deploy/sdlc-console", "--", "sh", "-c", "echo BUILD_TARGET=$BUILD_TARGET"])
    assert "BUILD_TARGET=sdlc" in result.output


def test_e2_dod_local_tickets_schema_bootstrapped(run_cmd):
    """E2 DoD: local tickets schema bootstrapped"""
    if not _cluster_running(run_cmd):
        pytest.skip("cluster devmesh not running")
    # Der Original-Test fuehrt den Befehl aus, ohne ein Ergebnis zu pruefen.
    _tolerant(run_cmd, ["kubectl", "--context", "devmesh", "exec", "-n", "workspace", "deploy/shared-db", "--",
                        "psql", "-U", "postgres", "-d", "website", "-tAc",
                        "SELECT count(*) FROM information_schema.tables WHERE table_schema='tickets'"])


def test_e2_dod_bge_embed_responds_on_health(run_cmd):
    """E2 DoD: bge-embed responds on health"""
    _require_k8s_rollout(run_cmd, "devmesh", "workspace", "deploy", "bge-embed")
    pf = subprocess.Popen(
        ["kubectl", "--context", "devmesh", "port-forward", "-n", "workspace", "svc/llm-gateway-embed", "18081:8081"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        time.sleep(2)
        result = _tolerant(run_cmd, ["curl", "-sS", "-o", "/dev/null", "-w", "%{http_code}",
                                     "http://127.0.0.1:18081/health"])
        assert result.output == "200"
    finally:
        if pf.poll() is None:
            pf.kill()
        pf.wait()
