"""Native pytest migration of tests/spec/local-dev-mesh/longhorn-storage.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_t900181_versions_yaml_pins_longhorn_chart_1_11_2_positive_anchor_3(repo_root, run_cmd, tmp_path):
    'T900181: versions.yaml pins longhorn_chart 1.11.2 (positive anchor)'
    path_prereqs = str(repo_root) + '/scripts/devmesh/longhorn-prereqs.sh'
    path_install = str(repo_root) + '/scripts/devmesh/longhorn-install.sh'
    path_legacy = str(repo_root) + '/k3d/dev-cluster/longhorn-install.sh'
    path_versions = str(repo_root) + '/environments/versions.yaml'
    result = run_cmd(['grep', '-qF', 'longhorn_chart: 1.11.2', path_versions])
    assert result.returncode == 0, result.output


def test_t900181_legacy_v1_7_2_installer_is_removed_5(repo_root, run_cmd, tmp_path):
    'T900181: legacy v1.7.2 installer is removed'
    path_prereqs = str(repo_root) + '/scripts/devmesh/longhorn-prereqs.sh'
    path_install = str(repo_root) + '/scripts/devmesh/longhorn-install.sh'
    path_legacy = str(repo_root) + '/k3d/dev-cluster/longhorn-install.sh'
    path_versions = str(repo_root) + '/environments/versions.yaml'
    assert Path(path_install).is_file()
    assert not (Path(path_legacy).exists())
