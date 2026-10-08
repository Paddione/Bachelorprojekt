"""Validates art-library sets manifest.json (migrated from tests/unit/test_art_library_manifest.bats)."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import pytest


@pytest.fixture(scope="module")
def check_art_library_deps(repo_root: Path):
    node_modules = repo_root / "assets" / "art-library" / "_tooling" / "node_modules"
    if not node_modules.is_dir():
        if not os.environ.get("CI"):
            pytest.skip("art-library tooling dependencies missing locally")
        pytest.fail(
            "art-library tooling dependencies missing — run: npm install --prefix assets/art-library/_tooling"
        )


def test_art_library_validator_script_runs(repo_root: Path, check_art_library_deps):
    script = repo_root / "assets" / "art-library" / "_tooling" / "validate-manifest.mjs"
    res = subprocess.run(["node", str(script)], capture_output=True, text=True)
    assert res.returncode == 0, f"Validator script failed: {res.stdout}\n{res.stderr}"


def test_korczewski_set_has_required_asset_kinds(repo_root: Path):
    manifest_file = repo_root / "assets" / "art-library" / "sets" / "korczewski" / "manifest.json"
    data = json.loads(manifest_file.read_text())
    assets = data.get("assets", [])
    for kind in ["character", "prop", "terrain", "logo"]:
        assert any(a.get("kind") == kind for a in assets), f"Missing asset of kind {kind} in korczewski"


def test_mentolder_set_has_required_asset_kinds(repo_root: Path):
    manifest_file = repo_root / "assets" / "art-library" / "sets" / "mentolder" / "manifest.json"
    data = json.loads(manifest_file.read_text())
    assets = data.get("assets", [])
    for kind in ["character", "prop", "terrain", "logo"]:
        assert any(a.get("kind") == kind for a in assets), f"Missing asset of kind {kind} in mentolder"


def test_mentolder_manifest_declares_at_least_19_assets(repo_root: Path):
    manifest_file = repo_root / "assets" / "art-library" / "sets" / "mentolder" / "manifest.json"
    data = json.loads(manifest_file.read_text())
    assets = data.get("assets", [])
    assert len(assets) >= 19
