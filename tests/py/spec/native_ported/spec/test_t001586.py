"""Native migration of tests/spec/t001586.bats."""

import os
import re
from pathlib import Path

import pytest


@pytest.fixture
def repo(repo_root: Path) -> Path:
    return repo_root


def test_ticket_mcp_build_oracle_sh_exists_and_is_executable(repo):
    path = repo / "scripts" / "vda" / "oracle.sh"
    assert path.is_file() and os.access(path, os.X_OK)


def test_ticket_mcp_build_vda_sh_dispatches_oracle_to_oracle_sh(repo):
    text = (repo / "scripts" / "vda.sh").read_text(encoding="utf-8")
    assert 'exec "${SCRIPT_DIR}/vda/oracle.sh"' in text


def test_ticket_mcp_build_oracle_sh_fast_paths_namespace_task_goals_before_llm_source(repo):
    lines = (repo / "scripts" / "vda" / "oracle.sh").read_text(encoding="utf-8").split("\n")
    fastpath = next((i for i, l in enumerate(lines, 1) if l.startswith("FASTPATH_REGEX=")), 0)
    ai_call = next((i for i, l in enumerate(lines, 1) if re.search(r"source.*oracle-ai-call\.sh", l)), 0)
    assert fastpath, "FASTPATH_REGEX line missing"
    assert ai_call, "oracle-ai-call.sh source line missing"
    assert fastpath < ai_call


def test_ticket_mcp_build_lib_batch_builds_mjs_was_removed(repo):
    assert not (repo / "lib" / "batch-builds.mjs").exists()
