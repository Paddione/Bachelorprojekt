"""korczewski-Prod: RustDesk-Web-Bridge im Flux-Render.

Rot-Anker: Bridge-Endpoints zeigten auf die Overlay-IP des abgebauten
pk-hetzner-4 (10.20.0.1, LAN-Netz) statt auf den TURN_NODE — seit
brand-trennung p8 ist pk-hetzner-4 der TURN_NODE (TURN_OVERLAY_IP aus
environments/fleet-korczewski.yaml), die Bridge zeigt korrekt dorthin.
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

# TURN-Overlay-IP des TURN_NODE pk-hetzner-4
# (environments/fleet-korczewski.yaml, per Render-Lauf belegt).
TURN_NODE_INTERNAL_IP = "10.20.0.1"



def _yaml_load_all(text: str):
    loader = yaml.SafeLoader
    loader.add_constructor(
        "tag:yaml.org,2002:value", lambda ldr, node: ldr.construct_scalar(node)
    )
    return [d for d in yaml.load_all(text, Loader=loader) if isinstance(d, dict)]


@pytest.fixture(scope="module")
def korczewski_docs(repo_root: Path, tmp_path_factory) -> list[dict]:
    for binary in ("kustomize", "envsubst"):
        if shutil.which(binary) is None:
            pytest.skip(f"{binary} binary not installed")
    out_dir = tmp_path_factory.mktemp("render")
    env = os.environ.copy()
    env.update(SYNTH_DIGESTS)
    res = subprocess.run(
        ["bash", str(repo_root / "scripts" / "flux-render-artifact.sh"),
         "--out", str(out_dir), "--only", "korczewski"],
        cwd=repo_root, env=env, capture_output=True, text=True, timeout=600,
    )
    assert res.returncode == 0, f"Renderer failed: {res.stdout}\n{res.stderr}"
    return _yaml_load_all((out_dir / "korczewski" / "korczewski.yaml").read_text())


def _find(docs: list[dict], kind: str, name: str) -> dict | None:
    for d in docs:
        if d.get("kind") == kind and (d.get("metadata") or {}).get("name") == name:
            return d
    return None


@pytest.mark.parametrize("name", ["rustdesk-web-hbbs", "rustdesk-web-hbbr"])
def test_rustdesk_bridge_targets_turn_node(korczewski_docs, name):
    ep = _find(korczewski_docs, "Endpoints", name)
    assert ep is not None, f"Endpoints {name} fehlt im korczewski-Artefakt"
    ips = {a["ip"] for s in ep.get("subsets", []) for a in s.get("addresses", [])}
    assert ips == {TURN_NODE_INTERNAL_IP}, f"{name} zeigt auf {ips}"


