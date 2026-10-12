"""T901942 RED: picker depth guard (pytest wrapper over the VideoVault vitest suite).

Failing-test-first for the 4b fix: runs the client depth-guard suite and
asserts green. Pre-fix it fails (no depth-guard module: unbounded recursion
overflows at ~5000 levels, measured); post-fix it passes. Skips when the
VideoVault toolchain is absent — the pytest CI jobs do not install
components/VideoVault/node_modules (only the build-videovault job does, where
test:client covers this suite natively).
"""

import shutil

import pytest


def _vitest_available(repo_root):
    vv = repo_root / "components" / "VideoVault"
    return (
        shutil.which("npx") is not None
        and (vv / "node_modules" / ".bin" / "vitest").exists()
    )


def test_picker_depth_guard_client_suite_green(run_cmd, repo_root):
    if not _vitest_available(repo_root):
        pytest.skip("VideoVault node_modules not installed")
    vv = repo_root / "components" / "VideoVault"
    res = run_cmd(
        ["npx", "vitest", "run", "--config", "vitest.config.ts",
         "client/src/components/directory-tree.test.ts"],
        cwd=vv,
    )
    assert res.returncode == 0, res.output
