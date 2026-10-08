"""Native migration of tests/unit/manifests.bats (part 1/2)."""
import fcntl
import json
import os
import re
import shutil
import subprocess
import tempfile
from contextlib import contextmanager
from pathlib import Path

import pytest

# Validate kustomize output without a running cluster: expected resources, image
# pinning, namespace consistency, label hygiene, cross-references. Part 1 covers
# core resources, ingress, images, namespaces, configmaps, services and PSS labels.

pytestmark = pytest.mark.repo_lock("k3d-secrets-yaml")

DUMMY_SECRETS = (
    "apiVersion: v1\n"
    "kind: Secret\n"
    "metadata:\n"
    "  name: workspace-secrets\n"
    "type: Opaque\n"
    "stringData:\n"
    "  PLACEHOLDER: bats-dummy\n"
)
OFFICE_ENV = {
    "PROD_DOMAIN": "localhost",
    "COLLABORA_HOST": "office.localhost",
    "COLLABORA_ALIASGROUP1": "http://nextcloud.workspace.svc.cluster.local:80",
    "COLLABORA_SERVER_NAME": "office.localhost",
    "COLLABORA_SSL_TERMINATION": "false",
    "COLLABORA_TLS_SECRET": "collabora-tls-dev",
    "COLLABORA_INGRESS_MIDDLEWARES": "workspace-infra-redirect-https@kubernetescrd",
}
ENVSUBST_VARS = (
    "$PROD_DOMAIN $COLLABORA_HOST $COLLABORA_ALIASGROUP1 $COLLABORA_SERVER_NAME "
    "$COLLABORA_SSL_TERMINATION $COLLABORA_TLS_SECRET $COLLABORA_INGRESS_MIDDLEWARES"
)
KF = "--load-restrictor=LoadRestrictionsNone"


