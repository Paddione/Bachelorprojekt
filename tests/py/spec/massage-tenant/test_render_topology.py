"""Massage-Tenant (T901440): Render-Topologie — Website + Auth-Overlay.

Rot-Anker: laeuft auf dem unveraenderten Stand mit Assertion-Fehlern
(fehlende Massage-Topologie), nicht mit Collection-/Import-Fehlern.
"""
import os
import re
import subprocess
from pathlib import Path

import pytest
import yaml


def _yaml_load_all(text: str):
    """Parse multi-doc YAML incl. upstream CRD value-tags (T002236)."""
    loader = yaml.SafeLoader
    loader.add_constructor(
        "tag:yaml.org,2002:value", lambda ldr, node: ldr.construct_scalar(node)
    )
    return list(yaml.load_all(text, Loader=loader))




SYNTH_DIGESTS = {
    "WEBSITE_IMAGE_DIGEST": "sha256:565e7cecafd4d792620b4c68a168046481567dec53c4f61545f62f3edd1c7d41",
    "BRETT_IMAGE_DIGEST": "sha256:9090909090909090909090909090909090909090909090909090909090909090",
}


def _flux_env():
    env = os.environ.copy()
    env.update(SYNTH_DIGESTS)
    env["SMTP_PORT"] = "587"
    env["SMTP_HOST"] = "smtp.example.org"
    env["SMTP_USER"] = "x"
    env["POCKET_ID_SMTP_TLS"] = "starttls"
    env["POCKET_ID_FRONTEND_URL"] = "https://auth.example"
    env["POCKET_ID_URL"] = "http://pocket-id:1411"
    env["POCKET_ID_DOMAIN"] = "id.example"
    return env


