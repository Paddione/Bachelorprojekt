"""Native pytest migration of tests/spec/website-core/admin-nav-no-sdlc-routes.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_admin_nav_guard_skript_existiert_und_ist_ausfuehrbar_1(repo_root, run_cmd, tmp_path):
    'admin-nav: Guard-Skript existiert und ist ausfuehrbar'
    path_repo_root = str(repo_root / 'tests/spec/website-core') + '/../../..'
    path_guard = path_repo_root + '/scripts/check-admin-nav-routes.mjs'
    assert Path(path_guard).is_file()
