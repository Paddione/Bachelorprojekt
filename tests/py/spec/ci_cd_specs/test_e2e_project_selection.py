"""Native assertions from tests/spec/ci-cd/e2e-project-selection.bats."""

import re
import pytest
import yaml

@pytest.fixture
def projects(repo_root):
    source = (repo_root / "tests/e2e/playwright.config.ts").read_text()
    config = set(re.findall(r"^\s*name:\s*'([^']+)'", source, re.M))
    job = yaml.safe_load((repo_root / ".github/workflows/e2e.yml").read_text())["jobs"]["playwright"]
    command = "\n".join(step["run"] for step in job["steps"] if "playwright test" in step.get("run", ""))
    requested = set(re.findall(r"--project[= ]([^ \\\n]+)", command))
    return config, requested, command


def test_no_project_pseudo_negation(projects):
    _, _, command = projects
    assert command
    assert not re.search(r"--project[= ]!", command)


# Ausgenommen: Projekte, die einen Cluster brauchen und nur per
# `--project=...` auf Demand laufen (korczewski: Brand-Cluster;
# mesh: devmesh/prodmesh-Domains, skippt ohne PRODMESH_LIVE/DEVMESH_LIVE).
EXCLUDED_CLUSTER_PROJECTS = {"korczewski-setup", "korczewski", "mesh"}


def test_all_config_projects_requested_or_excluded(projects):
    config, requested, _ = projects
    assert config and requested
    assert not config - requested - EXCLUDED_CLUSTER_PROJECTS


def test_no_unknown_requested_projects(projects):
    config, requested, _ = projects
    assert config and requested
    assert not requested - config


def test_excluded_projects_exist(projects):
    config, _, _ = projects
    assert {"korczewski-setup", "korczewski"} <= config


def test_korczewski_job_uses_live_brand_projects(projects):
    _, _, command = projects
    korczewski = command.split('then', 1)[1].split('else', 1)[0]
    selected = set(re.findall(r"--project[= ]([^ \\\n]+)", korczewski))
    assert {"website", "korczewski", "mesh", "ios"} <= selected
    # Nextcloud/Talk/Vaultwarden are decommissioned, not korczewski services.
    assert not {"services", "smoke"} & selected
