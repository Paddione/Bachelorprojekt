"""Native migration of tests/unit/dev-build-safety.bats."""
import re

import pytest


@pytest.fixture
def dockerfile(repo_root):
    path = repo_root / "components" / "website" / "Dockerfile"
    if not path.is_file():
        pytest.fail("components/website/Dockerfile not found")
    return path


def _lines(path):
    return path.read_text(encoding="utf-8").splitlines()


def _first_line_no(path, pattern: str):
    """1-based number of the first line matching the regex, or None (grep -n | head -1)."""
    for number, line in enumerate(_lines(path), start=1):
        if re.search(pattern, line):
            return number
    return None


def test_build_stage_sets_node_options_with_max_old_space_size(dockerfile):
    matches = [line for line in _lines(dockerfile) if re.search(r"NODE_OPTIONS.*max-old-space-size", line)]
    assert matches
    assert any("max-old-space-size" in line for line in matches)


def test_node_options_heap_limit_is_at_least_2048_mb(dockerfile):
    found = re.search(r"max-old-space-size=([0-9]+)", dockerfile.read_text(encoding="utf-8"))
    assert found, "max-old-space-size not found in Dockerfile"
    assert int(found.group(1)) >= 2048, f"max-old-space-size={found.group(1)} is below minimum 2048 MB"


def test_node_options_is_set_in_build_stage_before_runtime_stage(dockerfile):
    build_line = _first_line_no(dockerfile, r"Build stage|AS build")
    runtime_line = _first_line_no(dockerfile, r"Runtime stage|AS runtime")
    node_opts_line = _first_line_no(dockerfile, r"NODE_OPTIONS.*max-old-space-size")
    assert build_line is not None, "Build stage marker not found in Dockerfile"
    assert runtime_line is not None, "Runtime stage marker not found in Dockerfile"
    assert node_opts_line is not None, "NODE_OPTIONS line not found in Dockerfile"
    assert node_opts_line < runtime_line, \
        f"NODE_OPTIONS (line {node_opts_line}) must be in build stage (before runtime at line {runtime_line})"
