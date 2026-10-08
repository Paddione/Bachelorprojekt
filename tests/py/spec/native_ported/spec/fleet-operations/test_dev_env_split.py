"""Native migration of tests/spec/fleet-operations/dev-env-split.bats."""
import re
from pathlib import Path

import pytest


@pytest.fixture
def root(repo_root: Path) -> Path:
    return repo_root


def test_t002630_p1_renderer_sourct_dev_cluster_yaml_nicht_dev_yaml_fuer_den_dev_stack(root):
    renderer = root / "scripts" / "flux-render-artifact.sh"
    assert renderer.is_file(), f"MISSING renderer: {renderer}"
    assert "env-resolve.sh dev-cluster" in renderer.read_text(encoding="utf-8"), \
        "Renderer sourct NICHT dev-cluster — dev-Stack-Entflechtung fehlt"


def test_t002630_p1_dev_yaml_verweist_auf_dev_cluster_yaml_als_neue_quelle_fuer_cluster_dev(root):
    dev_yml = root / "environments" / "dev.yaml"
    assert dev_yml.is_file(), f"MISSING: {dev_yml}"
    assert "dev-cluster.yaml" in dev_yml.read_text(encoding="utf-8"), \
        "dev.yaml enthaelt keinen Verweis auf dev-cluster.yaml — Doppelrolle droht"


def test_t002630_p1_dev_cluster_yaml_definiert_dev_domain(root):
    dev_cluster = root / "environments" / "dev-cluster.yaml"
    assert dev_cluster.is_file(), f"MISSING: {dev_cluster}"
    text = dev_cluster.read_text(encoding="utf-8")
    assert re.search(r"DEV_DOMAIN:", text), "dev-cluster.yaml definiert kein DEV_DOMAIN"
    assert re.search(r"dev\.mentolder\.de", text), "dev-cluster.yaml enthaelt nicht dev.mentolder.de"


def test_t002630_p1_environments_schema_yaml_dokumentiert_dev_domain_quelle_dev_cluster_yaml(root):
    schema = root / "environments" / "schema.yaml"
    assert schema.is_file(), f"MISSING: {schema}"
    # sed -n '/name: DEV_DOMAIN/,/name: DEV_NODE/p' — Range inklusive Start- und Endzeile.
    section = []
    in_range = False
    for line in schema.read_text(encoding="utf-8").splitlines():
        if not in_range and "name: DEV_DOMAIN" in line:
            in_range = True
            section.append(line)
            continue
        if in_range:
            section.append(line)
            if "name: DEV_NODE" in line:
                in_range = False
    assert any("dev-cluster.yaml" in l for l in section), \
        "schema.yaml dokumentiert nicht, dass DEV_DOMAIN aus dev-cluster.yaml gelesen wird"
