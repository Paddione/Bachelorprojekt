"""Prodmesh-Kanonik zu devmesh-Kompat-Spiegeln (devmesh/prodmesh-Naming, K3).

Doktrin: Jeder devmesh-Eintrag, der einen korczewski-Prod-Host spiegelt
(`korczewski-*-mirror`), braucht ein prodmesh-kanonisches Gegenstueck mit
`decision` (D1, frozen bis Deploy-Freigabe) — analog zu
website-korczewski/apex-korczewski. `fleet` ist nur Alias und nie Mesh-Wert.

Rotphase: `korczewski-auth-mirror` (devmesh, live) hat kein prodmesh-Gegenstueck
→ dieser Test ist rot, bis der Registry-Eintrag nachgetragen ist.
"""
from pathlib import Path

import yaml

REGISTRY = (
    Path(__file__).resolve().parents[5]
    / "docs/agent-guide/registry/domains.yaml"
)

MIRROR_PREFIX = "korczewski-"
MIRROR_SUFFIX = "-mirror"


def load_domains():
    with open(REGISTRY, "r", encoding="utf-8") as f:
        doc = yaml.safe_load(f)
    assert isinstance(doc.get("domains"), list), "Registry ohne domains-Liste"
    return doc["domains"]


def test_mirrors_have_prodmesh_canonical():
    domains = load_domains()
    mirrors = [
        e for e in domains
        if str(e.get("id", "")).startswith(MIRROR_PREFIX)
        and str(e.get("id", "")).endswith(MIRROR_SUFFIX)
    ]
    assert mirrors, "keine korczewski-*-mirror-Eintraege gefunden"
    missing = []
    for mirror in mirrors:
        service = mirror.get("service")
        canonical = [
            e for e in domains
            if e.get("mesh") == "prodmesh" and e.get("service") == service
        ]
        if not canonical:
            missing.append(f"{mirror['id']} (service {service})")
            continue
        if not any(e.get("decision") for e in canonical):
            missing.append(f"{mirror['id']}: prodmesh-Gegenstueck ohne decision")
    assert not missing, (
        "devmesh-Spiegel ohne prodmesh-Kanonik: " + ", ".join(missing)
    )


def test_no_mesh_fleet_values():
    domains = load_domains()
    bad = [e.get("id") for e in domains if e.get("mesh") == "fleet"]
    assert not bad, f"mesh: fleet ist kein gueltiger Wert (nur Alias): {bad}"
