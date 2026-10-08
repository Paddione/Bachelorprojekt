"""Native migration of tests/spec/fleet-operations/dev-node-binding.bats."""
from pathlib import Path

import pytest


@pytest.fixture
def paths(repo_root: Path):
    dev_stack = repo_root / "k3d" / "dev-stack"
    return {
        "binding": dev_stack / "dev-node-binding.yaml",
        "kustomization": dev_stack / "kustomization.yaml",
        "wg": repo_root / "wireguard" / "wg-mesh-nodes.yaml",
    }


def test_t002630_p2_dev_node_binding_yaml_existiert(paths):
    assert paths["binding"].is_file(), f"MISSING: {paths['binding']}"


def test_t002630_p2_dev_node_binding_yaml_definiert_toleration_role_dev_noschedule(paths, yaml_load):
    binding = paths["binding"]
    assert binding.is_file(), f"MISSING: {binding}"
    patches = yaml_load(binding) or []
    found = False
    for p in patches:
        if not isinstance(p, dict):
            continue
        if p.get("path") == "/spec/template/spec/tolerations":
            for t in p.get("value", []) or []:
                if t.get("key") == "role" and t.get("effect") == "NoSchedule":
                    found = True
    assert found, f"FAIL: Toleration role=dev:NoSchedule nicht gefunden in {binding}"


def test_t002630_p2_dev_node_binding_yaml_definiert_node_affinity_auf_role_dev(paths, yaml_load):
    binding = paths["binding"]
    assert binding.is_file(), f"MISSING: {binding}"
    patches = yaml_load(binding) or []
    found = False
    for p in patches:
        if not isinstance(p, dict):
            continue
        if p.get("path") == "/spec/template/spec/affinity":
            aff = p.get("value", {}) or {}
            nst = (
                aff.get("nodeAffinity", {})
                .get("requiredDuringSchedulingIgnoredDuringExecution", {})
                .get("nodeSelectorTerms", [])
            )
            for term in nst:
                for expr in term.get("matchExpressions", []) or []:
                    if expr.get("key") == "role" and "dev" in (expr.get("values") or []):
                        found = True
    assert found, f"FAIL: nodeAffinity role=dev nicht gefunden in {binding}"


def test_t002630_p2_kustomization_yaml_haengt_dev_node_binding_yaml_als_patch_ein(paths):
    kust = paths["kustomization"]
    assert kust.is_file(), f"MISSING: {kust}"
    assert "dev-node-binding.yaml" in kust.read_text(encoding="utf-8"), \
        f"FAIL: dev-node-binding.yaml nicht in kustomization.yaml ({kust})"


def test_t002630_p2_wireguard_wg_mesh_nodes_yaml_enthaelt_gekko_hetzner_2_in_fleet_workers_mit_k8s_node(paths, yaml_load):
    wg = paths["wg"]
    assert wg.is_file(), f"MISSING: {wg}"
    data = yaml_load(wg) or {}
    workers = (data.get("fleet") or {}).get("workers", []) or []
    found = any(
        w.get("name") == "gekko-hetzner-2" and w.get("k8s_node")
        for w in workers
        if isinstance(w, dict)
    )
    assert found, f"FAIL: gekko-hetzner-2 nicht als fleet worker mit k8s_node in {wg}"
