"""Native migration of tests/unit/brainstorm-dev-host.bats."""
import re
from pathlib import Path

import pytest


def _read(path: Path) -> str:
    """Return file text, or "" when missing (grep on a missing file fails, as in the BATS original)."""
    return path.read_text(encoding="utf-8") if path.is_file() else ""


def _grep_lines(path: Path, pattern: str, regex: bool = False) -> bool:
    """Emulate grep -q of a pattern in a file (-F literal, or -E regex line match)."""
    for line in _read(path).splitlines():
        if regex:
            if re.search(pattern, line):
                return True
        elif pattern in line:
            return True
    return False


@pytest.fixture
def paths(repo_root: Path) -> dict:
    return {
        "prod_overlay": repo_root / "prod-mentolder",
        "fleet_overlay": repo_root / "prod-fleet" / "mentolder",
        "dev_sish": repo_root / "k3d" / "dev-stack" / "sish.yaml",
        "brainstorm_taskfile": repo_root / "taskfiles" / "Taskfile.brainstorm.yml",
        "repo_root": repo_root,
    }


def test_prod_mentolder_no_longer_ships_a_dedicated_brainstorm_sish_manifest(paths):
    assert not (paths["prod_overlay"] / "brainstorm-sish.yaml").exists()


def test_prod_mentolder_kustomization_does_not_reference_brainstorm_sish(paths):
    assert not _grep_lines(paths["prod_overlay"] / "kustomization.yaml", "brainstorm-sish")


def test_prod_fleet_mentolder_kustomization_does_not_patch_brainstorm_sish(paths):
    assert not _grep_lines(paths["fleet_overlay"] / "kustomization.yaml", "brainstorm-sish")


def test_the_dev_stack_sish_broker_the_new_brainstorm_host_is_present_and_binds_dev_domain(paths):
    dev_sish = paths["dev_sish"]
    assert _grep_lines(dev_sish, r"name: sish$", regex=True)
    assert _grep_lines(dev_sish, "--bind-hosts=*.${DEV_DOMAIN}")


def test_brainstorm_taskfile_publishes_to_the_dev_domain_not_the_prod_domain(paths):
    tf = paths["brainstorm_taskfile"]
    assert not _grep_lines(tf, "brainstorm.${PROD_DOMAIN}")
    assert not _grep_lines(tf, "brainstorm.mentolder.de")
    assert _grep_lines(tf, "${DEV_DOMAIN}")


def test_brainstorm_taskfile_targets_dev_sish_ssh_ingress_2222_not_removed_prod_nodeport_32223(paths):
    tf = paths["brainstorm_taskfile"]
    assert not _grep_lines(tf, "32223")
    assert _grep_lines(tf, "2222")
