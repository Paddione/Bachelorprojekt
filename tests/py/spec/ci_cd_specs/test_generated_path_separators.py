"""Native assertions from tests/spec/ci-cd/generated-path-separators.bats."""

import re

ARTIFACTS = ["docs/generated/api-map.json", "docs/generated/api-surface.md", "docs/agent-guide/maps/networks-map.md"]


def test_generated_artifacts_exist(repo_root):
    for file in ARTIFACTS:
        assert (repo_root / file).is_file()


def test_no_generated_backslash_paths(repo_root):
    test_generated_artifacts_exist(repo_root)
    bad = [file for file in ARTIFACTS if re.search(r"[A-Za-z0-9_-]+\\[A-Za-z0-9_-]+\\", (repo_root / file).read_text())]
    assert not bad, bad


def test_generator_relative_paths_normalized(repo_root):
    bad = []
    for file in ["scripts/build-api-map.mjs", "scripts/sdlc/api-inventory.mjs"]:
        source = (repo_root / file).read_text()
        assert source
        for line in source.splitlines():
            if re.search(r"=\s*relative\(", line) and "split(sep)" not in line and "replace(/\\\\/g" not in line:
                bad.append(f"{file}: {line}")
    assert not bad, bad


def test_networks_registry_path_normalized(repo_root):
    assert "split(sep).join('/')" in (repo_root / "scripts/networks-check.mjs").read_text()
