"""Tests for dead node affinity in manifests (migrated from tests/unit/dead-node-affinity.bats)."""

from pathlib import Path
import shutil
import subprocess
import pytest
import yaml

yaml.SafeLoader.add_constructor(
    "tag:yaml.org,2002:value", lambda l, n: l.construct_scalar(n)
)


def _ids(file_path: Path) -> set[tuple[str, str]]:
    s = set()
    with open(file_path) as f:
        for d in yaml.safe_load_all(f):
            if isinstance(d, dict) and d.get("kind"):
                s.add((d["kind"], (d.get("metadata") or {}).get("name")))
    return s


@pytest.fixture(scope="module")
def built_overlays(repo_root: Path, tmp_path_factory) -> dict[str, Path]:
    if not shutil.which("kubectl"):
        pytest.skip("kubectl not installed")

    tmp_dir = tmp_path_factory.mktemp("manifests_build")
    overlays = [
        "prod-mentolder",
        # brand-trennung p5: prod-fleet/mentolder geloescht — korczewski-
        # Pendant (bereits in der Liste) ist der Fleet-Verbraucher.
        # T016558: prod-fleet/mentolder-jobs entfiel (flux-mentolder-jobs aus Prod entfernt).
        "prod-fleet/platform",
        "prod-fleet/korczewski",
    ]
    res_dict = {}
    for ov in overlays:
        out_file = tmp_dir / f"{ov.replace('/', '_')}.yaml"
        res = subprocess.run(
            ["kubectl", "kustomize", str(repo_root / ov), "--load-restrictor=LoadRestrictionsNone"],
            capture_output=True,
            text=True,
        )
        assert res.returncode == 0, f"kubectl kustomize {ov} failed:\n{res.stderr}"
        out_file.write_text(res.stdout)
        res_dict[ov] = out_file

    return res_dict


def test_built_brand_manifests_no_dead_nodes(built_overlays: dict[str, Path]):
    dead_nodes = ["k3s-1", "k3s-2", "k3s-3", "k3w-1", "k3w-2", "k3w-3"]
    for brand in ["prod-fleet/korczewski"]:
        out_file = built_overlays[brand]
        content = out_file.read_text()
        kind_count = sum(1 for line in content.splitlines() if line.startswith("kind:"))
        assert kind_count > 0, f"{brand} built empty"

        for node in dead_nodes:
            assert f"- {node}\n" not in content, f"{brand} references dead node {node}"


def test_no_resource_dropped_by_all_consumers(built_overlays: dict[str, Path]):
    base = _ids(built_overlays["prod-mentolder"])
    w1 = _ids(built_overlays["prod-fleet/korczewski"])
    w3 = _ids(built_overlays["prod-fleet/platform"])

    union = w1 | w3
    assert base, "base overlay produced no resources"
    assert union, "consumer overlays produced no resources"

    # Externe KI-Routen bleiben entfernt; bge-* laufen nur auf devmesh.
    # Talk-KI-Dienste sind bei null Replikas vorhanden.
    intentionally_removed = {
        ('IngressRoute', 'llm-gateway-embed'),
        ('IngressRoute', 'llm-gateway-rerank'),
        ('Deployment', 'bge-embed'),
        ('Deployment', 'bge-embed-bulk'),
        ('Deployment', 'bge-rerank'),
        ('Service', 'llm-gateway-embed'),
        ('Service', 'llm-gateway-rerank'),
        ('NetworkPolicy', 'allow-llm-gateway-egress'),
        ('NetworkPolicy', 'allow-website-to-bge-embed-ingress'),
        ('NetworkPolicy', 'allow-website-to-bge-rerank-ingress'),
        ('PersistentVolumeClaim', 'bge-embed-models'),
        ('PersistentVolumeClaim', 'bge-rerank-models'),
        # T016560: Knowledge-Ingest-CronJobs laufen nur noch in Dev (devmesh).
        ('CronJob', 'knowledge-ingest-prs'),
        ('CronJob', 'knowledge-ingest-markdown'),
        ('CronJob', 'knowledge-ingest-bugs'),
        ('CronJob', 'knowledge-reindex-all'),
        # T016559: Vaultwarden-App aus dem Fleet-Overlay entfernt (DB bleibt).
        ('Deployment', 'vaultwarden'),
        ('Service', 'vaultwarden'),
        ('PersistentVolumeClaim', 'vaultwarden-data-pvc'),
        ('Ingress', 'workspace-ingress-vault'),
        ('NetworkPolicy', 'allow-website-to-vaultwarden-ingress'),
        ('Middleware', 'rate-limit-vault'),
        # Brett-Entfernung: eigenes Brett entfallen (Prod-Brett laeuft ueber
        # gekko32/mentolder-prod); lokale Overlays loeschen die Workloads.
        ('Deployment', 'brett'),
        ('Service', 'brett'),
        ('Deployment', 'oauth2-proxy-brett'),
        ('Service', 'oauth2-proxy-brett'),
        ('Ingress', 'workspace-ingress-brett'),
        ('NetworkPolicy', 'brett-ingress'),
        ('NetworkPolicy', 'brett-egress'),
        # T016561: Videovault + Mediaviewer-Widget laufen nur noch in Dev.
        ('Deployment', 'videovault'),
        ('Service', 'videovault'),
        ('PersistentVolumeClaim', 'videovault-uploads-pvc'),
        ('Ingress', 'workspace-ingress-videovault'),
        ('Deployment', 'oauth2-proxy-videovault'),
        ('Service', 'oauth2-proxy-videovault'),
        ('Deployment', 'mediaviewer-widget'),
        ('Service', 'mediaviewer-widget'),
        ('Ingress', 'workspace-ingress-mediaviewer'),
        ('Middleware', 'mediaviewer-embed-headers'),
        ('Deployment', 'oauth2-proxy-mediaviewer'),
        ('Service', 'oauth2-proxy-mediaviewer'),
        # T016558: flux-mentolder-jobs aus Prod entfernt — Seed-/Config-Jobs
        # laufen nicht mehr via Flux (bei Bedarf manuell bzw. via k3d-Flow).
        ('Job', 'pocket-id-client-seed'),
        ('Job', 'pocket-id-db-init'),
        ('Job', 'nextcloud-notification-config'),
        # brand-trennung: korczewski-Overlay behält nur korczewski-Ressourcen —
        # Belege in prod-korczewski/kustomization.yaml ($patch: delete):
        # pvc-backup referenziert vaultwarden/nextcloud-Pods (in korczewski
        # auf 0 skaliert, T012964); error-log-retention targetet den
        # Website-Pod (in korczewski auf 0); Namespace workspace heisst in
        # der Brand workspace-korczewski (Rename, kein Drop).
        ('CronJob', 'pvc-backup'),
        ('CronJob', 'error-log-retention'),
        ('Namespace', 'workspace'),
    }
    lost = sorted(base - union - intentionally_removed)
    assert not lost, f"Resources dropped by all consumers: {lost}"
