"""Native migration of tests/unit/mediaviewer-host-durability.bats."""
import re
from pathlib import Path

import pytest


@pytest.fixture
def paths(repo_root: Path):
    return {
        "prod_domains": repo_root / "prod" / "configmap-domains.yaml",
        "base_domains": repo_root / "k3d" / "configmap-domains.yaml",
        "taskfile": repo_root / "Taskfile.yml",
        "taskfiles": repo_root / "taskfiles",
        "website": repo_root / "k3d" / "website.yaml",
    }


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_prod_domain_config_defines_mediaviewer_host(paths):
    assert re.search(r"^[ \t\r\f\v]+MEDIAVIEWER_HOST:", _read(paths["prod_domains"]), re.MULTILINE)


def test_prod_mediaviewer_host_derives_from_prod_domain(paths):
    pattern = r'^[ \t\r\f\v]+MEDIAVIEWER_HOST:[ \t\r\f\v]*"mediaviewer\.\$\{PROD_DOMAIN\}"'
    assert re.search(pattern, _read(paths["prod_domains"]), re.MULTILINE)


def test_prod_deploy_envsubst_list_includes_prod_domain(paths):
    files = [paths["taskfile"]] + sorted(p for p in paths["taskfiles"].rglob("*") if p.is_file())
    pattern = re.compile(r"ENVSUBST_VARS=.*PROD_DOMAIN")
    found = False
    for file in files:
        for line in file.read_text(encoding="utf-8", errors="ignore").splitlines():
            if pattern.search(line):
                found = True
                break
        if found:
            break
    assert found, "ENVSUBST_VARS list does not include PROD_DOMAIN"


def test_website_deployment_still_sources_mediaviewer_host_from_domain_config(paths):
    assert "key: MEDIAVIEWER_HOST" in _read(paths["website"])


def test_base_domain_config_keeps_dev_mediaviewer_localhost(paths):
    pattern = r'^[ \t\r\f\v]+MEDIAVIEWER_HOST:[ \t\r\f\v]*"mediaviewer\.localhost"'
    assert re.search(pattern, _read(paths["base_domains"]), re.MULTILINE)
