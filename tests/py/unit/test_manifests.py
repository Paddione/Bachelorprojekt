"""Tests for validating kustomize manifests (migrated from tests/unit/manifests.bats)."""

import glob
import os
from pathlib import Path
import re
import shutil
import subprocess
import pytest
import yaml


@pytest.fixture(scope="module")
def rendered_manifests(repo_root: Path):
    if not shutil.which("kubectl"):
        pytest.skip("kubectl not installed")

    manifests_dir = repo_root / "k3d"
    office_dir = repo_root / "k3d" / "office-stack"
    secrets_yaml = manifests_dir / "secrets.yaml"
    created_dummy = False

    if not secrets_yaml.exists():
        created_dummy = True
        secrets_yaml.write_text(
            "apiVersion: v1\nkind: Secret\nmetadata:\n  name: workspace-secrets\ntype: Opaque\nstringData:\n  PLACEHOLDER: bats-dummy\n"
        )

    try:
        res1 = subprocess.run(
            ["kubectl", "kustomize", str(manifests_dir), "--load-restrictor=LoadRestrictionsNone"],
            capture_output=True,
            text=True,
            check=True,
        )
        rendered_content = res1.stdout + "\n---\n"

        env = os.environ.copy()
        env.update(
            {
                "PROD_DOMAIN": "localhost",
                "COLLABORA_HOST": "office.localhost",
                "COLLABORA_ALIASGROUP1": "http://nextcloud.workspace.svc.cluster.local:80",
                "COLLABORA_SERVER_NAME": "office.localhost",
                "COLLABORA_SSL_TERMINATION": "false",
                "COLLABORA_TLS_SECRET": "collabora-tls-dev",
                "COLLABORA_INGRESS_MIDDLEWARES": "workspace-infra-redirect-https@kubernetescrd",
            }
        )

        res2 = subprocess.run(
            ["kubectl", "kustomize", str(office_dir)],
            capture_output=True,
            text=True,
            check=True,
            env=env,
        )

        # expand placeholders if envsubst is available or via python substitute
        office_out = res2.stdout
        if shutil.which("envsubst"):
            sub_res = subprocess.run(
                [
                    "envsubst",
                    "$PROD_DOMAIN $COLLABORA_HOST $COLLABORA_ALIASGROUP1 $COLLABORA_SERVER_NAME $COLLABORA_SSL_TERMINATION $COLLABORA_TLS_SECRET $COLLABORA_INGRESS_MIDDLEWARES",
                ],
                input=office_out,
                capture_output=True,
                text=True,
                check=True,
                env=env,
            )
            office_out = sub_res.stdout

        rendered_content += office_out
        yield rendered_content
    finally:
        if created_dummy and secrets_yaml.exists():
            secrets_yaml.unlink()


def _all_images(rendered: str) -> list[str]:
    images = []
    for line in rendered.splitlines():
        if re.match(r"^\s+image:", line):
            img = re.sub(r"^\s+image:\s*", "", line).strip()
            images.append(img)
    return sorted(set(images))


def test_kustomize_build_succeeds(rendered_manifests: str):
    assert len(rendered_manifests) > 0


def test_expected_core_resources(rendered_manifests: str):
    assert "kind: Namespace" in rendered_manifests
    assert "name: pocket-id" in rendered_manifests
    assert re.search(r"^\s+name: nextcloud$", rendered_manifests, re.M)
    assert re.search(r"^\s+name: shared-db$", rendered_manifests, re.M)
    assert re.search(r"^\s+name: collabora$", rendered_manifests, re.M)
    assert re.search(r"^\s+name: vaultwarden$", rendered_manifests, re.M)
    assert re.search(r"^\s+name: mailpit$", rendered_manifests, re.M)


def test_ingress_resources_and_core_hosts(rendered_manifests: str):
    assert "kind: Ingress" in rendered_manifests
    hosts = set(re.findall(r"host:\s*(\S+)", rendered_manifests))
    hosts.update(re.findall(r"Host\(`([^`]+)`\)", rendered_manifests))
    all_hosts = "\n".join(hosts)
    for svc in ["auth", "files", "office", "vault", "mail"]:
        assert f"{svc}." in all_hosts, f"Missing ingress host for {svc}"


def test_image_pinning_no_latest_for_core(rendered_manifests: str):
    latest_images = [
        img
        for img in _all_images(rendered_manifests)
        if img.endswith(":latest")
        and not re.search(
            r"(mcp|openapi-mcp|github-mcp|keycloak-mcp|nextcloud-mcp|curlimages/curl|talk-transcriber|paddione/bachelorprojekt|workspace-brett|docs|downloads-content|videovault|mediaviewer-widget|mentolder-web|brain-site)",
            img,
            re.I,
        )
    ]
    assert not latest_images, f"Core images using :latest: {latest_images}"


def test_all_images_have_explicit_tags_or_digests(rendered_manifests: str):
    untagged = [
        img
        for img in _all_images(rendered_manifests)
        if not re.search(r"[:@]", img) and not img.startswith("${")
    ]
    assert not untagged, f"Untagged images: {untagged}"


