"""Native migration of tests/spec/workspace-deploy/flux-secrets-ordering.bats."""

import yaml
import pytest

BRANDS = [
    ("ks-mentolder.yaml", "flux-sealed-secrets-mentolder"),
    ("ks-korczewski.yaml", "flux-sealed-secrets-korczewski"),
    ("ks-staging.yaml", "flux-sealed-secrets-staging"),
]


@pytest.fixture
def flux_dir(repo_root):
    return repo_root / "flux" / "clusters" / "fleet"


def _brand_depends_on(flux_dir, name):
    """dependsOn-Namen einer Kustomization (eine Zeile je Name)."""
    doc = yaml.safe_load((flux_dir / name).read_text(encoding="utf-8"))
    return [dep.get("name", "") for dep in ((doc.get("spec") or {}).get("dependsOn") or [])]


def _kustomizations(flux_dir, name):
    with open(flux_dir / name, encoding="utf-8") as f:
        return [d for d in yaml.safe_load_all(f) if d and d.get("kind") == "Kustomization"]


def test_t900014_sealed_secrets_kustomizations_exist_for_mentolder_korczewski_and_staging(flux_dir):
    # Positiv-Anker: die Ordnungsziele muessen existieren (T002356-M1).
    names = {d.get("metadata", {}).get("name") for d in _kustomizations(flux_dir, "ks-sealed-secrets.yaml")}
    for want in ("flux-sealed-secrets-mentolder", "flux-sealed-secrets-korczewski", "flux-sealed-secrets-staging"):
        assert want in names, f"missing Kustomization {want} (have {sorted(n for n in names if n)})"


def test_t900014_brand_and_staging_kustomizations_depend_on_their_matching_sealed_secrets_kustomization(flux_dir):
    for ks, want in BRANDS:
        deps = _brand_depends_on(flux_dir, ks)
        # Positiv-Anker: infra-controllers-Kante bleibt bestehen.
        assert "flux-infra-controllers" in deps, f"FAIL: {ks} lost its flux-infra-controllers dependsOn (have: {deps})"
        assert want in deps, f"FAIL: {ks} missing dependsOn {want} (have: {deps})"


def test_t900014_no_cross_brand_or_infra_blocking_introduced_by_the_new_edges(flux_dir):
    for ks, own in BRANDS:
        deps = _brand_depends_on(flux_dir, ks)
        # Positiv-Anker im selben Test: eigene Kante vorhanden ...
        assert own in deps, f"FAIL: {ks} missing its own dependsOn {own}"
        # ... und keine fremde Secrets-Kante blockiert diesen Stack.
        foreign = [d for d in deps if d.startswith("flux-sealed-secrets-") and d != own]
        assert not foreign, f"FAIL: {ks} waits on foreign secrets Kustomization(s): {foreign}"
    # Secrets-Kustomizations duerfen selbst auf nichts warten.
    offenders = [d.get("metadata", {}).get("name") for d in _kustomizations(flux_dir, "ks-sealed-secrets.yaml")
                 if (d.get("spec") or {}).get("dependsOn")]
    assert not offenders, f"secrets Kustomizations must not declare dependsOn (would cycle/block): {offenders}"
