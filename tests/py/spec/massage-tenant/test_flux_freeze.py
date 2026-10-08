"""Massage-Tenant (T901440): Flux-Topologie + Freeze-Garantie.

flux-korczewski und flux-jobs-korczewski bleiben suspendiert (T002479);
flux-website-korczewski und flux-korczewski-auth sind aktiv.
Doku-Freeze-Formel aus p4 wird hier dauerhaft geprueft.
"""
from pathlib import Path

import pytest
import yaml


def _flux_docs(repo_root: Path):
    docs = {}
    flux_dir = repo_root / "flux" / "clusters" / "fleet"
    for path in sorted(flux_dir.glob("ks-*.yaml")):
        with open(path, encoding="utf-8") as fh:
            for doc in yaml.safe_load_all(fh):
                if doc:
                    docs[doc.get("metadata", {}).get("name")] = (path, doc)
    return docs


def test_frozen_kustomizations_stay_suspended(repo_root: Path):
    docs = _flux_docs(repo_root)
    for name in ("flux-korczewski", "flux-korczewski-jobs"):
        assert name in docs, f"{name} fehlt in flux/clusters/fleet"
        path, doc = docs[name]
        assert doc.get("spec", {}).get("suspend") is True, (
            f"{name} ({path.name}) ist nicht mehr suspendiert — T002479 verletzt"
        )


def test_thawed_kustomizations_are_active(repo_root: Path):
    docs = _flux_docs(repo_root)
    website = docs.get("flux-website-korczewski")
    assert website is not None, "flux-website-korczewski fehlt"
    _, website_doc = website
    assert website_doc.get("spec", {}).get("suspend") in (False, None), (
        "flux-website-korczewski muss aufgetaut sein"
    )
    assert website_doc.get("spec", {}).get("path") == "./website-korczewski"
    assert website_doc.get("spec", {}).get("wait") is True

    auth = docs.get("flux-korczewski-auth")
    assert auth is not None, "flux-korczewski-auth fehlt"
    _, auth_doc = auth
    assert auth_doc.get("spec", {}).get("suspend") in (False, None), (
        "flux-korczewski-auth muss aktiv sein"
    )
    assert auth_doc.get("spec", {}).get("path") == "./korczewski-auth"
    assert auth_doc.get("spec", {}).get("wait") is False


def test_flux_dependencies(repo_root: Path):
    docs = _flux_docs(repo_root)
    _, auth_doc = docs["flux-korczewski-auth"]
    depends = {d.get("name") for d in auth_doc.get("spec", {}).get("dependsOn", [])}
    assert "flux-sealed-secrets-korczewski" in depends
    assert "flux-mentolder" in depends, "zentrale DB (mentolder) muss Dependency sein"

    _, website_doc = docs["flux-website-korczewski"]
    depends = {d.get("name") for d in website_doc.get("spec", {}).get("dependsOn", [])}
    assert "flux-korczewski-auth" in depends
    assert "flux-sealed-secrets-korczewski" in depends
    assert "flux-korczewski" not in depends, (
        "Website darf nicht vom suspendierten flux-korczewski abhaengen"
    )

    _, auth_doc = docs["flux-korczewski-auth"]
    checks = auth_doc.get("spec", {}).get("healthChecks", []) or []
    assert any(
        c.get("kind") == "Deployment" and c.get("name") == "pocket-id" for c in checks
    ), "Auth-Kustomization braucht Pocket-ID-Deployment-Healthcheck"


def test_website_apex_ingress_no_frozen_backend(repo_root: Path):
    apex = repo_root / "prod-fleet" / "website-korczewski" / "website-apex.yaml"
    assert apex.is_file(), "website-apex.yaml fehlt"
    with open(apex, encoding="utf-8") as fh:
        docs = [d for d in yaml.safe_load_all(fh) if d]
    middlewares = [d for d in docs if d.get("kind") == "Middleware"]
    assert any(
        "redirect-apex-to-web" in (d.get("metadata", {}) or {}).get("name", "") for d in middlewares
    ), "Apex-Redirect-Middleware fehlt"
    text = apex.read_text(encoding="utf-8")
    assert "old-webspace" not in text, "eingefrorenes Workspace-Backend referenziert"
    assert "workspace-korczewski-" not in text or "website-redirect-apex" in text
    ingresses = [d for d in docs if d.get("kind") == "Ingress"]
    assert ingresses, "Apex-Ingress fehlt"
    for ingress in ingresses:
        for rule in ingress.get("spec", {}).get("rules", []) or []:
            backend = str(rule.get("http", {}))
            assert "old-webspace" not in backend


def test_freeze_wording_in_docs(repo_root: Path):
    formula = "für Go-live vorbereitet durch T901440"
    for rel in (
        "AGENTS.md",
        "CLAUDE.md",
        "flux/clusters/fleet/ks-korczewski.yaml",
        "flux/clusters/fleet/ks-jobs-korczewski.yaml",
    ):
        text = (repo_root / rel).read_text(encoding="utf-8")
        assert formula in text, f"Freeze-Formel fehlt in {rel}"
        assert "T002479" in text, f"T002479-Referenz fehlt in {rel}"
    creds = (repo_root / "docs" / "runbooks" / "credentials-finden.md").read_text(encoding="utf-8")
    assert "T901440" in creds, "T901440 fehlt in credentials-finden.md"
    assert "WEBSITE_MASSAGE_DB_PASSWORD" in creds
    assert "POCKET_ID_KORCZEWSKI_DB_PASSWORD" in creds

    runbook = (
        repo_root / "docs" / "website" / "massage-owner-runbook" / "README.md"
    ).read_text(encoding="utf-8")
    assert "## 12. Go-live auf korczewski.de (T901440)" in runbook
