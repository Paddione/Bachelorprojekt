"""Guards fuer den gerenderten korczewski-prod-Baum (../design.md §4, §7, §10)."""

from pathlib import Path
import re

import yaml

FLUX_DIR = "flux/clusters/korczewski-prod"

FOREIGN_REFS = (
    "mentolder.de",
    "fleet-manifests",
    "devmesh-manifests",
    "workspace-dev",
    "devmesh.korczewski.de",
    "clusters/fleet",
)

CLUSTER_SCOPED_KINDS = {
    "ClusterRole",
    "ClusterRoleBinding",
    "ClusterIssuer",
    "TLSStore",
    "CustomResourceDefinition",
    "StorageClass",
    "IngressClass",
    "PersistentVolume",
    "ValidatingWebhookConfiguration",
    "MutatingWebhookConfiguration",
}


def _yaml_files(root: Path) -> list:
    return sorted(root.rglob("*.yaml")) + sorted(root.rglob("*.yml"))


def _docs(path: Path) -> list:
    return [d for d in yaml.safe_load_all(path.read_text()) if d]


def _tree_docs(root: Path) -> list:
    docs: list = []
    for path in _yaml_files(root):
        docs.extend(_docs(path))
    return docs


def _walk(node):
    """Alle (key, value)-Paare rekursiv, inklusive Listeninhalten."""
    if isinstance(node, dict):
        for key, value in node.items():
            yield key, value
            yield from _walk(value)
    elif isinstance(node, list):
        for item in node:
            yield from _walk(item)


def test_render_out_layout(render_tree: Path):
    """render-stack.sh --out erzeugt den Vier-Baum {cluster-bootstrap,platform,secrets,apps},
    und jede Datei enthaelt mindestens ein Dokument (Design §4/D3, §10).
    """
    for name in ("cluster-bootstrap", "platform", "secrets", "apps"):
        subdir = render_tree / name
        assert subdir.is_dir(), f"erwartetes Verzeichnis {subdir} fehlt"
        files = _yaml_files(subdir)
        assert files, f"keine YAML-Datei unter {subdir}"
        for path in files:
            assert len(_docs(path)) >= 1, f"kein YAML-Dokument in {path}"
        assert sum(len(_docs(path)) for path in files) >= 1, f"kein Dokument unter {subdir}"


def test_no_devmesh_or_fleet_refs(render_tree: Path):
    """Kein Dokument des Ziel-Baums traegt eine devmesh-/fleet-/mentolder-Referenz; der Prod-Pfad
    erbt keine Fremdquelle (Design §4 fail-closed; C1-Lehre: kein Objekt und keine Referenz ohne
    Manifest).
    """
    files = _yaml_files(render_tree)
    assert files, f"keine YAML-Dateien unter {render_tree}"
    total_bytes = 0
    for path in files:
        text = path.read_text()
        total_bytes += len(text)
        for needle in FOREIGN_REFS:
            assert needle not in text, f"Fremdreferenz {needle!r} in {path}"
    assert total_bytes > 0, "gescannter Baum ist leer"


def test_cluster_scoped_only_in_bootstrap(render_tree: Path):
    """Cluster-scoped Objekte liegen ausschliesslich im Bootstrap-Pfad; kein Tenant-Pfad traegt
    Rechte oder CRs mit Cluster-Wirkung (Design §10/D1, Antwort auf C2).
    """
    bootstrap = render_tree / "cluster-bootstrap"
    seen: list = []
    for path in _yaml_files(render_tree):
        for doc in _docs(path):
            kind = doc.get("kind")
            if kind in CLUSTER_SCOPED_KINDS:
                seen.append(kind)
                assert bootstrap in path.parents, f"{kind} liegt ausserhalb von cluster-bootstrap: {path}"
    assert "ClusterIssuer" in seen, "kein ClusterIssuer im Bootstrap-Pfad"
    assert "TLSStore" in seen, "kein TLSStore im Bootstrap-Pfad"


