"""Native pytest migration of tests/spec/repo-structure/packages-assets.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_packages_assets_zielpfade_packages_design_system_und_assets_art_library_existieren_1(repo_root, run_cmd, tmp_path):
    'packages-assets: Zielpfade packages/design-system und assets/art-library existieren'
    assert Path(str(repo_root) + '/packages/design-system').is_dir()
    assert Path(str(repo_root) + '/assets/art-library').is_dir()


def test_packages_assets_keine_top_level_ordner_design_system_und_art_library_mit_positiv_anker_2(repo_root, run_cmd, tmp_path):
    'packages-assets: keine Top-Level-Ordner design-system/ und art-library/ (mit Positiv-Anker)'
    assert Path(str(repo_root) + '/packages/design-system').is_dir()
    assert Path(str(repo_root) + '/assets/art-library').is_dir()
    assert not (Path(str(repo_root) + '/design-system').is_dir())
    assert not (Path(str(repo_root) + '/art-library').is_dir())
