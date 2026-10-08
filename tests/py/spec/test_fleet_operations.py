"""Tests migrating tests/spec/fleet-operations.bats and tests/spec/fleet-operations/* specs to pytest."""

import os
import re
import subprocess
from pathlib import Path
import pytest
import yaml


def _kustomize_build_env(repo_root: Path, brand: str) -> str:
    # Resolve env vars via env-resolve.sh and run kubectl kustomize
    cmd = (
        f"source scripts/env-resolve.sh '{brand}' >/dev/null 2>&1 && "
        f"kubectl kustomize 'prod-fleet/{brand}' --load-restrictor=LoadRestrictionsNone 2>/dev/null | envsubst"
    )
    res = subprocess.run(["bash", "-c", cmd], cwd=repo_root, capture_output=True, text=True)
    assert res.returncode == 0, f"kustomize build for {brand} failed: {res.stderr}"
    return res.stdout


# ── fleet-operations.bats ──────────────────────────────────────────────────

def test_traefik_values(repo_root: Path):
    traefik_values_file = repo_root / "prod" / "traefik-values.yaml"
    assert traefik_values_file.is_file()
    data = yaml.safe_load(traefik_values_file.read_text())

    # externalTrafficPolicy must stay absent (null) as long as service.spec.type is ClusterIP
    assert data.get("service", {}).get("spec", {}).get("externalTrafficPolicy") is None
    assert data.get("deployment", {}).get("kind") == "DaemonSet"

    # nodeAffinity values
    affinity = (
        data.get("affinity", {})
        .get("nodeAffinity", {})
        .get("requiredDuringSchedulingIgnoredDuringExecution", {})
        .get("nodeSelectorTerms", [{}])[0]
        .get("matchExpressions", [{}])[0]
        .get("values", [])
    )
    assert sorted(affinity) == ["pk-hetzner-4", "pk-hetzner-6", "pk-hetzner-8"]

    # cloud-init
    cloud_init = (repo_root / "prod" / "cloud-init.yaml").read_text()
    assert "traefik-values.yaml" in cloud_init
    assert "--set deployment.kind=DaemonSet" not in cloud_init

    # orphaned prod-korczewski/traefik-values.yaml is gone
    assert not (repo_root / "prod-korczewski" / "traefik-values.yaml").is_file()

    # service type ClusterIP & hostPorts
    assert data.get("service", {}).get("spec", {}).get("type") == "ClusterIP"
    assert data.get("ports", {}).get("web", {}).get("hostPort") == 80
    assert data.get("ports", {}).get("websecure", {}).get("hostPort") == 443

    # updateStrategy
    strat = data.get("updateStrategy", {}).get("rollingUpdate", {})
    assert strat.get("maxUnavailable") == 1
    assert strat.get("maxSurge") == 0


# ── cronjob-hygiene.bats ───────────────────────────────────────────────────

def test_cronjob_hygiene(repo_root: Path):
    sp = repo_root / "k3d" / "cronjob-scheduled-publish.yaml"
    tr = repo_root / "k3d" / "tests-retention-cronjob.yaml"
    assert sp.is_file()
    assert tr.is_file()

    sp_text = sp.read_text()
    assert "${WEBSITE_NAMESPACE}" in sp_text
    assert 'Bearer $${CRON_SECRET}' in sp_text
    assert "http_code" in sp_text

    for f in [sp, tr]:
        docs = list(yaml.safe_load_all(f.read_text()))
        cj = next(d for d in docs if d and d.get("kind") == "CronJob")
        job_spec = cj.get("spec", {}).get("jobTemplate", {}).get("spec", {})
        assert job_spec.get("ttlSecondsAfterFinished") is not None
        assert cj.get("spec", {}).get("failedJobsHistoryLimit") is not None

    patch = repo_root / "prod-korczewski" / "patch-cronjob-urls.yaml"
    assert patch.is_file()
    patch_text = patch.read_text()
    assert "kind: CronJob" in patch_text
    # scheduled-publish shouldn't have leftover hardcoded url
    if "name: scheduled-publish" in patch_text:
        match = re.search(r"name: scheduled-publish.*?(?:---|\Z)", patch_text, re.DOTALL)
        if match:
            assert "website.website-korczewski.svc.cluster.local" not in match.group(0)


# ── dev-env-split.bats ─────────────────────────────────────────────────────

