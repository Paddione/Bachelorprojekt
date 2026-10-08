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
        "prod-fleet/mentolder",
        "prod-fleet/mentolder-jobs",
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
    for brand in ["prod-fleet/mentolder", "prod-fleet/korczewski"]:
        out_file = built_overlays[brand]
        content = out_file.read_text()
        kind_count = sum(1 for line in content.splitlines() if line.startswith("kind:"))
        assert kind_count > 0, f"{brand} built empty"

        for node in dead_nodes:
            assert f"- {node}\n" not in content, f"{brand} references dead node {node}"


def test_no_resource_dropped_by_all_consumers(built_overlays: dict[str, Path]):
    base = _ids(built_overlays["prod-mentolder"])
    w1 = _ids(built_overlays["prod-fleet/mentolder"])
    w2 = _ids(built_overlays["prod-fleet/mentolder-jobs"])
    w3 = _ids(built_overlays["prod-fleet/platform"])

    union = w1 | w2 | w3
    assert base, "base overlay produced no resources"
    assert union, "consumer overlays produced no resources"

    lost = sorted(base - union)
    assert not lost, f"Resources dropped by all consumers: {lost}"


def test_whisper_retains_fleet_placement(built_overlays: dict[str, Path]):
    fleet_cps = {"pk-hetzner-4", "pk-hetzner-6", "pk-hetzner-8"}
    out_file = built_overlays["prod-fleet/mentolder"]
    docs = list(yaml.safe_load_all(out_file.read_text()))

    dep = None
    for d in docs:
        if (
            isinstance(d, dict)
            and d.get("kind") == "Deployment"
            and (d.get("metadata") or {}).get("name") == "whisper"
        ):
            dep = d
            break

    assert dep is not None, "whisper Deployment missing in prod-fleet/mentolder build"

    terms = (
        (((dep.get("spec") or {}).get("template") or {}).get("spec") or {})
        .get("affinity", {})
        .get("nodeAffinity", {})
        .get("requiredDuringSchedulingIgnoredDuringExecution", {})
        .get("nodeSelectorTerms", [])
    )

    values = set()
    for t in terms:
        for expr in t.get("matchExpressions", []):
            if expr.get("key") == "kubernetes.io/hostname" and expr.get("operator") == "In":
                values.update(expr.get("values", []))

    assert values & fleet_cps, f"whisper does not require fleet CP node. Found: {values}"
