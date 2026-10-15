"""mentolder-Prod: Collabora (office-stack) kommt aus dem Flux-Artefakt.

Prueft den Render-Output von flux-render-artifact.sh --only office und die
Flux-Kustomization in flux/clusters/fleet-gekko (Konfigurationsaussage, nur
im Quelltext pruefbar).

Rot-Anker: auf dem unveraenderten Stand rendert der Renderer keine
office-Komponente — Collabora wurde nur per Task imperativ eingespielt und
fehlte nach dem Fleet-Neuaufbau.
"""
import os
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

SYNTH_DIGESTS = {
    "WEBSITE_IMAGE_DIGEST": "sha256:565e7cecafd4d792620b4c68a168046481567dec53c4f61545f62f3edd1c7d41",
    "BRETT_IMAGE_DIGEST": "sha256:9090909090909090909090909090909090909090909090909090909090909090",
}
NS = "workspace-office"


def _yaml_load_all(text: str):
    loader = yaml.SafeLoader
    loader.add_constructor(
        "tag:yaml.org,2002:value", lambda ldr, node: ldr.construct_scalar(node)
    )
    return [d for d in yaml.load_all(text, Loader=loader) if isinstance(d, dict)]


@pytest.fixture(scope="module")
def office_docs(repo_root: Path, tmp_path_factory) -> list[dict]:
    for binary in ("kustomize", "envsubst"):
        if shutil.which(binary) is None:
            pytest.skip(f"{binary} binary not installed")
    out_dir = tmp_path_factory.mktemp("render")
    env = os.environ.copy()
    env.update(SYNTH_DIGESTS)
    res = subprocess.run(
        ["bash", str(repo_root / "scripts" / "flux-render-artifact.sh"),
         "--out", str(out_dir), "--only", "office"],
        cwd=repo_root, env=env, capture_output=True, text=True, timeout=600,
    )
    assert res.returncode == 0, f"Renderer failed: {res.stdout}\n{res.stderr}"
    artifact = out_dir / "office" / "office.yaml"
    assert artifact.is_file(), "office-Artefakt fehlt im Renderer-Output"
    return _yaml_load_all(artifact.read_text())


def _find(docs, kind, name):
    for d in docs:
        if d.get("kind") == kind and (d.get("metadata") or {}).get("name") == name:
            return d
    return None


def _env(dep: dict) -> dict:
    return {e["name"]: e.get("value") for e in dep["spec"]["template"]["spec"]["containers"][0]["env"]}


def test_collabora_deployment_for_mentolder(office_docs):
    dep = _find(office_docs, "Deployment", "collabora")
    assert dep is not None
    assert dep["metadata"]["namespace"] == NS
    env = _env(dep)
    # Regex-Alias fuer den WOPI-Host: der Punkt bleibt escaped.
    assert env["aliasgroup1"] == r"https://files\.mentolder.de:443"
    assert "--o:ssl.termination=true" in env["extra_params"]
    # Image ist oeffentlich — kein Pull-Secret, das nach einem Neuaufbau fehlt.
    assert not dep["spec"]["template"]["spec"].get("imagePullSecrets")


def test_office_ingress_and_own_certificate(office_docs):
    ing = _find(office_docs, "Ingress", "office-ingress")
    assert ing is not None
    assert [r["host"] for r in ing["spec"]["rules"]] == ["office.mentolder.de"]
    secret = ing["spec"]["tls"][0]["secretName"]
    cert = next((d for d in office_docs if d.get("kind") == "Certificate"), None)
    assert cert is not None, "eigenes Certificate fehlt (keine stale TLS-Kopie)"
    assert cert["metadata"]["namespace"] == NS
    assert cert["spec"]["secretName"] == secret
    assert "*.mentolder.de" in cert["spec"]["dnsNames"]


def test_admin_secret_not_in_artifact(office_docs):
    # Positiv-Anker: das Artefakt ist nicht leer.
    assert _find(office_docs, "Deployment", "collabora") is not None
    # collabora-secrets gehoert dem SealedSecret aus sealed-secrets/mentolder;
    # der Platzhalter aus k3d/office-stack/secret.yaml darf es nicht ueberschreiben.
    assert _find(office_docs, "Secret", "collabora-secrets") is None


def test_flux_kustomization_wired(repo_root: Path):
    docs = _yaml_load_all((repo_root / "flux/clusters/fleet-gekko/ks-prod.yaml").read_text())
    ks = _find(docs, "Kustomization", "flux-office")
    assert ks is not None, "flux-office fehlt in fleet-gekko/ks-prod.yaml"
    assert ks["spec"]["path"] == "./office"
    deps = {d["name"] for d in ks["spec"].get("dependsOn", [])}
    assert "flux-sealed-secrets-mentolder" in deps