def test_dev_env_split(repo_root: Path):
    renderer = repo_root / "scripts" / "flux-render-artifact.sh"
    dev_cluster_yml = repo_root / "environments" / "dev-cluster.yaml"
    dev_yml = repo_root / "environments" / "dev.yaml"
    schema = repo_root / "environments" / "schema.yaml"

    assert "env-resolve.sh dev-cluster" in renderer.read_text()
    assert "dev-cluster.yaml" in dev_yml.read_text()

    dev_c_text = dev_cluster_yml.read_text()
    assert re.search(r"DEV_DOMAIN:", dev_c_text)
    assert re.search(r"dev\.mentolder\.de", dev_c_text)

    schema_text = schema.read_text()
    match = re.search(r"name: DEV_DOMAIN.*?name: DEV_NODE", schema_text, re.DOTALL)
    assert match
    assert "dev-cluster.yaml" in match.group(0)


# ── dev-node-binding.bats ──────────────────────────────────────────────────

def test_dev_node_binding(repo_root: Path):
    dev_stack = repo_root / "k3d" / "dev-stack"
    binding = dev_stack / "dev-node-binding.yaml"
    kustomization = dev_stack / "kustomization.yaml"
    wg = repo_root / "wireguard" / "wg-mesh-nodes.yaml"

    assert binding.is_file()
    patches = yaml.safe_load(binding.read_text()) or []

    toleration_found = False
    affinity_found = False
    for p in patches:
        if isinstance(p, dict):
            if p.get("path") == "/spec/template/spec/tolerations":
                for t in p.get("value", []):
                    if t.get("key") == "role" and t.get("effect") == "NoSchedule":
                        toleration_found = True
            elif p.get("path") == "/spec/template/spec/affinity":
                aff = p.get("value", {})
                nst = aff.get("nodeAffinity", {}).get("requiredDuringSchedulingIgnoredDuringExecution", {}).get("nodeSelectorTerms", [])
                for term in nst:
                    for expr in term.get("matchExpressions", []):
                        if expr.get("key") == "role" and "dev" in expr.get("values", []):
                            affinity_found = True

    assert toleration_found, f"Toleration role=dev:NoSchedule not found in {binding}"
    assert affinity_found, f"nodeAffinity role=dev not found in {binding}"
    assert "dev-node-binding.yaml" in kustomization.read_text()

    wg_data = yaml.safe_load(wg.read_text()) or {}
    workers = wg_data.get("fleet", {}).get("workers", [])
    found_gekko = any(w.get("name") == "gekko-hetzner-2" and w.get("k8s_node") for w in workers if isinstance(w, dict))
    assert found_gekko, f"gekko-hetzner-2 not in fleet workers as k8s_node in {wg}"


# ── firewall-program-match.bats ────────────────────────────────────────────

def test_firewall_program_match(repo_root: Path):
    script = repo_root / "scripts" / "llm" / "harden-gpu-firewall.ps1"
    assert script.is_file()
    text = script.read_text()
    assert "[string]$Program" in text
    assert not re.search(r"GetFileName\(\$dir\)", text)
    assert re.search(r"\$_\.Program.*-(i?eq|like)\s+\$(Program|normalizedProgram|programPath)", text)


# ── ghcr-pull-secret.bats ──────────────────────────────────────────────────

def test_ghcr_pull_secret_in_reflector(repo_root: Path):
    refl = repo_root / "prod" / "reflector.yaml"
    assert refl.is_file()
    text = refl.read_text()

    assert "name: tls-sync" in text
    assert "ghcr-pull-secret" in text
    assert "workspace-office" in text
    assert "WEBSITE_NAMESPACE" in text
    assert "dockerconfigjson" in text

    for overlay in ["mentolder", "korczewski", "staging"]:
        cmd = (
            f"source scripts/env-resolve.sh '{overlay}' >/dev/null 2>&1 && "
            f"kubectl kustomize 'prod-fleet/{overlay}' --load-restrictor=LoadRestrictionsNone 2>/dev/null | envsubst | awk '/name: tls-sync/,/^---$/'"
        )
        res = subprocess.run(["bash", "-c", cmd], cwd=repo_root, capture_output=True, text=True)
        assert res.returncode == 0
        block = res.stdout
        assert "sync_secret" in block, f"{overlay}: tls-sync-Block ohne sync_secret"
        assert "ghcr-pull-secret" in block, f"{overlay}: tls-sync verteilt ghcr-pull-secret nicht"
        assert "${" not in block, f"{overlay}: unsubstituierte Platzhalter im tls-sync-Block"