def _kustomize_build(repo_root: Path, overlay: str) -> str:
    res = subprocess.run(
        ["kustomize", "build", overlay, "--load-restrictor=LoadRestrictionsNone"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert res.returncode == 0, f"kustomize build {overlay} failed: {res.stderr}"
    assert res.stdout.strip(), f"kustomize build {overlay} produced empty output"
    return res.stdout


def _index(docs):
    index = {}
    for doc in docs:
        if not doc:
            continue
        kind = doc.get("kind")
        meta = doc.get("metadata", {}) or {}
        index[(kind, meta.get("namespace"), meta.get("name"))] = doc
    return index


def _deployment_env(deployment):
    containers = (
        deployment.get("spec", {}).get("template", {}).get("spec", {}).get("containers", [])
    )
    env = {}
    for container in containers:
        for entry in container.get("env", []) or []:
            if "value" in entry:
                env[entry["name"]] = entry["value"]
    return env


def _secret_refs(deployment):
    refs = []
    containers = (
        deployment.get("spec", {}).get("template", {}).get("spec", {}).get("containers", [])
    )
    for container in containers:
        for entry in container.get("env", []) or []:
            ref = (entry.get("valueFrom") or {}).get("secretKeyRef")
            if ref:
                refs.append((entry["name"], ref.get("name"), ref.get("key")))
    return refs


def _env_vars(repo_root: Path, env_name: str) -> dict:
    """env_vars aus environments/<env>.yaml als flaches String-Dict."""
    with open(repo_root / "environments" / f"{env_name}.yaml", encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}
    return {k: str(v) for k, v in (data.get("env_vars") or {}).items()}


def _substitute(rendered: str, variables: dict) -> str:
    def repl(match):
        return variables.get(match.group(1), match.group(0))

    return re.sub(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}", repl, rendered)


# ── Website korczewski (Massage) ────────────────────────────────────────────

def test_website_korczewski_brand_is_massage(repo_root: Path):
    rendered = _kustomize_build(repo_root, "prod-fleet/website-korczewski")
    docs = [d for d in _yaml_load_all(rendered) if d]
    index = _index(docs)
    deployment = index.get(("Deployment", "website-korczewski", "website"))
    assert deployment is not None, "website Deployment in website-korczewski fehlt"

    # Deployment-Patch setzt BRAND_ID literal (Guard-/DB-Pfade lesen BRAND_ID zuerst)
    env = _deployment_env(deployment)
    assert env.get("BRAND_ID") == "massage", f"BRAND_ID ist {env.get('BRAND_ID')!r}"

    # Effektiv nach Environment-Substitution: BRAND ebenfalls massage
    substituted = _substitute(rendered, _env_vars(repo_root, "fleet-korczewski"))
    sub_index = _index([d for d in _yaml_load_all(substituted) if d])
    config = sub_index.get(("ConfigMap", "website-korczewski", "website-config"))
    assert config is not None, "website-config ConfigMap fehlt"
    assert config.get("data", {}).get("BRAND") == "massage"


def test_website_korczewski_uses_central_massage_db(repo_root: Path):
    rendered = _kustomize_build(repo_root, "prod-fleet/website-korczewski")
    substituted = _substitute(rendered, _env_vars(repo_root, "fleet-korczewski"))
    index = _index([d for d in _yaml_load_all(substituted) if d])
    deployment = index.get(("Deployment", "website-korczewski", "website"))
    assert deployment is not None
    env = _deployment_env(deployment)
    db_url = env.get("SESSIONS_DATABASE_URL", "")
    assert "website_massage" in db_url, f"DB-Name fehlt in SESSIONS_DATABASE_URL: {db_url}"
    assert "shared-db.workspace.svc" in db_url, f"zentraler Host fehlt: {db_url}"
    # URL-SSL-Verhalten unveraendert (kein beilaeufiger sslmode-Wechsel, p1-Task 2)
    refs = dict((name, (secret, key)) for name, secret, key in _secret_refs(deployment))
    assert refs.get("WEBSITE_DB_PASSWORD") == (
        "website-secrets",
        "WEBSITE_MASSAGE_DB_PASSWORD",
    ), f"WEBSITE_DB_PASSWORD-Referenz falsch: {refs.get('WEBSITE_DB_PASSWORD')}"


def test_website_mentolder_unchanged(repo_root: Path):
    rendered = _kustomize_build(repo_root, "prod-fleet/website-mentolder")
    substituted = _substitute(rendered, _env_vars(repo_root, "fleet-mentolder"))
    index = _index([d for d in _yaml_load_all(substituted) if d])
    deployment = index.get(("Deployment", "website", "website"))
    assert deployment is not None, "mentolder website Deployment fehlt"
    env = _deployment_env(deployment)
    db_url = env.get("SESSIONS_DATABASE_URL", "")
    assert db_url.endswith("/website"), f"mentolder DB-Name geaendert: {db_url}"
    assert "website_massage" not in db_url, "mentolder darf nicht auf website_massage zeigen"
    assert "shared-db.workspace.svc" in db_url, f"mentolder Host geaendert: {db_url}"
    refs = dict((name, (secret, key)) for name, secret, key in _secret_refs(deployment))
    assert refs.get("WEBSITE_DB_PASSWORD") == (
        "website-secrets",
        "WEBSITE_DB_PASSWORD",
    ), f"mentolder Secret-Key geaendert: {refs.get('WEBSITE_DB_PASSWORD')}"


# ── Auth-Overlay ─────────────────────────────────────────────────────────────

def test_auth_overlay_topology(repo_root: Path):
    rendered = _kustomize_build(repo_root, "prod-fleet/korczewski-auth")
    docs = [d for d in _yaml_load_all(rendered) if d]
    index = _index(docs)

    deployment = index.get(("Deployment", "workspace-korczewski", "pocket-id"))
    assert deployment is not None, "Pocket-ID-Deployment im Auth-Namespace fehlt"
    env = _deployment_env(deployment)
    assert "pocket_id_korczewski" in env.get("DB_CONNECTION_STRING", ""), (
        f"falsche Pocket-ID-DB: {env.get('DB_CONNECTION_STRING')}"
    )
    assert "sslmode=require" in env.get("DB_CONNECTION_STRING", ""), "TLS-Pflicht fehlt in Pocket-ID-DSN"
    assert "shared-db.workspace.svc" in env.get("DB_CONNECTION_STRING", "")
    refs = dict((name, (secret, key)) for name, secret, key in _secret_refs(deployment))
    assert refs.get("POCKET_ID_DB_PASSWORD") == (
        "workspace-secrets",
        "POCKET_ID_KORCZEWSKI_DB_PASSWORD",
    )

    # Positiv-Anker: Service, Seed-Job, Wildcard-Certificate
    assert ("Service", "workspace-korczewski", "pocket-id") in index
    assert ("Job", "workspace-korczewski", "pocket-id-client-seed") in index
    assert ("Certificate", "workspace-korczewski", "workspace-wildcard") in index

    # Kein DB-Init-Job im Auth-Render (p1 verwaltet Rollen)
    assert ("Job", "workspace-korczewski", "pocket-id-db-init") not in index, (
        "pocket-id-db-init muss im Auth-Overlay per $patch: delete entfernt sein"
    )
    # Keine eingefrorenen Workloads im Auth-Artefakt
    for (kind, ns, name) in index:
        assert name not in ("nextcloud", "brett", "collabora", "shared-db"), (
            f"eingefrorener Workload im Auth-Artefakt: {kind}/{ns}/{name}"
        )

    # Seed-Job-Label darf nicht dem Pocket-ID-Service-Selector entsprechen
    seed = index[("Job", "workspace-korczewski", "pocket-id-client-seed")]
    pod_labels = seed.get("spec", {}).get("template", {}).get("metadata", {}).get("labels", {})
    assert pod_labels.get("app") != "pocket-id", "Seed-Pod wuerde Pocket-ID-Service-Endpoint werden"

    # Workspace-Seite der Seed-RBAC (get+patch workspace-secrets)
    roles = [d for d in docs if d and d.get("kind") in ("Role", "RoleBinding")]
    ws_role = [r for r in roles if (r.get("metadata", {}) or {}).get("name") == "pocket-id-client-seed-role"]
    assert ws_role, "Workspace-Seed-Role fehlt im Auth-Overlay"


def test_seed_website_rbac_in_website_overlay(repo_root: Path):
    # Website-Seite liegt im Website-Overlay (Transformer-Grund, s. Dateikopf)
    rendered = _kustomize_build(repo_root, "prod-fleet/website-korczewski")
    docs = [d for d in _yaml_load_all(rendered) if d]
    index = _index(docs)
    role = index.get(("Role", "website-korczewski", "pocket-id-client-seed-website-role"))
    assert role is not None, "Website-Seed-Role fehlt"
    assert role.get("rules", [{}])[0].get("verbs") == ["get", "patch"]
    binding = index.get(
        ("RoleBinding", "website-korczewski", "pocket-id-client-seed-website-rolebinding")
    )
    assert binding is not None, "Website-Seed-RoleBinding fehlt"
    subjects = binding.get("subjects", [])
    assert subjects and subjects[0].get("namespace") == "workspace-korczewski", (
        f"Subject-Namespace falsch: {subjects}"
    )


def test_auth_tls_sync_targets_only_website(repo_root: Path):
    rendered = _kustomize_build(repo_root, "prod-fleet/korczewski-auth")
    docs = [d for d in _yaml_load_all(rendered) if d]
    cronjobs = [d for d in docs if d and d.get("kind") == "CronJob"]
    tls_sync = [c for c in cronjobs if (c.get("metadata", {}) or {}).get("name") == "tls-sync"]
    assert tls_sync, "tls-sync CronJob fehlt im Auth-Overlay"
    script = str(tls_sync[0])
    targets = re.findall(r"for NS in ([^;]+); do", script)
    assert targets, "keine Zielschleife im tls-sync-Skript"
    for target in targets:
        assert target.strip() == "${WEBSITE_NAMESPACE}", (
            f"tls-sync-Ziel ausserhalb website-korczewski: {target}"
        )


# ── Produktiver Renderer ─────────────────────────────────────────────────────

def test_flux_renderer_emits_auth_artifact(repo_root: Path, tmp_path: Path):
    render_script = repo_root / "scripts" / "flux-render-artifact.sh"
    assert render_script.is_file()
    out_dir = tmp_path / "out"
    res = subprocess.run(
        ["bash", str(render_script), "--out", str(out_dir)],
        cwd=repo_root,
        env=_flux_env(),
        capture_output=True,
        text=True,
        timeout=600,
    )
    assert res.returncode == 0, f"Renderer failed: {res.stdout}\n{res.stderr}"
    auth_artifact = out_dir / "korczewski-auth" / "korczewski-auth.yaml"
    assert auth_artifact.is_file(), "korczewski-auth-Artefakt fehlt im Renderer-Output"
    text = auth_artifact.read_text()
    assert "pocket-id" in text
    assert "pocket-id-db-init" not in text

    website_artifact = out_dir / "website-korczewski" / "website-korczewski.yaml"
    assert website_artifact.is_file()
    assert "massage" in website_artifact.read_text()
