"""Native migration of tests/spec/local-dev-mesh/longhorn-storage.bats."""
import glob
import os
from pathlib import Path

import pytest


@pytest.fixture
def paths(repo_root: Path) -> dict:
    return {
        "prereqs": repo_root / "scripts" / "devmesh" / "longhorn-prereqs.sh",
        "install": repo_root / "scripts" / "devmesh" / "longhorn-install.sh",
        "legacy": repo_root / "k3d" / "dev-cluster" / "longhorn-install.sh",
        "versions": repo_root / "environments" / "versions.yaml",
        "devmesh_dir": repo_root / "scripts" / "devmesh",
    }


def test_t900181_prereqs_script_answers_help_with_exit_0(run_cmd, paths):
    assert os.access(paths["prereqs"], os.X_OK)
    result = run_cmd(["bash", str(paths["prereqs"]), "--help"])
    assert result.returncode == 0
    assert "Usage:" in result.output


def test_t900181_install_dry_run_plans_devmesh_1_11_2_and_local_path_removal(run_cmd, paths):
    assert paths["install"].is_file()
    result = run_cmd(["bash", str(paths["install"]), "--dry-run"])
    assert result.returncode == 0
    assert "devmesh" in result.output
    assert "1.11.2" in result.output
    assert "local-path" in result.output


def test_t900181_versions_yaml_pins_longhorn_chart_1_11_2(paths):
    assert "longhorn_chart: 1.11.2" in paths["versions"].read_text(encoding="utf-8")


def test_t900181_no_devc_reference_remains_in_devmesh_longhorn_scripts(paths):
    scripts = sorted(glob.glob(str(paths["devmesh_dir"] / "longhorn-*.sh")))
    assert scripts, "no longhorn-*.sh scripts found"
    matches = [s for s in scripts if "devc" in Path(s).read_text(encoding="utf-8")]
    assert matches == []


def test_t900181_legacy_v1_7_2_installer_is_removed(paths):
    assert paths["install"].is_file()
    assert not paths["legacy"].exists()
