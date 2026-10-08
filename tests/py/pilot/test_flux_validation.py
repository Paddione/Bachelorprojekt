"""tests/py/pilot/test_flux_validation.py — Complete migration of tests/flux-validation.bats."""
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


def test_fleet_manifests_oci_repository_is_committed_with_ghcr_pull_credentials(
    repo_root: Path, yaml_load
):
    """fleet-manifests OCIRepository is committed with GHCR pull credentials."""
    oci_file = repo_root / "flux" / "clusters" / "fleet" / "oci-source.yaml"
    assert oci_file.is_file()
    doc = yaml_load(oci_file)
    assert doc.get("metadata", {}).get("name") == "fleet-manifests"
    assert doc.get("spec", {}).get("url") == "oci://ghcr.io/paddione/fleet-manifests"
    secret_ref = doc.get("spec", {}).get("secretRef", {})
    assert secret_ref.get("name") == "ghcr-auth"


def test_webhook_receiver_targets_the_renamed_oci_repository(repo_root: Path, yaml_load):
    """Webhook receiver targets the renamed OCIRepository."""
    rcv_file = repo_root / "flux" / "clusters" / "fleet" / "bootstrap" / "receiver.yaml"
    assert rcv_file.is_file()
    docs = yaml_load(rcv_file, all_docs=True)
    found = False
    for doc in docs:
        if isinstance(doc, dict) and doc.get("kind") == "Receiver":
            resources = doc.get("spec", {}).get("resources", [])
            for res in resources:
                if res.get("name") == "fleet-manifests":
                    found = True
                    break
    assert found, "Webhook receiver does not target fleet-manifests"


def test_no_external_artifact_sourceref_references_remain_in_kustomization_crds(
    repo_root: Path,
):
    """No ExternalArtifact sourceRef references remain in Kustomization CRDs."""
    fleet_dir = repo_root / "flux" / "clusters" / "fleet"
    for yaml_file in fleet_dir.glob("ks-*.yaml"):
        content = yaml_file.read_text(encoding="utf-8")
        assert "kind: ExternalArtifact" not in content, f"Found ExternalArtifact in {yaml_file}"


def test_no_flux_platform_references_remain(repo_root: Path):
    """No flux-platform references remain."""
    fleet_dir = repo_root / "flux" / "clusters" / "fleet"
    for path in fleet_dir.rglob("*"):
        if path.is_file():
            content = path.read_text(encoding="utf-8", errors="ignore")
            assert "flux-platform" not in content, f"Found flux-platform in {path}"


def test_flux_instance_sync_ref_is_plain_string_not_nested_ref(repo_root: Path, yaml_load):
    """FluxInstance sync.ref is a plain string, not a nested ref object."""
    fi_file = repo_root / "flux" / "clusters" / "fleet" / "flux-instance.yaml"
    assert fi_file.is_file()
    doc = yaml_load(fi_file)
    sync_ref = doc.get("spec", {}).get("sync", {}).get("ref")
    assert sync_ref == "refs/heads/main"
    content = fi_file.read_text(encoding="utf-8")
    assert "branch: main" not in content


def test_flux_instance_does_not_enable_unused_source_watcher(repo_root: Path, yaml_load):
    """FluxInstance does not enable the unused source-watcher component."""
    fi_file = repo_root / "flux" / "clusters" / "fleet" / "flux-instance.yaml"
    assert fi_file.is_file()
    doc = yaml_load(fi_file)
    components = doc.get("spec", {}).get("components", [])
    assert "source-watcher" not in components
    assert "helm-controller" in components


def test_artifact_generator_artifacts_yaml_no_longer_exists(repo_root: Path):
    """ArtifactGenerator/artifacts.yaml no longer exists."""
    artifacts_file = repo_root / "flux" / "clusters" / "fleet" / "artifacts.yaml"
    assert not artifacts_file.exists()
    fleet_dir = repo_root / "flux" / "clusters" / "fleet"
    for path in fleet_dir.rglob("*"):
        if path.is_file():
            content = path.read_text(encoding="utf-8", errors="ignore")
            assert "kind: ArtifactGenerator" not in content


def test_notifications_provider_and_alert_exist(repo_root: Path, yaml_load):
    """Notifications Provider and Alert exist."""
    notif_file = repo_root / "flux" / "clusters" / "fleet" / "notifications.yaml"
    assert notif_file.is_file()
    docs = yaml_load(notif_file, all_docs=True)
    kinds = [d.get("kind") for d in docs if isinstance(d, dict)]
    assert "Provider" in kinds
    assert "Alert" in kinds


def test_dev_flux_kustomization_exists(repo_root: Path):
    """Dev Flux Kustomization exists."""
    dev_ks = repo_root / "flux" / "clusters" / "fleet" / "ks-dev.yaml"
    assert dev_ks.is_file()
    content = dev_ks.read_text(encoding="utf-8")
    assert "flux-dev" in content


def test_dependency_chain_sealed_secrets_to_infra_controllers(repo_root: Path):
    """Dependency chain: sealed-secrets (both brands) → infra-controllers."""
    infra_ks = repo_root / "flux" / "clusters" / "fleet" / "ks-infra-controllers.yaml"
    assert infra_ks.is_file()
    content = infra_ks.read_text(encoding="utf-8")
    assert "flux-sealed-secrets-mentolder" in content
    assert "flux-sealed-secrets-korczewski" in content


def test_flux_infra_configs_removed(repo_root: Path):
    """flux-infra-configs (unrendered staging path) was removed, not left half-migrated."""
    configs_file = repo_root / "flux" / "clusters" / "fleet" / "ks-infra-configs.yaml"
    assert not configs_file.exists()


def test_sealed_secrets_rendered_into_separate_per_brand_directories(repo_root: Path):
    """Sealed secrets are rendered into separate per-brand directories."""
    script_file = repo_root / "scripts" / "flux-render-artifact.sh"
    assert script_file.is_file()
    content = script_file.read_text(encoding="utf-8")
    assert "sealed-secrets/mentolder" in content
    assert "sealed-secrets/korczewski" in content


def test_flux_sealed_secrets_kustomizations_point_at_separate_per_brand_paths(
    repo_root: Path,
):
    """flux-sealed-secrets Kustomizations point at the separate per-brand paths."""
    ss_file = repo_root / "flux" / "clusters" / "fleet" / "ks-sealed-secrets.yaml"
    assert ss_file.is_file()
    content = ss_file.read_text(encoding="utf-8")
    assert "path: ./sealed-secrets/mentolder" in content
    assert "path: ./sealed-secrets/korczewski" in content