# ── internal-endpoints.bats ────────────────────────────────────────────────

def test_internal_endpoints(repo_root: Path):
    schema = repo_root / "environments" / "schema.yaml"
    cm = repo_root / "k3d" / "configmap-domains.yaml"
    fleet_m = repo_root / "environments" / "fleet-mentolder.yaml"
    bge_patch = repo_root / "prod-fleet" / "mentolder" / "bge-hosts-patch.yaml"
    gateway_ing = repo_root / "k3d" / "llm-gateway-ingress.yaml"

    assert "name: BGE_EMBED_HOST" in schema.read_text()
    assert "name: BGE_RERANK_HOST" in schema.read_text()
    assert 'BGE_EMBED_HOST: "embed.localhost"' in cm.read_text()
    assert 'BGE_EMBED_HOST: "bge-embed.mentolder.de"' in fleet_m.read_text()
    assert 'BGE_RERANK_HOST: "bge-rerank.mentolder.de"' in fleet_m.read_text()
    assert "bge-embed.mentolder.de" in bge_patch.read_text()
    assert "bge-rerank.mentolder.de" in bge_patch.read_text()

    assert "name: wg-only" in bge_patch.read_text()
    assert "ipWhiteList" in gateway_ing.read_text()
    assert "192.168.100.0/24" in gateway_ing.read_text()

    # shared-db not exposed on public entrypoints or NodePort/LB
    hits = []
    for search_dir in [repo_root / "k3d", repo_root / "prod-fleet"]:
        for yaml_path in search_dir.rglob("*.yaml"):
            if "shared-db-endpoint-policy.yaml" in yaml_path.name or "dev-stack" in str(yaml_path):
                continue
            try:
                cnt = yaml_path.read_text()
                if "shared-db" in cnt and re.search(r"(type:\s*(NodePort|LoadBalancer))|IngressRouteTCP", cnt):
                    hits.append(str(yaml_path))
            except Exception:
                pass
    assert not hits, f"public exposure candidates: {hits}"

    policy_cm = repo_root / "k3d" / "shared-db-endpoint-policy.yaml"
    assert policy_cm.is_file()
    assert "no-public-exposure" in policy_cm.read_text()
    assert "sish" in policy_cm.read_text().lower()


# ── legacy-secrets-fleet.bats ──────────────────────────────────────────────

def test_legacy_secrets_fleet(repo_root: Path):
    helper = repo_root / "scripts" / "lib" / "secrets-env.sh"
    assert helper.is_file()

    def _resolve(env_name: str) -> str:
        cmd = f"source '{helper}' && cd '{repo_root}' && secrets_env_for {env_name}"
        res = subprocess.run(["bash", "-c", cmd], capture_output=True, text=True)
        assert res.returncode == 0
        return res.stdout.strip()

    assert _resolve("mentolder") == "fleet-mentolder"
    assert _resolve("korczewski") == "fleet-korczewski"
    assert _resolve("dev") == "dev"
    assert _resolve("fleet-mentolder") == "fleet-mentolder"


# ── membership-drift.bats ──────────────────────────────────────────────────

def test_membership_drift(repo_root: Path, tmp_path: Path):
    script = repo_root / "scripts" / "fleet-membership-check.sh"
    assert script.is_file()
    assert os.access(script, os.X_OK)

    # 1: skip without cluster access
    fake_reg = tmp_path / "reg1.yaml"
    fake_reg.write_text("fleet:\n  nodes:\n    - name: pk-hetzner-4\n      k8s_node: true\n  workers: []\n")
    cmd = f"KUBECTL=nonexistent-kubectl WG_REGISTRY_FILE='{fake_reg}' '{script}' 2>&1"
    res = subprocess.run(["bash", "-c", cmd], capture_output=True, text=True)
    assert res.returncode == 0
    assert any(w in res.stdout.lower() for w in ["skip", "uebersprungen", "nicht erreichbar"])

    # 2: detect missing node in registry
    kubectl_stub = tmp_path / "kubectl"
    kubectl_stub.write_text("""#!/usr/bin/env bash
if [[ "$*" == *"get nodes"* ]]; then
  echo "node/pk-hetzner-4"
  echo "node/pk-hetzner-99"
  exit 0
fi
exit 1
""")
    kubectl_stub.chmod(0o755)

    env2 = {
        "PATH": f"{tmp_path}:{os.environ.get('PATH', '')}",
        "KUBECTL": str(kubectl_stub),
        "WG_REGISTRY_FILE": str(fake_reg),
    }
    res2 = subprocess.run(["bash", str(script)], env=env2, capture_output=True, text=True)
    assert res2.returncode != 0
    assert "pk-hetzner-99" in res2.stdout + res2.stderr

    # 3: exit 0 on equality
    kubectl_stub3 = tmp_path / "kubectl3"
    kubectl_stub3.write_text("""#!/usr/bin/env bash
if [[ "$*" == *"get nodes"* ]]; then
  echo "node/pk-hetzner-4"
  exit 0
fi
exit 1
""")
    kubectl_stub3.chmod(0o755)
    env3 = {
        "PATH": f"{tmp_path}:{os.environ.get('PATH', '')}",
        "KUBECTL": str(kubectl_stub3),
        "WG_REGISTRY_FILE": str(fake_reg),
    }
    res3 = subprocess.run(["bash", str(script)], env=env3, capture_output=True, text=True)
    assert res3.returncode == 0

    # 4: taskfile platform contains fleet:membership
    taskfile = repo_root / "taskfiles" / "Taskfile.platform.yml"
    assert taskfile.is_file()
    assert "fleet:membership" in taskfile.read_text()