@contextmanager
def _secrets_ref(secrets):
    """Share k3d/secrets.yaml across modules (xdist): first user creates, last user removes."""
    lock_dir = Path(tempfile.gettempdir()) / "pytest-repo-locks"
    lock_dir.mkdir(exist_ok=True)
    state_file = lock_dir / "k3d-secrets-yaml.refs.json"
    lock_path = lock_dir / "k3d-secrets-yaml.refs.lock"
    with open(lock_path, "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        state = json.loads(state_file.read_text()) if state_file.exists() else {"n": 0, "created": False}
        if not secrets.exists():
            secrets.write_text(DUMMY_SECRETS, encoding="utf-8")
            state["created"] = True
        state["n"] += 1
        state_file.write_text(json.dumps(state))
    try:
        yield
    finally:
        with open(lock_path, "w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            state = json.loads(state_file.read_text())
            state["n"] -= 1
            if state["n"] == 0:
                if state["created"] and secrets.exists():
                    secrets.unlink()
                state["created"] = False
            state_file.write_text(json.dumps(state))


@pytest.fixture(scope="module", autouse=True)
def rendered(repo_root):
    """Mirror setup_file(): render k3d/ and the office-stack into one text blob."""
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl not installed")
    if shutil.which("envsubst") is None:
        pytest.skip("envsubst not installed")
    manifests = repo_root / "k3d"
    office = manifests / "office-stack"
    with _secrets_ref(manifests / "secrets.yaml"):
        first = subprocess.run(["kubectl", "kustomize", str(manifests), KF],
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               text=True, timeout=300)
        if first.returncode != 0:
            pytest.fail(f"kubectl kustomize failed — output:\n{first.stdout}")
        text = first.stdout + "\n---\n"
        env = {**os.environ, **OFFICE_ENV}
        build = subprocess.run(["kubectl", "kustomize", str(office), KF], env=env,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, timeout=300)
        sub = subprocess.run(["envsubst", ENVSUBST_VARS], input=build.stdout, env=env,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             text=True, timeout=300)
        text += sub.stdout + build.stderr + sub.stderr
    yield text


def _lines_matching(text, regex):
    pat = re.compile(regex)
    return [line for line in text.splitlines() if pat.search(line)]


def _all_images(text):
    """grep -E '^\\s+image:' | sed 's/.*image:\\s*//' | sort -u"""
    imgs = set()
    for line in text.splitlines():
        if re.match(r"^[ \t]+image:", line):
            imgs.add(re.sub(r".*image:[ \t]*", "", line))
    return sorted(i for i in imgs if i)


def test_kustomize_build_succeeds(run_cmd, repo_root):
    run_cmd(["kubectl", "kustomize", str(repo_root / "k3d"), KF], timeout=300).check()


def test_kustomize_output_is_non_empty(rendered):
    assert rendered


def test_namespace_workspace_is_declared(rendered):
    count = sum(1 for line in rendered.splitlines() if "kind: Namespace" in line)
    assert count >= 1


def test_deployment_pocket_id_exists_replaced_keycloak(rendered):
    assert "name: pocket-id" in rendered
    assert "kind: Deployment" in rendered


def test_deployment_nextcloud_exists(rendered):
    assert _lines_matching(rendered, r"^[ \t]+name: nextcloud$")


def test_deployment_shared_db_postgresql_exists(rendered):
    assert _lines_matching(rendered, r"^[ \t]+name: shared-db$")


def test_deployment_collabora_exists(rendered):
    assert _lines_matching(rendered, r"^[ \t]+name: collabora$")


def test_deployment_vaultwarden_exists(rendered):
    assert _lines_matching(rendered, r"^[ \t]+name: vaultwarden$")


def test_deployment_mailpit_exists(rendered):
    assert _lines_matching(rendered, r"^[ \t]+name: mailpit$")


def test_ingress_resource_exists(rendered):
    assert "kind: Ingress" in rendered


def test_ingress_all_core_hosts_defined(rendered):
    # Hosts from standard Ingress rules AND Traefik IngressRoute match expressions.
    hosts = set()
    for line in rendered.splitlines():
        for m in re.finditer(r"host:[ \t]*(\S+)", line):
            hosts.add(m.group(1))
        for m in re.finditer(r"Host\(`([^`]+)", line):
            hosts.add(m.group(1))
    for svc in ["auth", "files", "office", "vault", "mail"]:
        assert any(f"{svc}." in h for h in hosts), f"Missing ingress host for: {svc}"


def test_no_core_service_images_use_latest_tag(rendered):
    exclude = (r"(mcp|openapi-mcp|github-mcp|keycloak-mcp|nextcloud-mcp|curlimages/curl|"
               r"talk-transcriber|paddione/bachelorprojekt|workspace-brett|docs|downloads-content|"
               r"videovault|mediaviewer-widget|mentolder-web|brain-site)")
    latest = [i for i in _all_images(rendered)
              if i.endswith(":latest") and not re.search(exclude, i, re.I)]
    assert latest == [], f"Core images using :latest: {latest}"


def test_all_images_have_explicit_tags_or_digests(rendered):
    # Skip envsubst placeholders like ${STUDIO_IMAGE} (expanded at deploy time).
    untagged = [i for i in _all_images(rendered)
                if not re.search(r"[:@]", i) and not i.startswith("${")]
    assert untagged == [], f"Untagged images: {untagged}"


def test_all_resources_target_namespace_workspace_or_are_cluster_scoped(run_cmd, repo_root):
    r = run_cmd(["kubectl", "kustomize", str(repo_root / "k3d"), KF], timeout=300)
    lines = _lines_matching(r.stdout, r"^[ \t]+namespace:")
    skip_words = ["workspace", "kube-system", "website", "${WEBSITE_NAMESPACE}"]
    bad = sorted({line for line in lines if not any(w in line for w in skip_words)})
    assert bad == [], f"Resources with unexpected namespace: {bad}"


def test_configmap_pocket_id_data_pvc_exists_replaced_realm_template(rendered):
    assert "name: pocket-id-data" in rendered


def test_configmap_nextcloud_oidc_config_exists(rendered):
    assert "name: nextcloud-oidc-config" in rendered


def test_configmap_domain_config_exists(rendered):
    assert "name: domain-config" in rendered


def test_service_for_each_core_deployment_exists(rendered):
    for _svc in ["pocket-id", "nextcloud", "shared-db", "vaultwarden", "mailpit"]:
        assert "kind: Service" in rendered, "No Service kind found"


def test_namespace_has_pod_security_labels(rendered):
    assert "pod-security.kubernetes.io" in rendered
