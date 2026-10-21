"""Contracts for devmesh-flux feature (ADR-015, .agents/plans/devmesh-flux/design.md)."""

from pathlib import Path
import subprocess
import pytest
import yaml


def test_render_out_layout(repo_root: Path, tmp_path: Path):
    """bash scripts/devmesh/render-stack.sh core --out <tmp> creates platform/, secrets/, workspace/."""
    res = subprocess.run(
        ["bash", "scripts/devmesh/render-stack.sh", "core", "--out", str(tmp_path)],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0, f"render-stack.sh failed:\n{res.stdout}\n{res.stderr}"

    for subdir_name in ["platform", "secrets", "workspace"]:
        subdir = tmp_path / subdir_name
        assert subdir.is_dir(), f"Expected directory {subdir} does not exist"
        yaml_docs = []
        for yf in list(subdir.glob("*.yaml")) + list(subdir.glob("*.yml")):
            yaml_docs.extend([d for d in yaml.safe_load_all(yf.read_text()) if d])
        assert len(yaml_docs) >= 1, f"Expected at least one YAML document in {subdir}, found {len(yaml_docs)}"


def test_no_mentolder_or_fleet_refs(repo_root: Path, tmp_path: Path):
    """No document in --out tree contains mentolder.de, fleet-manifests or namespace workspace-dev."""
    res = subprocess.run(
        ["bash", "scripts/devmesh/render-stack.sh", "core", "--out", str(tmp_path)],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0, f"render-stack.sh failed:\n{res.stdout}\n{res.stderr}"

    yaml_files = list(tmp_path.rglob("*.yaml")) + list(tmp_path.rglob("*.yml"))
    assert len(yaml_files) > 0, "No rendered YAML documents found in --out tree"

    for yf in yaml_files:
        content = yf.read_text()
        assert "mentolder.de" not in content, f"Found 'mentolder.de' in {yf}"
        assert "fleet-manifests" not in content, f"Found 'fleet-manifests' in {yf}"
        assert "workspace-dev" not in content, f"Found 'workspace-dev' in {yf}"


def test_dev_pod_on_devmesh(repo_root: Path):
    """dev-pod runs in workspace on devmesh, uses shared-db, SSH exposed via Tailnet only."""
    res = subprocess.run(
        ["bash", "scripts/devmesh/render-stack.sh", "core"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=True,
    )
    docs = {
        (d["kind"], d["metadata"]["name"]): d
        for d in yaml.safe_load_all(res.stdout)
        if d and "kind" in d and "metadata" in d and "name" in d["metadata"]
    }

    assert ("Deployment", "dev-pod") in docs, "Deployment/dev-pod not found in devmesh render"
    dev_pod = docs["Deployment", "dev-pod"]
    assert dev_pod.get("metadata", {}).get("namespace") == "workspace"

    containers = (
        dev_pod.get("spec", {}).get("template", {}).get("spec", {}).get("containers", [])
    )
    db_url_found = False
    for c in containers:
        for env_entry in c.get("env", []):
            val = str(env_entry.get("value", ""))
            if "shared-db.workspace.svc.cluster.local" in val:
                db_url_found = True
            assert "shared-db-dev" not in val, f"Found shared-db-dev in container {c.get('name')} env {env_entry}"
        for arg in c.get("args", []):
            assert "shared-db-dev" not in str(arg)
    assert db_url_found, "DB-URL containing shared-db.workspace.svc.cluster.local not found in dev-pod containers"

    ssh_services = [
        d for (kind, name), d in docs.items()
        if kind == "Service" and (name == "dev-pod-ssh" or "ssh" in name)
    ]
    assert ssh_services, "dev-pod SSH service not found in devmesh render"
    for svc in ssh_services:
        annotations = svc.get("metadata", {}).get("annotations", {})
        assert annotations.get("tailscale.com/expose") == "true", (
            f"SSH service {svc['metadata']['name']} missing tailscale.com/expose annotation"
        )
        svc_type = svc.get("spec", {}).get("type", "ClusterIP")
        if svc_type == "LoadBalancer":
            assert svc.get("spec", {}).get("loadBalancerClass") == "tailscale", (
                f"SSH service {svc['metadata']['name']} is LoadBalancer without tailscale class"
            )


def test_flux_devmesh_sources_only(repo_root: Path):
    """All YAML documents under flux/clusters/devmesh/ (without bootstrap/) reference allowed sources only."""
    devmesh_flux_dir = repo_root / "flux" / "clusters" / "devmesh"
    assert devmesh_flux_dir.is_dir(), f"{devmesh_flux_dir} does not exist"

    yaml_files = [
        p for p in devmesh_flux_dir.rglob("*.yaml")
        if "bootstrap" not in p.parts
    ] + [
        p for p in devmesh_flux_dir.rglob("*.yml")
        if "bootstrap" not in p.parts
    ]
    assert len(yaml_files) > 0, f"No YAML files found in {devmesh_flux_dir} (excluding bootstrap/)"

    allowed_oci = "oci://ghcr.io/paddione/devmesh-manifests"
    allowed_git = "https://github.com/Paddione/Bachelorprojekt"
    allowed_path = "flux/clusters/devmesh"

    for yf in yaml_files:
        for doc in yaml.safe_load_all(yf.read_text()):
            if not doc:
                continue
            kind = doc.get("kind")
            spec = doc.get("spec", {})
            if kind == "GitRepository":
                assert spec.get("url") == allowed_git, f"GitRepository url {spec.get('url')} in {yf} not allowed"
            elif kind == "OCIRepository":
                assert spec.get("url") == allowed_oci, f"OCIRepository url {spec.get('url')} in {yf} not allowed"
            elif kind == "Kustomization":
                source_ref = spec.get("sourceRef", {})
                source_kind = source_ref.get("kind")
                source_name = source_ref.get("name")
                if source_kind == "OCIRepository":
                    assert source_name == "devmesh-manifests", (
                        f"Kustomization sourceRef {source_ref} in {yf} not devmesh-manifests"
                    )
            elif kind == "FluxInstance":
                sync = spec.get("distribution", {}).get("sync", {})
                if "url" in sync:
                    assert sync.get("url") == allowed_git, f"FluxInstance sync url in {yf} not allowed"
                if "path" in sync:
                    assert sync.get("path") == allowed_path, f"FluxInstance sync path in {yf} not allowed"

            text = yaml.dump(doc)
            assert "fleet-manifests" not in text, f"fleet-manifests found in {yf}"
            assert "clusters/fleet" not in text, f"clusters/fleet found in {yf}"


def test_fleet_dev_components_gone(repo_root: Path, tmp_path: Path):
    """flux-render-artifact.sh aborts on removed 'dev' component; fleet has no ks-dev*.yaml."""
    res = subprocess.run(
        ["bash", "scripts/flux-render-artifact.sh", "--out", str(tmp_path), "--only", "dev"],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )
    assert res.returncode == 2, f"Expected exit code 2, got {res.returncode}. Output:\n{res.stdout}\n{res.stderr}"
    assert "unbekannte Komponente: dev" in (res.stdout + res.stderr)

    fleet_dir = repo_root / "flux" / "clusters" / "fleet"
    ks_dev_files = list(fleet_dir.glob("ks-dev*.yaml"))
    assert not ks_dev_files, f"Expected no ks-dev*.yaml in {fleet_dir}, found: {[f.name for f in ks_dev_files]}"
