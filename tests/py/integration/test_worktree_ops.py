"""tests/py/integration/test_worktree_ops.py — Real end-to-end integration tests for agent-workspace.py."""
import json
import os
from pathlib import Path

import pytest


def test_agent_workspace_create_audit_remove_lifecycle(repo_root: Path, run_cmd):
    """Create a temporary worktree via agent-workspace.py, verify hooks and audit, then remove."""
    script = Path.home() / "scripts/agent-workspace.py"
    if not script.is_file():
        pytest.skip(f"agent-workspace.py not found at {script}")

    test_branch = f"test/smoke-worktree-{os.getpid()}"
    create_cmd = ["python3", str(script), "create", "--repo", str(repo_root), test_branch]
    res = run_cmd(create_cmd)
    res.check(0)
    wt_path = Path(res.stdout.strip())
    assert wt_path.is_dir(), f"Created worktree directory does not exist: {wt_path}"

    try:
        # 1. Verify portable git hooks are configured
        hooks_res = run_cmd(["git", "-C", str(wt_path), "config", "--get", "core.hooksPath"])
        hooks_res.check(0)
        hooks_path = Path(hooks_res.stdout.strip())
        assert hooks_path.is_dir(), f"Configured core.hooksPath is not a directory: {hooks_path}"

        # 2. Verify audit lists the newly created worktree
        audit_res = run_cmd(["python3", str(script), "audit", "--repo", str(repo_root)])
        audit_res.check(0)
        audit_data = json.loads(audit_res.stdout)
        matches = [e for e in audit_data if e.get("path") == str(wt_path.resolve()) or e.get("branch") == test_branch]
        assert len(matches) == 1, f"Audit did not find worktree in: {audit_res.stdout}"
        assert matches[0]["clean"] is True
    finally:
        # Cleanup worktree and branch cleanly
        run_cmd(["git", "-C", str(repo_root), "worktree", "remove", "--force", str(wt_path)])
        run_cmd(["git", "-C", str(repo_root), "branch", "-D", test_branch])