# ── monitoring-ready.bats ──────────────────────────────────────────────────

def test_monitoring_ready(repo_root: Path):
    bb = repo_root / "k3d" / "monitoring" / "blackbox-exporter.yaml"
    kps = repo_root / "k3d" / "monitoring" / "kube-prometheus-stack-rendered.yaml"
    patch = repo_root / "k3d" / "monitoring" / "grafana-sidecar-resources-patch.yaml"

    assert bb.is_file()
    bb_text = bb.read_text()
    assert "runAsNonRoot: true" in bb_text
    assert "runAsUser: 65534" in bb_text

    assert kps.is_file()
    kps_text = kps.read_text()
    cmd = f"awk '/^  name: monitoring-grafana$/,/^---$/' '{kps}' | grep -A5 '^  strategy:'"
    res = subprocess.run(["bash", "-c", cmd], capture_output=True, text=True)
    assert res.returncode == 0
    assert "type: Recreate" in res.stdout

    assert patch.is_file()
    patch_text = patch.read_text()
    match_chown = re.search(r"name: init-chown-data.*?(?:- name:|\Z)", patch_text, re.DOTALL)
    assert match_chown
    assert "requests:" in match_chown.group(0)
    assert "limits:" in match_chown.group(0)


# ── penpot-secret-keys.bats ────────────────────────────────────────────────

_PENPOT_KEYS = [
    "PENPOT_DB_PASSWORD",
    "PENPOT_SECRET_KEY",
    "PENPOT_MINIO_SECRET_KEY",
    "POCKET_ID_PENPOT_SECRET",
]


def test_penpot_secret_keys_removed(repo_root: Path):
    secrets_dir = repo_root / "environments" / ".secrets"
    for fname in ["fleet-mentolder.yaml", "fleet-staging.yaml"]:
        fpath = secrets_dir / fname
        if fpath.is_file():
            raw = fpath.read_bytes()
            if raw.startswith(b"\x00GITCRYPT\x00"):
                pytest.skip("git-crypt secrets are locked; plaintext key checks require an unlocked checkout")
            text = raw.decode("utf-8")
            for k in _PENPOT_KEYS:
                assert not re.search(rf"^{k}:", text, re.MULTILINE)
                assert k.lower() not in text.lower()


def test_penpot_sealed_secret_keys_removed(repo_root: Path):
    sealed_dir = repo_root / "environments" / "sealed-secrets"
    for fname in ["fleet-mentolder.yaml", "staging.yaml", "mentolder.yaml"]:
        fpath = sealed_dir / fname
        if fpath.is_file():
            text = fpath.read_text()
            for k in _PENPOT_KEYS:
                assert not re.search(rf"{k}:", text)


# ── powershell-ascii-only.bats ─────────────────────────────────────────────

