"""Tests fuer Cloud-Session-Zugang (ServiceAccount, RBAC und Setup-Skript) [cloud-tailnet-access]."""

import os
import shutil
import subprocess
import yaml
import pytest


def test_cloud_access_kustomize_renders_rbac(repo_root):
    if not shutil.which("kubectl"):
        pytest.skip("kubectl not installed")

    res = subprocess.run(
        ["kubectl", "kustomize", "dev-local/core", "--load-restrictor=LoadRestrictionsNone"],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0, f"kustomize failed: {res.stderr}"

    manifests = list(yaml.safe_load_all(res.stdout))
    
    # Positiv-Anker 1: ServiceAccount cloud-session existiert in workspace
    sa = [m for m in manifests if m and m.get("kind") == "ServiceAccount" and m.get("metadata", {}).get("name") == "cloud-session"]
    assert len(sa) == 1, "ServiceAccount cloud-session fehlt in dev-local/core"
    assert sa[0]["metadata"].get("namespace") == "workspace"

    # Positiv-Anker 2: Secret fuer Token existiert
    secrets = [
        m for m in manifests
        if m and m.get("kind") == "Secret"
        and m.get("type") == "kubernetes.io/service-account-token"
        and m.get("metadata", {}).get("annotations", {}).get("kubernetes.io/service-account.name") == "cloud-session"
    ]
    assert len(secrets) == 1, "Secret vom Typ service-account-token fuer cloud-session fehlt"

    # Positiv-Anker 3: Role cloud-session-role mit genau den erlaubten Rechten
    roles = [m for m in manifests if m and m.get("kind") == "Role" and m.get("metadata", {}).get("name") == "cloud-session-role"]
    assert len(roles) == 1, "Role cloud-session-role fehlt"
    role = roles[0]
    assert role["metadata"].get("namespace") == "workspace"

    # Verifiziere Regeln der Role
    rules = role.get("rules", [])
    assert len(rules) == 2, f"Erwartet genau 2 Rules in Role, bekommen: {rules}"
    
    # Regel 1: get/list auf pods, pods/log, services, endpoints
    r1 = next((r for r in rules if "get" in r.get("verbs", [])), None)
    assert r1 is not None
    assert set(r1["verbs"]) == {"get", "list"}
    assert set(r1["resources"]) == {"pods", "pods/log", "services", "endpoints"}

    # Regel 2: create auf pods/portforward
    r2 = next((r for r in rules if "create" in r.get("verbs", [])), None)
    assert r2 is not None
    assert set(r2["verbs"]) == {"create"}
    assert set(r2["resources"]) == {"pods/portforward"}

    # Positiv-Anker 4: RoleBinding verbindet SA mit Role
    rbs = [m for m in manifests if m and m.get("kind") == "RoleBinding" and m.get("metadata", {}).get("name") == "cloud-session-binding"]
    assert len(rbs) == 1, "RoleBinding cloud-session-binding fehlt"
    rb = rbs[0]
    assert rb.get("roleRef", {}).get("name") == "cloud-session-role"
    assert any(s.get("name") == "cloud-session" for s in rb.get("subjects", []))

    # Negativ-Anker: keine ClusterRole(Binding) fuer cloud-session, kein '*', kein Zugriff auf secrets
    cluster_roles = [m for m in manifests if m and m.get("kind") in ("ClusterRole", "ClusterRoleBinding") and "cloud-session" in m.get("metadata", {}).get("name", "")]
    assert len(cluster_roles) == 0, "Darf keine ClusterRole oder ClusterRoleBinding fuer cloud-session geben"

    for r in rules:
        assert "*" not in r.get("verbs", [])
        assert "*" not in r.get("resources", [])
        assert "secrets" not in r.get("resources", [])


def test_cloud_tailnet_script_behavior(repo_root):
    script = repo_root / "scripts" / "cloud" / "cloud-tailnet.sh"
    assert script.exists(), "scripts/cloud/cloud-tailnet.sh fehlt"
    assert os.access(script, os.X_OK), "scripts/cloud/cloud-tailnet.sh ist nicht ausfuehrbar"

    # Positiv-Anker zuerst: status im Dry-Run nennt Kontext devmesh und die drei Ports 18235, 13001, 13005
    res = subprocess.run(
        [str(script), "status"],
        cwd=repo_root,
        env={**os.environ, "DRY_RUN": "1"},
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0, f"status failed: {res.stderr}"
    assert "devmesh" in res.stdout
    assert "fleet" not in res.stdout
    assert "18235" in res.stdout
    assert "13001" in res.stdout
    assert "13005" in res.stdout

    # (a) up ohne TS_AUTHKEY endet mit Exit 2 und nennt die Variable beim Namen, aber nie ihren Wert
    res_no_key = subprocess.run(
        [str(script), "up"],
        cwd=repo_root,
        env={k: v for k, v in os.environ.items() if k != "TS_AUTHKEY"},
        capture_output=True,
        text=True,
    )
    assert res_no_key.returncode == 2, f"up ohne TS_AUTHKEY erwartete rc=2, bekam {res_no_key.returncode}"
    assert "TS_AUTHKEY" in res_no_key.stderr or "TS_AUTHKEY" in res_no_key.stdout

    # (b) up uebergibt Key ueber --auth-key=file: aus /dev/shm und loescht sie danach
    # (c) fehlt /dev/net/tun, waehlt up --tun=userspace-networking
    res_up = subprocess.run(
        [str(script), "up"],
        cwd=repo_root,
        env={**os.environ, "DRY_RUN": "1", "TS_AUTHKEY": "tskey-auth-secret-val", "MOCK_NO_TUN": "1"},
        capture_output=True,
        text=True,
    )
    assert res_up.returncode == 0, f"up dry-run failed: {res_up.stderr}"
    assert "--auth-key=file:/dev/shm/" in res_up.stdout
    assert "tskey-auth-secret-val" not in res_up.stdout  # Key steht nie in Kommandozeile
    assert "--tun=userspace-networking" in res_up.stdout

    # (d) forward leitet svc/llm-services Ports 18235, 13001, 13005 mit --context devmesh und -n workspace weiter
    # (e) der Kontext ist devmesh, nie fleet
    res_fwd = subprocess.run(
        [str(script), "forward"],
        cwd=repo_root,
        env={**os.environ, "DRY_RUN": "1"},
        capture_output=True,
        text=True,
    )
    assert res_fwd.returncode == 0, f"forward dry-run failed: {res_fwd.stderr}"
    assert "svc/llm-services" in res_fwd.stdout
    assert "--context devmesh" in res_fwd.stdout
    assert "-n workspace" in res_fwd.stdout
    assert "fleet" not in res_fwd.stdout
    assert "18235" in res_fwd.stdout
    assert "13001" in res_fwd.stdout
    assert "13005" in res_fwd.stdout

