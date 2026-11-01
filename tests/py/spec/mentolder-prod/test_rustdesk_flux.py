"""mentolder-Prod: das RustDesk-Relay (hbbs/hbbr) kommt aus dem Flux-Artefakt.

Prueft den Render-Output von flux-render-artifact.sh --only rustdesk und die
Flux-Kustomization in flux/clusters/fleet-gekko (Konfigurationsaussage, nur
im Quelltext pruefbar).

Rot-Anker: auf dem unveraenderten Stand rendert der Renderer keine
rustdesk-Komponente — das Relay wurde nur per Task imperativ eingespielt.
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
NS = "rustdesk"


def _yaml_load_all(text: str):
    loader = yaml.SafeLoader
    loader.add_constructor(
        "tag:yaml.org,2002:value", lambda ldr, node: ldr.construct_scalar(node)
    )
    return [d for d in yaml.load_all(text, Loader=loader) if isinstance(d, dict)]


@pytest.fixture(scope="module")
def rustdesk_docs(repo_root: Path, tmp_path_factory) -> list[dict]:
    for binary in ("kustomize", "envsubst"):
        if shutil.which(binary) is None:
            pytest.skip(f"{binary} binary not installed")
    out_dir = tmp_path_factory.mktemp("render")
    env = os.environ.copy()
    env.update(SYNTH_DIGESTS)
    res = subprocess.run(
        ["bash", str(repo_root / "scripts" / "flux-render-artifact.sh"),
         "--out", str(out_dir), "--only", "rustdesk"],
        cwd=repo_root, env=env, capture_output=True, text=True, timeout=600,
    )
    assert res.returncode == 0, f"Renderer failed: {res.stdout}\n{res.stderr}"
    artifact = out_dir / "rustdesk" / "rustdesk.yaml"
    assert artifact.is_file(), "rustdesk-Artefakt fehlt im Renderer-Output"
    return _yaml_load_all(artifact.read_text())


def _find(docs, kind, name):
    for d in docs:
        if d.get("kind") == kind and (d.get("metadata") or {}).get("name") == name:
            return d
    return None


@pytest.mark.parametrize("name", ["hbbs", "hbbr"])
def test_relay_deployment_pinned_and_always_on(rustdesk_docs, name):
    dep = _find(rustdesk_docs, "Deployment", name)
    assert dep is not None, f"Deployment {name} fehlt"
    assert dep["metadata"]["namespace"] == NS
    # Always-on: Flux haelt replicas 1, kein Scale-to-0 im Artefakt.
    assert dep["spec"]["replicas"] == 1
    pod = dep["spec"]["template"]["spec"]
    assert pod["hostNetwork"] is True
    # ${TURN_NODE} ist aufgeloest (fleet-korczewski), kein Platzhalter.
    # brand-trennung p8: Relay läuft auf pk-hetzner-4 (per Render-Lauf belegt).
    assert pod["nodeSelector"]["kubernetes.io/hostname"] == "pk-hetzner-4"
    assert not pod.get("imagePullSecrets")


def test_namespace_is_privileged(rustdesk_docs):
    ns = _find(rustdesk_docs, "Namespace", NS)
    assert ns is not None
    assert ns["metadata"]["labels"]["pod-security.kubernetes.io/enforce"] == "privileged"


def test_no_sleeper_and_no_placeholder_secret(rustdesk_docs):
    # Positiv-Anker: das Artefakt ist nicht leer.
    assert _find(rustdesk_docs, "Deployment", "hbbs") is not None
    # Der On-demand-Sleeper (T015170) wuerde gegen Flux ankaempfen.
    names = {(d.get("metadata") or {}).get("name") for d in rustdesk_docs}
    assert not any(n and "sleeper" in n for n in names), names
    # rustdesk-secrets gehoert dem SealedSecret aus sealed-secrets/mentolder;
    # der Platzhalter aus k3d/rustdesk-stack/secret.yaml darf es nicht ueberschreiben.
    assert _find(rustdesk_docs, "Secret", "rustdesk-secrets") is None


def test_flux_kustomization_wired(repo_root: Path):
    docs = _yaml_load_all((repo_root / "flux/clusters/fleet-gekko/ks-prod.yaml").read_text())
    ks = _find(docs, "Kustomization", "flux-rustdesk")
    assert ks is not None, "flux-rustdesk fehlt in fleet-gekko/ks-prod.yaml"
    assert ks["spec"]["path"] == "./rustdesk"
    deps = {d["name"] for d in ks["spec"].get("dependsOn", [])}
    assert "flux-sealed-secrets-mentolder" in deps