def test_powershell_ascii_only(repo_root: Path):
    ps1_files = sorted((repo_root / "scripts" / "llm").glob("*.ps1"))
    assert len(ps1_files) >= 3

    for f in ps1_files:
        raw = f.read_bytes()
        # Ensure pure ASCII
        assert raw.isascii(), f"{f.name} contains non-ASCII characters"
        # Ensure no UTF-8 BOM
        assert not raw.startswith(b"\xef\xbb\xbf"), f"{f.name} starts with UTF-8 BOM"
        # No Set-Content -Encoding UTF8
        text = raw.decode("ascii")
        assert not re.search(r"Set-Content.*-Encoding\s+UTF8", text), f"{f.name} uses Set-Content -Encoding UTF8"

    tablet_rerank = repo_root / "scripts" / "llm" / "start-tablet-rerank.ps1"
    assert tablet_rerank.is_file()
    t_text = tablet_rerank.read_text()
    for flag in ["--reranking", "-ngl", "8080", "bge-reranker-v2-m3-Q8_0.gguf", r".lmstudio\models"]:
        assert flag in t_text


# ── reflector-annotations.bats ─────────────────────────────────────────────

def test_reflector_annotations(repo_root: Path):
    refl = repo_root / "prod" / "reflector.yaml"
    assert refl.is_file()
    refl_text = refl.read_text()
    assert re.search(r"^kind: CronJob", refl_text, re.MULTILINE)
    assert "name: tls-sync" in refl_text

    for f in [repo_root / "prod" / "wildcard-certificate.yaml", repo_root / "prod-fleet" / "staging" / "wildcard-certificate.yaml"]:
        assert f.is_file()
        assert re.search(r"^kind: Certificate", f.read_text(), re.MULTILINE)

    # No reflector.v1.emberstack.eu annotations in prod, prod-fleet, k3d
    for d in [repo_root / "prod", repo_root / "prod-fleet", repo_root / "k3d"]:
        for yaml_path in d.rglob("*.yaml"):
            assert "reflector.v1.emberstack.eu" not in yaml_path.read_text(), f"found dead reflector annotation in {yaml_path}"


# ── sdlc-console-fleet.bats ────────────────────────────────────────────────

def test_sdlc_console_fleet(repo_root: Path):
    for f in (repo_root / "k3d").rglob("*.yaml"):
        assert "llm-proxy-host" not in f.read_text(), f"hack still referenced in {f}"
    assert not (repo_root / "k3d" / "sdlc-stack" / "llm-proxy-host.yaml").is_file()

    console = repo_root / "k3d" / "dev-stack" / "sdlc-console.yaml"
    assert console.is_file()
    c_text = console.read_text()
    assert 'LLM_ENABLED: "false"' in c_text
    assert "path: /api/health" in c_text
    assert "llm-proxy-host" not in c_text
    assert "shared-db-dev:5432" in c_text
    assert "name: sdlc-console-placeholders" in c_text

    assert (repo_root / "k3d" / "dev-stack" / "sdlc-console-secrets.yaml").is_file()
    assert (repo_root / "k3d" / "dev-stack" / "sdlc-console-rbac.yaml").is_file()


# ── security-cert-hygiene.bats ─────────────────────────────────────────────

def test_security_cert_hygiene(repo_root: Path):
    schema = repo_root / "environments" / "schema.yaml"
    mentolder = repo_root / "environments" / "mentolder.yaml"
    cert = repo_root / "flux" / "clusters" / "fleet" / "bootstrap" / "certificate-flux-webhook.yaml"
    ing = repo_root / "flux" / "clusters" / "fleet" / "bootstrap" / "ingressroute-flux-webhook.yaml"

    assert "name: SESSIONS_DOMAIN" in schema.read_text()
    assert "SESSIONS_DOMAIN: sessions.mentolder.de" in mentolder.read_text()

    cert_text = cert.read_text()
    assert "${PROD_DOMAIN}" not in cert_text
    assert "flux-webhook.mentolder.de" in cert_text

    ing_text = ing.read_text()
    assert "${FLUX_WEBHOOK_HOST}" not in ing_text
    assert "flux-webhook.mentolder.de" in ing_text


# ── staging-flux-wiring.bats ───────────────────────────────────────────────