def test_tenant_rbac_has_no_cluster_admin(render_tree: Path, repo_root: Path):
    """Kein Pfad bindet cluster-admin, und die Tenant- beziehungsweise Platform-ServiceAccounts
    erscheinen in keinem ClusterRoleBinding (Design §3/D2; woertlich der C2-Befund, der auf
    devmesh offen ist).
    """
    flux_root = repo_root / FLUX_DIR
    assert flux_root.is_dir(), f"{flux_root} does not exist"
    docs = _tree_docs(render_tree) + _tree_docs(flux_root)
    assert docs, "keine Dokumente in Render-Baum oder Flux-Baum"

    bindings = [d for d in docs if d.get("kind") == "ClusterRoleBinding"]
    assert bindings, "kein ClusterRoleBinding gefunden — Pruefung waere vakuos"
    for binding in bindings:
        label = binding["metadata"]["name"]
        assert binding.get("roleRef", {}).get("name") != "cluster-admin", f"{label} bindet cluster-admin"
        subjects = binding.get("subjects") or []
        assert subjects, f"{label} hat keine Subjekte"
        for subject in subjects:
            assert subject.get("kind") == "ServiceAccount", f"{label}: unerwartetes Subjekt {subject}"
            assert subject.get("namespace") == "flux-system", f"{label}: Subjekt ausserhalb flux-system"
            assert subject.get("name") in (
                "korczewski-prod-bootstrap",
                "flux-system",
            ), f"{label}: Tenant- oder Platform-Identitaet im ClusterRoleBinding"

    for doc in docs:
        for _key, value in _walk(doc):
            if isinstance(value, str):
                assert "cluster-admin" not in value, (
                    f"cluster-admin in {doc.get('kind')}/{doc.get('metadata', {}).get('name')}"
                )


def test_sealed_secret_namespaces_match_created_namespaces(render_tree: Path, repo_root: Path):
    """Jeder SealedSecret-Namespace wird von der Lieferkette selbst angelegt; keine Entsiegelung
    zielt auf einen Namespace, den das Artefakt nicht erzeugt (Design §6/§10, C3-Regression).
    """
    docs = _tree_docs(render_tree)
    sealed = {
        (doc["metadata"].get("namespace"), doc["metadata"]["name"])
        for doc in docs
        if doc.get("kind") == "SealedSecret"
    }
    assert sealed == {
        ("cert-manager", "ipv64-api-key"),
        ("workspace-korczewski", "workspace-secrets"),
        ("website-korczewski", "website-secrets"),
        ("website-korczewski", "website-content-token"),
    }, f"unerwartete SealedSecret-Menge: {sorted(sealed)}"

    flux_root = repo_root / FLUX_DIR
    assert flux_root.is_dir(), f"{flux_root} does not exist"

    created: set = set()
    for doc in docs + _tree_docs(flux_root):
        if doc.get("kind") == "Namespace":
            created.add(doc["metadata"]["name"])
        namespace = (doc.get("metadata") or {}).get("namespace")
        if namespace:
            created.add(namespace)
    created.add("flux-system")

    sealed_namespaces = {namespace for namespace, _name in sealed}
    assert sealed_namespaces <= created, f"ohne Namespace: {sorted(sealed_namespaces - created)}"
    assert sealed_namespaces == {"cert-manager", "workspace-korczewski", "website-korczewski"}
    assert {"workspace-korczewski", "website-korczewski"} <= created


def test_images_are_digest_pinned(render_tree: Path):
    """Jedes Container-Image im Baum ist per Digest gepinnt; kein beweglicher Tag kann den
    Prod-Cluster unbemerkt auf eine andere Version ziehen (Design §7/D7, Audit-Befund latest in
    k3d/website.yaml:252).
    """
    images: list = []
    for path in _yaml_files(render_tree):
        for doc in _docs(path):
            for key, value in _walk(doc):
                if key == "image" and isinstance(value, str):
                    images.append(value)
    assert len(images) >= 4, f"erwartet mindestens vier Image-Werte, gefunden {len(images)}"

    for image in images:
        assert re.search(r"@sha256:[0-9a-f]{64}$", image), f"Image ohne Digest-Pinning: {image}"
        assert ":latest" not in image, f"beweglicher Tag: {image}"
