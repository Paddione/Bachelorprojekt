"""Native migration of tests/spec/security.bats."""

# The three python3-heredoc cases are ported to plain Python with the same checks.

import os
import re
from pathlib import Path

import pytest
import yaml


def test_k3d_ingress_yaml_exists(repo_root):
    """k3d/ingress.yaml exists"""
    assert (repo_root / "k3d" / "ingress.yaml").is_file()


def test_ingress_yaml_is_a_valid_kubernetes_ingress_manifest(repo_root):
    """ingress.yaml is a valid Kubernetes Ingress manifest"""
    assert "apiVersion: networking.k8s.io" in (repo_root / "k3d" / "ingress.yaml").read_text(encoding="utf-8")


def test_ingress_yaml_defines_workspace_backend_services(repo_root):
    """ingress.yaml defines workspace backend services"""
    assert "backend:" in (repo_root / "k3d" / "ingress.yaml").read_text(encoding="utf-8")


def test_secret_rotate_sh_script_exists(repo_root):
    """secret-rotate.sh script exists"""
    assert (repo_root / "scripts" / "secret-rotate.sh").is_file()


def test_secret_rotate_sh_is_executable(repo_root):
    """secret-rotate.sh is executable"""
    assert os.access(repo_root / "scripts" / "secret-rotate.sh", os.X_OK)


def test_environments_secrets_directory_structure_exists(repo_root):
    """environments/.secrets/ directory structure exists"""
    if not (repo_root / "environments" / ".secrets").is_dir():
        pytest.skip("secrets dir not in worktree")


def test_env_seal_task_is_declared_in_taskfile(repo_root):
    """env:seal task is declared in Taskfile"""
    assert "env:seal" in (repo_root / "taskfiles" / "Taskfile.platform.yml").read_text(encoding="utf-8")


def test_bp_build_agent_file_exists_security_merged_t900858(repo_root):
    """bp-build agent file exists (security merged, T900858)"""
    assert (repo_root / ".claude" / "agents" / "bp-build.md").is_file()


def _load_docs(path: Path) -> list:
    return [d for d in yaml.safe_load_all(path.read_text(encoding="utf-8")) if d]


def test_run_as_non_root_baseline_hardened_deployments_tragen_pod_level_sc(repo_root):
    """run-as-non-root baseline: hardened Deployments tragen pod-level sc"""
    targets = [
        ("k3d/coturn-stack/janus.yaml", "janus", True),
        # [T900107] Der dev-pod hat keine Root-Container mehr.
        ("k3d/dev-pod/deployment.yaml", "dev-pod", True),
        ("k3d/dev-stack/brett-dev.yaml", "brett", True),
        ("k3d/dev-stack/website-dev.yaml", "website", True),
    ]
    fails = []
    for rel, dep, expect_pod_nonroot in targets:
        docs = _load_docs(repo_root / rel)
        depdoc = next((d for d in docs if d.get("kind") == "Deployment" and d["metadata"]["name"] == dep), None)
        if depdoc is None:
            fails.append(f"{rel}: Deployment {dep} fehlt")
            continue
        sc = depdoc["spec"]["template"]["spec"].get("securityContext") or {}
        if expect_pod_nonroot and sc.get("runAsNonRoot") is not True:
            fails.append(f"{rel}:{dep}: pod-level runAsNonRoot != true")
        secc = (sc.get("seccompProfile") or {}).get("type")
        if secc != "RuntimeDefault":
            fails.append(f"{rel}:{dep}: pod-level seccompProfile.type != RuntimeDefault (ist {secc!r})")
    assert not fails, "\n".join(fails)


def test_run_as_non_root_baseline_gehardenede_container_level_sc(repo_root):
    """run-as-non-root baseline: gehardenede Container-Level-sc"""
    targets = [
        ("k3d/coturn-stack/janus.yaml", "janus", "janus", False),
        ("k3d/dev-pod/deployment.yaml", "dev-pod", "mcp-node", False),
        ("k3d/dev-stack/brett-dev.yaml", "brett", "brett", True),
        ("k3d/dev-stack/website-dev.yaml", "website", "website", False),
    ]
    fails = []
    for rel, dep, cname, is_brett in targets:
        docs = _load_docs(repo_root / rel)
        spec = next((d["spec"]["template"]["spec"] for d in docs
                     if d.get("kind") == "Deployment" and d["metadata"]["name"] == dep), None)
        if spec is None:
            fails.append(f"{rel}: Deployment {dep} fehlt")
            continue
        conts = (spec.get("containers") or []) + (spec.get("initContainers") or [])
        c = next((c for c in conts if c["name"] == cname), None)
        if c is None:
            fails.append(f"{rel}: Container {cname} fehlt")
            continue
        sc = c.get("securityContext") or {}
        if sc.get("runAsNonRoot") is not True:
            fails.append(f"{rel}:{cname}: runAsNonRoot != true")
        if sc.get("runAsUser") != 1000:
            fails.append(f"{rel}:{cname}: runAsUser != 1000")
        if sc.get("allowPrivilegeEscalation") is not False:
            fails.append(f"{rel}:{cname}: allowPrivilegeEscalation != false")
        if is_brett:
            if sc.get("readOnlyRootFilesystem") is not True:
                fails.append(f"{rel}:{cname}: readOnlyRootFilesystem != true")
            drops = (sc.get("capabilities") or {}).get("drop") or []
            if drops != ["ALL"]:
                fails.append(f"{rel}:{cname}: capabilities.drop != ['ALL']")
    assert not fails, "\n".join(fails)


def test_run_as_non_root_baseline_ausnahme_container_tragen_den_marker_kommentar(repo_root):
    """run-as-non-root baseline: Ausnahme-Container tragen den Marker-Kommentar"""
    exceptions = [
        ("k3d/dev-stack/sish.yaml", ["sish"]),
        ("k3d/mentolder-web.yaml", ["mentolder-web"]),
    ]
    fails = []
    for rel, names in exceptions:
        lines = (repo_root / rel).read_text(encoding="utf-8").splitlines()
        for name in names:
            # Variante B: Annotations-Zeile.
            marker_found = any(
                "# runAsNonRoot-Ausnahme:" in ln and re.search(re.escape(name) + r"\s*[:(]", ln)
                for ln in lines
            )
            start = None
            indent = ""
            for i, ln in enumerate(lines):
                m = re.match(r"^(\s*)- name: " + re.escape(name) + r"\s*$", ln)
                if m:
                    start = i
                    indent = m.group(1)
                    break
            if start is None:
                if not marker_found:
                    fails.append(f"{rel}: Container {name} nicht gefunden und Marker fehlt")
                continue
            for ln in lines[start + 1:]:
                stripped_len = len(ln) - len(ln.lstrip())
                if re.match(r"^\s*- name:", ln) and stripped_len <= len(indent):
                    break
                if "# runAsNonRoot-Ausnahme:" in ln:
                    marker_found = True
                    break
            if not marker_found:
                fails.append(f"{rel}:{name}: Marker '# runAsNonRoot-Ausnahme:' fehlt")
    assert not fails, "\n".join(fails)