def test_namespace_consistency(repo_root: Path):
    if not shutil.which("kubectl"):
        pytest.skip("kubectl not installed")
    manifests_dir = repo_root / "k3d"
    res = subprocess.run(
        ["kubectl", "kustomize", str(manifests_dir), "--load-restrictor=LoadRestrictionsNone"],
        capture_output=True,
        text=True,
    )
    bad_ns = []
    for line in res.stdout.splitlines():
        if re.match(r"^\s+namespace:", line):
            ns = line.split(":", 1)[1].strip()
            if ns not in ["workspace", "kube-system", "website", "${WEBSITE_NAMESPACE}"]:
                bad_ns.append(ns)
    assert not bad_ns, f"Resources with unexpected namespace: {bad_ns}"


def test_configmaps_exist(rendered_manifests: str):
    assert "name: pocket-id-data" in rendered_manifests
    assert "name: nextcloud-oidc-config" in rendered_manifests
    assert "name: domain-config" in rendered_manifests


def test_services_exist_for_core_deployments(rendered_manifests: str):
    for svc in ["pocket-id", "nextcloud", "shared-db", "vaultwarden", "mailpit"]:
        assert "kind: Service" in rendered_manifests


def test_namespace_pod_security_labels(rendered_manifests: str):
    assert "pod-security.kubernetes.io" in rendered_manifests


def test_backup_cronjob_structure(rendered_manifests: str, repo_root: Path):
    assert "kind: CronJob" in rendered_manifests
    assert "name: pvc-backup" in rendered_manifests
    assert "nextcloud-data-pvc" in rendered_manifests
    assert "vaultwarden-data-pvc" in rendered_manifests

    cronjob_yaml = (repo_root / "k3d" / "pvc-backup-cronjob.yaml").read_text()
    assert "WARNING: Filen upload failed" not in cronjob_yaml
    assert "exit 1" in cronjob_yaml


def test_persistent_volume_claims_exist(rendered_manifests: str):
    assert "kind: PersistentVolumeClaim" in rendered_manifests


def test_no_plaintext_passwords_in_deployment_env(rendered_manifests: str):
    lines = rendered_manifests.splitlines()
    violations = []
    for i, line in enumerate(lines):
        if "value:" in line and i > 0 and "password" in lines[i - 1].lower():
            if re.search(r"valueFrom|secretKeyRef|configMapKeyRef|\$\(", line, re.I):
                continue
            if re.search(
                r'value: (admin|devadmin|invoiceninja|keycloak|postgres|nextcloud|opensearch|outline|website|password|""|"true"|"false")|value: [a-z]+@|value: "[0-9]+"',
                line,
                re.I,
            ):
                continue
            if re.search(r'value: "?https?"?$|value: "?https?://', line, re.I):
                continue
            if re.search(r'value: "?\$\{[A-Z_]+\}"?', line, re.I):
                continue
            violations.append(line)
    assert not violations, f"Possible hardcoded passwords: {violations}"


def test_prod_kustomize_no_workspace_secrets_with_data(repo_root: Path):
    if not shutil.which("kubectl"):
        pytest.skip("kubectl not installed")

    def is_overlay(d):
        if not os.path.isdir(d):
            return False
        for k in ("kustomization.yaml", "kustomization.yml", "Kustomization"):
            p = os.path.join(d, k)
            if os.path.exists(p):
                with open(p) as fh:
                    if "kind: Component" in fh.read():
                        return False
                return True
        return False

    overlays = sorted(
        o
        for o in (
            glob.glob(f"{repo_root}/prod*") + glob.glob(f"{repo_root}/prod*/*")
        )
        if is_overlay(o)
    )

    found = []
    for overlay in overlays:
        res = subprocess.run(
            ["kubectl", "kustomize", overlay, "--load-restrictor=LoadRestrictionsNone"],
            capture_output=True,
            text=True,
        )
        if res.returncode != 0:
            continue
        try:
            for doc in yaml.safe_load_all(res.stdout):
                if not doc:
                    continue
                if (
                    doc.get("kind") == "Secret"
                    and doc.get("metadata", {}).get("name") == "workspace-secrets"
                    and (doc.get("stringData") or doc.get("data"))
                ):
                    found.append(overlay)
        except yaml.constructor.ConstructorError:
            pass

    assert not found, f"workspace-secrets Secret with data found in: {found}"


