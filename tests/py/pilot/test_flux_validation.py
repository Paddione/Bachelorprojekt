"""tests/py/pilot/test_flux_validation.py — Pilot migration of tests/flux-validation.bats."""
from pathlib import Path
import pytest


def test_dev_overlay_is_renderable(run_cmd, repo_root: Path):
    """Dev overlay is renderable via kustomize build."""
    res = run_cmd("kustomize build prod-fleet/dev --load-restrictor=LoadRestrictionsNone")
    res.check(0)
    assert len(res.stdout) > 0


def test_all_brand_kustomizations_depend_on_flux_infra_controllers(
    yaml_load, repo_root: Path
):
    """All brand Kustomizations depend on flux-infra-controllers."""
    fleet_dir = repo_root / "flux" / "clusters" / "fleet"
    brand_files = [
        fleet_dir / f"ks-{brand}.yaml"
        for brand in [
            "mentolder",
            "korczewski",
            "website-mentolder",
            "website-korczewski",
        ]
    ]
    for yaml_file in brand_files:
        assert yaml_file.is_file(), f"Missing expected Kustomization file: {yaml_file}"
        doc = yaml_load(yaml_file)
        depends_on = [
            dep.get("name") for dep in doc.get("spec", {}).get("dependsOn", [])
        ]
        assert "flux-infra-controllers" in depends_on, (
            f"{yaml_file.name} does not depend on flux-infra-controllers (found {depends_on})"
        )


def test_brand_kustomizations_use_fleet_manifests_source(yaml_load, repo_root: Path):
    """Brand/components/website/dev Kustomizations use OCIRepository/fleet-manifests source."""
    fleet_dir = repo_root / "flux" / "clusters" / "fleet"
    files = [
        fleet_dir / f"ks-{brand}.yaml"
        for brand in [
            "mentolder",
            "korczewski",
            "website-mentolder",
            "website-korczewski",
            "dev",
        ]
    ]
    for yaml_file in files:
        assert yaml_file.is_file()
        doc = yaml_load(yaml_file)
        source_ref = doc.get("spec", {}).get("sourceRef", {})
        assert source_ref.get("kind") == "OCIRepository"
        assert source_ref.get("name") == "fleet-manifests"


def test_no_source_ref_points_at_colliding_flux_system(yaml_load, repo_root: Path):
    """No sourceRef still points at the colliding flux-system OCIRepository name."""
    fleet_dir = repo_root / "flux" / "clusters" / "fleet"
    for yaml_file in fleet_dir.glob("ks-*.yaml"):
        docs = yaml_load(yaml_file, all_docs=True)
        for doc in docs:
            if not isinstance(doc, dict):
                continue
            source_ref = doc.get("spec", {}).get("sourceRef", {})
            if source_ref.get("kind") == "OCIRepository":
                assert source_ref.get("name") != "flux-system", (
                    f"{yaml_file.name} sourceRef still points to colliding flux-system"
                )
