"""Guards fuer die Flux-Insel korczewski-prod (../design.md §2, §8, §10)."""

from pathlib import Path
import re

import yaml

FLUX_DIR = "flux/clusters/korczewski-prod"
ARTIFACT = "korczewski-prod-manifests"
OCI_URL = "oci://ghcr.io/paddione/korczewski-prod-manifests"
WORKFLOW = ".github/workflows/render-korczewski-prod-artifact.yml"


def _docs(path: Path) -> list:
    return [d for d in yaml.safe_load_all(path.read_text()) if d]


def _flux_docs(repo_root: Path) -> list:
    """Alle YAML-Dokumente unter flux/clusters/korczewski-prod/ (rekursiv, ohne README)."""
    root = repo_root / FLUX_DIR
    assert root.is_dir(), f"{root} does not exist"
    files = sorted(root.rglob("*.yaml")) + sorted(root.rglob("*.yml"))
    assert files, f"keine YAML-Dateien unter {root}"
    docs: list = []
    for path in files:
        docs.extend(_docs(path))
    assert docs, f"keine YAML-Dokumente unter {root}"
    return docs


def test_flux_instances_isolated(repo_root: Path):
    """Die Flux-Insel korczewski-prod referenziert ausschliesslich ihre eigene Quelle; kein
    devmesh-manifests, kein fleet, kein mentolder (Design §10, D1: ein Pfad, eine Quelle —
    die Lehre aus C1).
    """
    docs = _flux_docs(repo_root)

    forbidden = ("devmesh-manifests", "fleet-manifests", "clusters/fleet", "mentolder")
    for doc in docs:
        serialized = yaml.dump(doc, allow_unicode=True)
        label = f"{doc.get('kind')}/{doc.get('metadata', {}).get('name')}"
        for needle in forbidden:
            assert needle not in serialized, f"Fremdreferenz {needle!r} in {label}"

    instances = [d for d in docs if d.get("kind") == "FluxInstance"]
    assert len(instances) == 1, f"erwartet genau eine FluxInstance, gefunden {len(instances)}"
    sync = instances[0]["spec"]["sync"]
    assert sync["path"] == FLUX_DIR
    assert sync["url"] == "https://github.com/Paddione/Bachelorprojekt"

    repositories = [d for d in docs if d.get("kind") == "OCIRepository"]
    assert repositories, "keine OCIRepository im Flux-Baum"
    for repository in repositories:
        assert repository["spec"]["url"] == OCI_URL


def test_workflow_verify_identity_anchored(repo_root: Path):
    """Das oeffentliche Artefakt ist nur fuer genau einen Workflow auf main verwertbar
    (Design §8, D8; ADR-017 mildert die Abweichung von ADR-016 D1).
    """
    source_path = repo_root / FLUX_DIR / "oci-source.yaml"
    assert source_path.is_file(), f"{source_path} does not exist"
    repositories = [d for d in _docs(source_path) if d.get("kind") == "OCIRepository"]
    assert len(repositories) == 1, f"erwartet genau eine OCIRepository, gefunden {len(repositories)}"
    repository = repositories[0]
    assert repository["metadata"]["name"] == ARTIFACT

    verify = repository["spec"]["verify"]
    assert verify["provider"] == "cosign"
    identities = verify["matchOIDCIdentity"]
    assert len(identities) == 1, f"erwartet genau einen Identitaetsanker, gefunden {len(identities)}"
    identity = identities[0]
    assert identity["issuer"] == "https://token.actions.githubusercontent.com"
    subject = identity["subject"]
    assert subject.startswith("^") and subject.endswith("$"), f"subject ist nicht verankert: {subject}"

    signed = (
        "https://github.com/Paddione/Bachelorprojekt/"
        ".github/workflows/render-korczewski-prod-artifact.yml@refs/heads/main"
    )
    unsigned = "https://github.com/Paddione/Bachelorprojekt/.github/workflows/ci.yml@refs/heads/main"
    assert re.fullmatch(subject, signed), f"subject trifft den Signierer nicht: {subject}"
    assert re.fullmatch(subject, unsigned) is None, "subject akzeptiert einen fremden Workflow"

    workflow_path = repo_root / WORKFLOW
    assert workflow_path.is_file(), f"{workflow_path} does not exist"
    workflow = workflow_path.read_text()
    assert "cosign sign" in workflow
    assert workflow.count("ghcr.io/paddione/korczewski-prod-manifests") >= 2, (
        "Artefaktname muss beim Push und bei der Signatur vorkommen"
    )
    assert "id-token: write" in workflow
    assert "packages: write" in workflow
    assert "render-korczewski-prod-artifact" in subject


