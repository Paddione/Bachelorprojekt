"""Native migration of tests/unit/flux-healthchecks.bats."""
import glob
import re
from pathlib import Path


def _deployment_names(k3d_dir: Path) -> set:
    """metadata.name values under 'kind: Deployment' across k3d/*.yaml (awk equivalent)."""
    names = set()
    for path in glob.glob(str(k3d_dir / "*.yaml")):
        in_dep = False
        for line in Path(path).read_text(encoding="utf-8").splitlines():
            if line == "kind: Deployment":
                in_dep = True
                continue
            if line.startswith("kind: "):
                in_dep = False
            if in_dep and line.startswith("  name: "):
                names.add(line.split()[1])
                in_dep = False
    return names


def _health_check_names(ks_path: Path) -> list:
    """Names inside '  healthChecks:' blocks (sed range + grep + awk equivalent)."""
    names = []
    in_range = False
    for line in ks_path.read_text(encoding="utf-8").splitlines():
        if not in_range and re.match(r"^  healthChecks:", line):
            in_range = True
            continue
        if in_range:
            # sed range: the end line is printed too, so it is still checked for a name.
            if re.match(r"^  [a-z]", line):
                in_range = False
            if re.match(r"^\s+name: ", line):
                names.append(line.split()[1])
    return names


def test_t002313_every_kustomization_healthcheck_targets_a_deployment_the_repo_defines(repo_root):
    flux_dir = repo_root / "flux" / "clusters" / "fleet"
    deployed = _deployment_names(repo_root / "k3d")

    missing = []
    for ks in (flux_dir / "ks-mentolder.yaml", flux_dir / "ks-korczewski.yaml"):
        if not ks.is_file():
            continue
        for name in _health_check_names(ks):
            if name not in deployed:
                missing.append(f"{ks.name}:{name}")
    assert not missing, (
        "healthCheck-Ziele ohne Deployment-Definition unter k3d/: "
        + " ".join(missing)
        + "\n--- im Repo definierte Deployments ---\n"
        + "\n".join(sorted(deployed))
    )


def test_t002313_no_kustomization_gates_on_traefik_helm_managed_in_kube_system(repo_root):
    flux_dir = repo_root / "flux" / "clusters" / "fleet"
    hits = [
        path
        for path in glob.glob(str(flux_dir / "ks-*.yaml"))
        if "name: traefik" in Path(path).read_text(encoding="utf-8")
    ]
    assert len(hits) == 0