def test_prod_overlays_billing_dunning_detection_not_workspace_ns(repo_root: Path):
    if not shutil.which("kubectl"):
        pytest.skip("kubectl not installed")

    def is_overlay(d):
        if not os.path.isdir(d):
            return False
        for k in ("kustomization.yaml", "kustomization.yml", "Kustomization"):
            p = os.path.join(d, k)
            if os.path.exists(p):
                with open(p) as fh:
                    if "kind: Component" in fh.read():
                        return False
                return True
        return False

    overlays = sorted(
        set(
            d
            for d in glob.glob(f"{repo_root}/prod-*") + glob.glob(f"{repo_root}/prod-*/*")
            if is_overlay(d)
        )
    )
    bad = []
    for ov in overlays:
        r = subprocess.run(
            ["kubectl", "kustomize", ov, "--load-restrictor=LoadRestrictionsNone"],
            capture_output=True,
            text=True,
        )
        if r.returncode != 0:
            continue
        try:
            for doc in yaml.safe_load_all(r.stdout):
                if not doc:
                    continue
                if (
                    doc.get("kind") == "CronJob"
                    and doc.get("metadata", {}).get("name") == "billing-dunning-detection"
                ):
                    cmd = " ".join(
                        doc["spec"]["jobTemplate"]["spec"]["template"]["spec"]["containers"][0].get(
                            "command", []
                        )
                    )
                    if "website.workspace.svc" in cmd:
                        bad.append(f"{os.path.basename(ov)}: {cmd}")
        except yaml.constructor.ConstructorError:
            pass
    assert not bad, f"dunning CronJob still targets workspace ns: {bad}"


def test_taskfile_does_not_corrupt_k8s_expansions_with_sed(repo_root: Path):
    res = subprocess.run(
        ["grep", "-rF", "sed 's/\\$([a-zA-Z0-9_]*)/\\${1}/g'", str(repo_root / "Taskfile.yml")],
        capture_output=True,
        text=True,
    )
    assert res.returncode != 0


def test_website_overlay_allows_egress_to_workspace_office(repo_root: Path):
    if not shutil.which("kubectl"):
        pytest.skip("kubectl not installed")
    overlay = repo_root / "prod-fleet" / "website-mentolder"
    out = subprocess.run(
        ["kubectl", "kustomize", str(overlay), "--load-restrictor=LoadRestrictionsNone"],
        capture_output=True,
        text=True,
        check=True,
    )

    def allows_office(doc):
        if not doc or doc.get("kind") != "NetworkPolicy":
            return False
        spec = doc.get("spec", {})
        if "Egress" not in (spec.get("policyTypes") or []):
            return False
        for rule in spec.get("egress") or []:
            for peer in rule.get("to") or []:
                ns = (peer.get("namespaceSelector") or {}).get("matchLabels") or {}
                if ns.get("kubernetes.io/metadata.name") == "workspace-office":
                    return True
        return False

    found = any(allows_office(d) for d in yaml.safe_load_all(out.stdout))
    assert found, "MISSING: no NetworkPolicy grants egress to workspace-office"


def test_network_policies_grant_egress_to_apiserver(rendered_manifests: str):
    docs = list(yaml.safe_load_all(rendered_manifests))

    def egress_to(doc, cidr, port):
        if not doc or doc.get("kind") != "NetworkPolicy":
            return False
        spec = doc.get("spec", {})
        if "Egress" not in (spec.get("policyTypes") or []):
            return False
        for rule in spec.get("egress") or []:
            cidrs = {(p.get("ipBlock") or {}).get("cidr") for p in (rule.get("to") or [])}
            ports = {pr.get("port") for pr in (rule.get("ports") or [])}
            if cidr in cidrs and (not ports or port in ports):
                return True
        return False

    node_ok = any(egress_to(d, "10.20.0.0/24", 6443) for d in docs)
    clusterip_ok = any(egress_to(d, "10.43.0.0/16", 443) for d in docs)
    assert node_ok and clusterip_ok, f"MISSING apiserver egress: node={node_ok}, clusterip={clusterip_ok}"


def test_pvc_backup_cronjob_invariants(repo_root: Path):
    cronjob_yaml = (repo_root / "k3d" / "pvc-backup-cronjob.yaml").read_text()
    assert not re.search(r"^\s*NS=workspace\s*$", cronjob_yaml, re.M)
    assert "/var/run/secrets/kubernetes.io/serviceaccount/namespace" in cronjob_yaml
    for line in cronjob_yaml.splitlines():
        if not line.strip().startswith("#"):
            assert not re.search(r"k3s-[123]|k3w-[123]", line)

    assert "get pvc vaultwarden-data-pvc -o jsonpath=" in cronjob_yaml
    assert '[ "$VW_SC" = "longhorn" ]' in cronjob_yaml
    for line in cronjob_yaml.splitlines():
        if not line.strip().startswith("#"):
            assert 'CLONES="vaultwarden-data-backup-clone' not in line

    assert "--wait=true --timeout=120s" in cronjob_yaml
    assert "stuck in Terminating" in cronjob_yaml
    assert "deletionTimestamp" in cronjob_yaml
    assert "delete jobs -l app=pvc-backup,role=mounter" in cronjob_yaml
    assert "ttlSecondsAfterFinished: 86400" in cronjob_yaml


def test_tests_results_retention_affinity(repo_root: Path):
    retention_yaml = (repo_root / "k3d" / "tests-retention-cronjob.yaml").read_text()
    for line in retention_yaml.splitlines():
        if not line.strip().startswith("#"):
            assert "node-location" not in line
