"""Native migration of tests/spec/fleet-operations/security-cert-hygiene.bats."""
from pathlib import Path

import pytest


def _grep_status(path: Path, needle: str) -> int:
    """grep -q semantics for a fixed string: 0 found, 1 not found, 2 file missing."""
    if not path.is_file():
        return 2
    return 0 if needle in path.read_text(encoding="utf-8") else 1


@pytest.fixture
def root(repo_root: Path) -> Path:
    # Original laeuft relativ zum Repo-Root (Pfade ohne Praefix).
    return repo_root


def test_sa_sec_01_sessions_domain_ist_in_schema_yaml_und_mentolder_yaml_definiert(root):
    # run grep -n ... ; assert_success
    """SA-SEC-01: SESSIONS_DOMAIN ist in schema.yaml und mentolder.yaml definiert"""
    assert _grep_status(root / "environments" / "schema.yaml", "name: SESSIONS_DOMAIN") == 0
    assert _grep_status(root / "environments" / "mentolder.yaml", "SESSIONS_DOMAIN: sessions.mentolder.de") == 0


def test_sa_sec_02_flux_webhook_certificate_enthaelt_keine_prod_domain_platzhalter(root):
    """SA-SEC-02: flux-webhook Certificate enthaelt keine ${PROD_DOMAIN} Platzhalter"""
    cert = root / "flux" / "clusters" / "fleet" / "bootstrap" / "certificate-flux-webhook.yaml"
    # assert_failure: grep findet den Platzhalter nicht (Status != 0, auch bei fehlender Datei).
    assert _grep_status(cert, "${PROD_DOMAIN}") != 0
    assert _grep_status(cert, "flux-webhook.mentolder.de") == 0


def test_sa_sec_02_flux_webhook_ingressroute_enthaelt_keine_flux_webhook_host_platzhalter(root):
    """SA-SEC-02: flux-webhook IngressRoute enthaelt keine ${FLUX_WEBHOOK_HOST} Platzhalter"""
    route = root / "flux" / "clusters" / "fleet" / "bootstrap" / "ingressroute-flux-webhook.yaml"
    assert _grep_status(route, "${FLUX_WEBHOOK_HOST}") != 0
    assert _grep_status(route, "flux-webhook.mentolder.de") == 0
