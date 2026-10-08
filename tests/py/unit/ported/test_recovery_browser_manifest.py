"""Native migration of tests/unit/recovery-browser-manifest.bats."""
from pathlib import Path

import pytest


@pytest.fixture
def manifest(repo_root) -> Path:
    return repo_root / "k3d" / "recovery-browser.yaml"


@pytest.fixture
def manifest_text(manifest) -> str:
    return manifest.read_text(encoding="utf-8")


def test_manifest_exists_and_is_valid_yaml(manifest, yaml_load):
    # Offline-Parse ohne CRDs (kubectl dry-run kann Traefik-CRD-Kinds ablehnen).
    assert manifest.is_file()
    yaml_load(manifest, all_docs=True)


def test_filebrowser_mounts_recovery_pvc_read_only(manifest_text):
    assert "claimName: recovery-pvc" in manifest_text
    assert "readOnly: true" in manifest_text


def test_oauth2_proxy_is_gated_via_authenticated_emails_file(manifest_text):
    # Pocket ID kennt kein Gruppenkonzept (T001068): Flag UND Datenquelle pruefen.
    assert "--authenticated-emails-file=/etc/oauth2/allowed-emails" in manifest_text
    assert "name: oauth2-proxy-recovery-allowed-emails" in manifest_text


def test_oauth2_proxy_uses_recovery_client_and_upstreams_filebrowser(manifest_text):
    assert "--client-id=recovery" in manifest_text
    assert "--upstream=http://recovery-browser" in manifest_text


def test_ingress_routes_the_recover_domain(manifest_text):
    assert "kind: Ingress" in manifest_text
    assert "RECOVER_DOMAIN" in manifest_text


def test_not_registered_in_base_kustomization_on_demand_only(repo_root):
    kustomization = repo_root / "k3d" / "kustomization.yaml"
    # Positiv-Anker: die Kustomization existiert; sonst waere die Negativ-Aussage vakuos
    # (grep auf eine fehlende Datei endet ebenfalls ungleich 0).
    assert kustomization.is_file()
    assert "recovery-browser.yaml" not in kustomization.read_text(encoding="utf-8")
