"""Native migration of tests/spec/s2-cycles-g-cq07.bats."""

from pathlib import Path

import pytest

MADGE_ARGS = ["npx", "--yes", "madge", "--circular", "--extensions", "ts,tsx"]


def _madge_output(run_cmd, src: Path) -> str:
    """Combined stdout+stderr of `npx --yes madge ...`; `|| true` semantics (exit code ignored)."""
    try:
        return run_cmd(MADGE_ARGS + [str(src)], timeout=600).output
    except FileNotFoundError:
        # Bash prints "npx: command not found" and the command substitution still succeeds.
        return "npx: command not found"


@pytest.fixture
def website_src(repo_root: Path) -> Path:
    return repo_root / "components" / "website" / "src"


def test_g_cq07_cycle_1_lib_tickets_db_ts_lib_website_db_ts_ist_entfernt(run_cmd, website_src):
    """G-CQ07 cycle #1: lib/tickets-db.ts > lib/website-db.ts ist entfernt"""
    output = _madge_output(run_cmd, website_src)
    assert "lib/tickets-db.ts > lib/website-db.ts" not in output, f"madge-Output:\n{output}"


def test_g_cq07_keine_zirkulaeren_imports_mehr_in_components_website_src(run_cmd, website_src):
    """G-CQ07: keine zirkulaeren Imports mehr in components/website/src"""
    output = _madge_output(run_cmd, website_src)
    assert "No circular dependency found" in output, f"madge-Output:\n{output}"
