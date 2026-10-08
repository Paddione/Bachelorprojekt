"""Native migration of tests/spec/local-dev-mesh/k3d-tooling-removed.bats."""

import json
import re
import shutil
from pathlib import Path

import pytest

REMOVED_TASKS = [
    "cluster:create", "cluster:delete", "cluster:start", "cluster:stop", "cluster:status",
    "workspace:up", "dev:reset", "website:build:import", "einvoice-sidecar:import",
    "up", "down",
    "dev:build:website", "dev:build:brett", "dev:apply", "dev:deploy",
    "dev:_materialise-secrets",
]

REMOVED_FILES = [
    "k3d-config.yaml", "k3d/create-cluster.sh", "k3d/teardown.sh",
    "scripts/dev-reset.sh", "scripts/dev-cluster-autostart.sh",
    "taskfiles/Taskfile.staging.yml", "scripts/staging-id.sh", "k3d/staging-stack",
    "k3d/dev-stack/cert-manager.yaml", "k3d/dev-stack/traefik-tls.yaml",
    "tests/unit/staging.bats",
]


def test_removed_tasks_are_absent_from_task_list_all_while_workspace_deploy_remains(repo_root, run_cmd):
    if shutil.which("task") is None:
        pytest.skip("task binary not installed")
    if shutil.which("jq") is None:
        pytest.skip("jq binary not installed")
    # --json statt Textliste: die Textausgabe traegt ANSI-Farbcodes [T900334].
    res = run_cmd(["task", "--list-all", "--json"], cwd=repo_root)
    assert res.returncode == 0, res.output
    names = [t["name"] for t in json.loads(res.stdout)["tasks"]]
    # Positiv-Anker zuerst: der gueltige Fall muss durchlaufen.
    assert "workspace:deploy" in names
    # Negativ-Aussagen: exakter Task-Name als ganzer Name.
    for name in REMOVED_TASKS:
        assert name not in names, f"unerwartet vorhanden: {name}"
    # Keine Staging-Tasks mehr
    assert not [n for n in names if re.match(r"^staging:", n)], "unerwartet Staging-Tasks vorhanden"


def test_removed_files_are_absent_while_the_production_kustomize_base_remains(repo_root):
    assert (repo_root / "k3d" / "kustomization.yaml").is_file()
    for rel in REMOVED_FILES:
        assert not (repo_root / rel).exists(), rel


def test_no_task_imports_images_into_k3d(repo_root):
    assert re.search(r"^  brett:build:", (repo_root / "taskfiles" / "Taskfile.web.yml").read_text(), re.M)
    paths = [repo_root / "Taskfile.yml"]
    paths += [p for p in (repo_root / "taskfiles").rglob("*") if p.is_file()]
    hits = [str(p) for p in paths if b"k3d image import" in p.read_bytes()]
    assert hits == []