def test_staging_flux_wiring(repo_root: Path):
    fleet_dir = repo_root / "flux" / "clusters" / "fleet"
    ks_staging = fleet_dir / "ks-staging.yaml"
    ks_website_staging = fleet_dir / "ks-website-staging.yaml"
    ks_sealed_secrets = fleet_dir / "ks-sealed-secrets.yaml"
    staging_env = repo_root / "environments" / "staging.yaml"

    assert ks_staging.is_file()
    s_text = ks_staging.read_text()
    assert "name: flux-staging" in s_text
    assert "path: ./staging" in s_text
    assert "prune: true" in s_text
    assert "kind: OCIRepository" in s_text

    assert ks_website_staging.is_file()
    ws_text = ks_website_staging.read_text()
    assert "name: flux-website-staging" in ws_text
    assert "path: ./website-staging" in ws_text

    assert ks_sealed_secrets.is_file()
    ss_text = ks_sealed_secrets.read_text()
    assert "name: flux-sealed-secrets-staging" in ss_text
    assert "path: ./sealed-secrets/staging" in ss_text

    env_text = staging_env.read_text()
    assert re.search(r"WEBSITE_NAMESPACE:\s*\"?website-staging\"?", env_text)

    # Render staging overlay
    cmd = (
        f"source scripts/env-resolve.sh staging >/dev/null 2>&1 && "
        f"kustomize build prod-fleet/staging --load-restrictor=LoadRestrictionsNone 2>/dev/null"
    )
    res = subprocess.run(["bash", "-c", cmd], cwd=repo_root, capture_output=True, text=True)
    assert res.returncode == 0
    # ensure no cross-fire against prod website service
    assert "website.website.svc.cluster.local" not in res.stdout


# ── vaultwarden-smtp-from.bats ─────────────────────────────────────────────

def test_vaultwarden_smtp_from(repo_root: Path):
    for brand in ["mentolder", "korczewski"]:
        cmd = (
            f"source scripts/env-resolve.sh '{brand}' >/dev/null 2>&1 && "
            f"kubectl kustomize 'prod-fleet/{brand}' --load-restrictor=LoadRestrictionsNone 2>/dev/null | envsubst | awk '/^  name: vaultwarden$/,/^---$/'"
        )
        res = subprocess.run(["bash", "-c", cmd], cwd=repo_root, capture_output=True, text=True)
        assert res.returncode == 0
        block = res.stdout
        assert "SMTP_HOST" in block
        assert "name: SMTP_FROM\n" in block
        val_match = re.search(r"name:\s*SMTP_FROM\s*\n\s*value:\s*(.+)", block)
        assert val_match, f"{brand}: value for SMTP_FROM missing"
        val = val_match.group(1).strip()
        assert "@" in val, f"{brand}: SMTP_FROM does not contain email: {val}"
        assert "${" not in val, f"{brand}: SMTP_FROM has unresolved placeholder: {val}"

    # Verify SMTP_FROM is in taskfiles
    taskfile_txt = (repo_root / "Taskfile.yml").read_text() + "\n" + (repo_root / "taskfiles" / "Taskfile.workspace.yml").read_text()
    assert taskfile_txt.count("$SMTP_FROM") >= 2


# ── wg-gpu-pod-cidr.bats ───────────────────────────────────────────────────