def test_four_kustomizations_with_authored_service_accounts(repo_root: Path):
    """Vier getrennte Sync-Pfade, jeder mit eigener Identitaet und ohne geerbte Rechte; die
    dependsOn-Kette ist azyklisch bootstrap -> platform -> secrets -> apps (Design §2, D1;
    Antwort auf C2).
    """
    docs = _flux_docs(repo_root)
    kustomizations = {d["metadata"]["name"]: d for d in docs if d.get("kind") == "Kustomization"}

    expected = {
        "korczewski-prod-bootstrap": ("korczewski-prod-bootstrap", "./cluster-bootstrap"),
        "korczewski-prod-platform": ("korczewski-prod-platform", "./platform"),
        "korczewski-prod-secrets": ("korczewski-prod-tenant", "./secrets"),
        "korczewski-prod-apps": ("korczewski-prod-tenant", "./apps"),
    }
    assert set(kustomizations) == set(expected), f"unerwartete Pfade: {sorted(kustomizations)}"

    for name, (service_account, path) in expected.items():
        spec = kustomizations[name]["spec"]
        assert spec["serviceAccountName"] == service_account, f"{name}: falsche Identitaet"
        assert spec["path"] == path, f"{name}: falscher Pfad"
        assert spec["sourceRef"]["kind"] == "OCIRepository"
        assert spec["sourceRef"]["name"] == ARTIFACT

    rbac = _docs(repo_root / FLUX_DIR / "tenant-rbac.yaml")
    authored = {
        d["metadata"]["name"]: d["metadata"].get("namespace")
        for d in rbac
        if d.get("kind") == "ServiceAccount"
    }
    for service_account in {value[0] for value in expected.values()}:
        assert service_account in authored, f"ServiceAccount {service_account} fehlt in tenant-rbac.yaml"
        assert authored[service_account] == "flux-system"

    dependencies = {
        name: [entry["name"] for entry in kustomizations[name]["spec"].get("dependsOn", [])]
        for name in kustomizations
    }
    referenced = {dependency for entries in dependencies.values() for dependency in entries}
    assert referenced <= set(kustomizations), f"dependsOn zeigt aus der Vierermenge: {referenced}"

    roots = [name for name, entries in dependencies.items() if not entries]
    assert roots == ["korczewski-prod-bootstrap"], f"erwartet genau eine Wurzel, gefunden {roots}"

    remaining = dict(dependencies)
    order: list = []
    while remaining:
        ready = sorted(name for name, entries in remaining.items() if all(p in order for p in entries))
        assert ready, f"dependsOn-Zyklus in {sorted(remaining)}"
        order.extend(ready)
        for name in ready:
            del remaining[name]
    assert order == [
        "korczewski-prod-bootstrap",
        "korczewski-prod-platform",
        "korczewski-prod-secrets",
        "korczewski-prod-apps",
    ], f"unerwartete Reihenfolge: {order}"


def test_bootstrap_readme_lists_prerequisites(repo_root: Path):
    """Wer den Cluster aufsetzt, muss die Vorbedingungen pruefen koennen statt sie zu erraten
    (Design §9); genau die Punkte, an denen C3 entstand, sind mit Befehl hinterlegt.
    """
    readme = repo_root / FLUX_DIR / "bootstrap" / "README.md"
    assert readme.is_file(), f"{readme} does not exist"
    text = readme.read_text()
    assert text.strip(), "README ist leer"

    matches = list(re.finditer(r"^[0-9]+\. \*\*", text, re.MULTILINE))
    assert len(matches) >= 6, f"erwartet mindestens sechs nummerierte Vorbedingungen, gefunden {len(matches)}"

    blocks = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        blocks.append(text[match.start():end])

    for number, block in enumerate(blocks, start=1):
        assert (
            "kubectl --context korczewski-prod" in block or "flux --context korczewski-prod" in block
        ), f"Vorbedingung {number} nennt keinen Befehl"
    assert any("sealed-secrets" in block for block in blocks), "kein Block nennt sealed-secrets"
    assert any("cert-manager" in block for block in blocks), "kein Block nennt cert-manager"