def test_wg_gpu_pod_cidr(repo_root: Path):
    script = repo_root / "scripts" / "hetzner" / "generate-wg-conf.sh"
    assert script.is_file()
    dummy_key = "0000000000000000000000000000000000000000000="
    gpu_host = "wsl2-gpu-mentolder"

    res = subprocess.run(
        ["bash", str(script), "--env", "mentolder", "--node-name", gpu_host, "--private-key", dummy_key],
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0
    out = res.stdout
    assert "[Interface]" in out
    assert out.count("[Peer]") >= 3

    for node in ["pk-hetzner-4", "pk-hetzner-6", "pk-hetzner-8"]:
        assert f"# {node}" in out

    pairs = [
        ("192.168.100.33", "10.42.0.0/24"),
        ("192.168.100.34", "10.42.1.0/24"),
        ("192.168.100.35", "10.42.2.0/24"),
        ("192.168.100.32", "10.42.3.0/24"),
        ("192.168.100.31", "10.42.5.0/24"),
    ]
    for wg_ip, cidr in pairs:
        assert f"AllowedIPs = {wg_ip}/32, {cidr}" in out

    # kubernetes node keeps plain /32 (no pod CIDR)
    res_k8s = subprocess.run(
        ["bash", str(script), "--env", "mentolder", "--node-name", "pk-hetzner-4", "--private-key", dummy_key],
        capture_output=True,
        text=True,
    )
    assert res_k8s.returncode == 0
    out_k8s = res_k8s.stdout
    assert "AllowedIPs = 192.168.100.10/32" in out_k8s
    assert "10.42." not in out_k8s


# ── wg-mesh-sync.bats ──────────────────────────────────────────────────────

def test_wg_mesh_sync_peers_only(repo_root: Path):
    gen_script = repo_root / "scripts" / "hetzner" / "generate-wg-conf.sh"
    res = subprocess.run(
        ["bash", str(gen_script), "--env", "fleet", "--node-name", "pk-hetzner-4", "--peers-only"],
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0
    stdout = res.stdout
    stderr = res.stderr
    assert stdout.strip()

    # Dynamic count check from wg-mesh-nodes.yaml
    wg_file = repo_root / "wireguard" / "wg-mesh-nodes.yaml"
    mesh = yaml.safe_load(wg_file.read_text())
    env_fleet = mesh["fleet"]
    cats = ("nodes", "gpu_hosts", "home_workers", "workers", "devc_servers", "laptops")
    expected_count = 0
    for cat in cats:
        for node in env_fleet.get(cat) or []:
            if node["name"] == "pk-hetzner-4":
                continue
            if node.get("public_key"):
                expected_count += 1
    actual_count = len([line for line in stdout.splitlines() if line.strip()])
    assert actual_count == expected_count

    # does not contain self
    refute_pk4 = "tK3WzIcumUjACWqbXNgCqoSP9JhICAUHA+D8kSzMJ2o="
    assert refute_pk4 not in stdout
    assert "[Interface]" not in stdout
    assert "privatekey" not in stdout.lower()
    # skipped peers without public key (e.g. terminal-sidekick) noted in stderr
    assert "terminal-sidekick" not in stdout
    assert "terminal-sidekick" in stderr.lower()


def test_wg_mesh_sync_script_execution(repo_root: Path, tmp_path: Path):
    sync_script = repo_root / "scripts" / "wg-mesh-sync.sh"
    assert sync_script.is_file()
    assert os.access(sync_script, os.X_OK)

    # 1: reject missing interface key
    res = subprocess.run(["bash", str(sync_script), "reconcile", "--env", "korczewski"], capture_output=True, text=True)
    assert res.returncode != 0
    assert "interface" in (res.stdout + res.stderr).lower()

    # 2: drift without reachable nodes skips with exit 0
    ssh_stub = tmp_path / "ssh"
    ssh_stub.write_text("""#!/usr/bin/env bash
exit 255
""")
    ssh_stub.chmod(0o755)
    env = {
        "PATH": f"{tmp_path}:{os.environ.get('PATH', '')}",
        "WG_MESH_SYNC_SSH": str(ssh_stub),
    }
    res2 = subprocess.run(["bash", str(sync_script), "drift", "--env", "fleet"], env=env, capture_output=True, text=True)
    assert res2.returncode == 0
    assert any(w in (res2.stdout + res2.stderr).lower() for w in ["skip", "uebersprungen", "nicht erreichbar"])

    # 3: reconcile --dry-run
    reg_yaml = tmp_path / "reg.yaml"
    reg_yaml.write_text("""fleet:
  wg_subnet: "10.20.0.0/24"
  listen_port: 51820
  interface: "wg-fleet"
  nodes:
    - name: node-a
      endpoint: "10.0.0.1:51820"
      wg_ip: "10.20.0.1"
      public_key: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    - name: node-b
      endpoint: "10.0.0.2:51820"
      wg_ip: "10.20.0.2"
      public_key: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="
""")
    ssh_log = tmp_path / "ssh.log"
    ssh_stub_dry = tmp_path / "ssh_dry"
    ssh_stub_dry.write_text(f"""#!/usr/bin/env bash
echo "ssh $*" >> "{ssh_log}"
cmd="${{@: -1}}"
if [[ "$cmd" == *"wg show"* ]]; then exit 0; fi
exit 0
""")
    ssh_stub_dry.chmod(0o755)
    env_dry = {
        "PATH": f"{tmp_path}:{os.environ.get('PATH', '')}",
        "WG_MESH_SYNC_SSH": str(ssh_stub_dry),
        "WG_REGISTRY_FILE": str(reg_yaml),
        "SSH_LOG": str(ssh_log),
    }
    res_dry = subprocess.run(
        ["bash", str(sync_script), "reconcile", "--env", "fleet", "--dry-run"],
        env=env_dry,
        capture_output=True,
        text=True,
    )
    assert res_dry.returncode == 0
    out_dry = res_dry.stdout + res_dry.stderr
    assert any(x in out_dry for x in ["node-a", "node-b", "BBBB", "AAAA"])
    if ssh_log.is_file():
        log_content = ssh_log.read_text().lower()
        assert "wg set" not in log_content
        assert "wg syncconf" not in log_content

    # 4: reconcile maintains Address in [Interface] block
    node_a_conf = tmp_path / "node-a.conf"
    node_a_conf.write_text("""[Interface]
PrivateKey = local-private-key-placeholder
Address = 10.20.0.1/32
ListenPort = 51820
""")
    ssh_stub_rec = tmp_path / "ssh_rec"
    ssh_stub_rec.write_text(f"""#!/usr/bin/env bash
cmd="${{@: -1}}"
case "$cmd" in
  *"wg show"*) exit 0 ;;
  *"sudo cat /etc/wireguard/"*) cat "{node_a_conf}"; exit 0 ;;
  *"sudo cp /etc/wireguard/"*) exit 0 ;;
  *"sudo tee -a /etc/wireguard/"*) cat >> "{node_a_conf}"; exit 0 ;;
  *) exit 0 ;;
esac
""")
    ssh_stub_rec.chmod(0o755)
    env_rec = {
        "PATH": f"{tmp_path}:{os.environ.get('PATH', '')}",
        "WG_MESH_SYNC_SSH": str(ssh_stub_rec),
        "WG_REGISTRY_FILE": str(reg_yaml),
        "FAKE_CONF": str(node_a_conf),
    }
    res_rec = subprocess.run(
        ["bash", str(sync_script), "reconcile", "--env", "fleet", "--node", "node-a"],
        env=env_rec,
        capture_output=True,
        text=True,
    )
    assert res_rec.returncode == 0
    final_conf = node_a_conf.read_text()
    assert "PublicKey = BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=" in final_conf
    assert "Address = 10.20.0.1/32" in final_conf

    # 5: drift reports remote command error as failure (not skip)
    ssh_stub_fail = tmp_path / "ssh_fail"
    ssh_stub_fail.write_text("""#!/usr/bin/env bash
echo "sudo: a password is required" >&2
exit 1
""")
    ssh_stub_fail.chmod(0o755)
    env_fail = {
        "PATH": f"{tmp_path}:{os.environ.get('PATH', '')}",
        "WG_MESH_SYNC_SSH": str(ssh_stub_fail),
        "WG_REGISTRY_FILE": str(reg_yaml),
    }
    res_fail = subprocess.run(
        ["bash", str(sync_script), "drift", "--env", "fleet", "--node", "node-a"],
        env=env_fail,
        capture_output=True,
        text=True,
    )
    assert res_fail.returncode != 0
    assert any(x in (res_fail.stdout + res_fail.stderr).lower() for x in ["error", "fehlgeschlagen"])

    # 6: drift visits every node (with cat > /dev/null stub and DEVNULL stdin)
    reg_yaml_3 = tmp_path / "reg3.yaml"
    reg_yaml_3.write_text("""fleet:
  wg_subnet: "10.20.0.0/24"
  listen_port: 51820
  interface: "wg-fleet"
  nodes:
    - name: node-a
      endpoint: "10.0.0.1:51820"
      wg_ip: "10.20.0.1"
      public_key: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    - name: node-b
      endpoint: "10.0.0.2:51820"
      wg_ip: "10.20.0.2"
      public_key: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="
    - name: node-c
      endpoint: "10.0.0.3:51820"
      wg_ip: "10.20.0.3"
      public_key: "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC="
""")
    calls_log = tmp_path / "calls.log"
    ssh_stub_loop = tmp_path / "ssh_loop"
    ssh_stub_loop.write_text(f"""#!/usr/bin/env bash
cat > /dev/null
echo "$*" >> "{calls_log}"
exit 0
""")
    ssh_stub_loop.chmod(0o755)
    env_loop = {
        "PATH": f"{tmp_path}:{os.environ.get('PATH', '')}",
        "WG_MESH_SYNC_SSH": str(ssh_stub_loop),
        "WG_REGISTRY_FILE": str(reg_yaml_3),
        "SSH_CALL_LOG": str(calls_log),
    }
    res_loop = subprocess.run(
        ["bash", str(sync_script), "drift", "--env", "fleet"],
        env=env_loop,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
    )
    # Drift command reports drift since peers are missing on nodes, so exit code may be 1 (drift found).
    # The requirement is that the loop does not abort early and contacts every node.
    assert calls_log.is_file()
    calls_text = calls_log.read_text()
    for h in ["10.0.0.1", "10.0.0.2", "10.0.0.3"]:
        assert h in calls_text
