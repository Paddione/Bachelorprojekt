"""T901943 RED: VideoVault type gate green (pytest wrapper over tsc).

Failing-test-first for the dependency-drift fix: runs the VideoVault
typecheck (`tsc --noEmit`, same gate as `npm run check` in
build-videovault.yml) and asserts green. Pre-fix it fails (46 tsc errors
from drifted major APIs: react-day-picker, react-window,
react-resizable-panels, recharts, zod, drizzle/express typings);
post-fix it passes. Skips when the VideoVault toolchain is absent — the
pytest CI jobs do not install components/VideoVault/node_modules (only
the build-videovault job does, where `npm run check` covers this gate
natively).

Pruefmodus: Output-Verifikation (realer tsc-Lauf, Exit-Code-Semantik).
"""

import shutil

import pytest


def _tsc_available(repo_root):
    vv = repo_root / "components" / "VideoVault"
    return (
        shutil.which("npx") is not None
        and (vv / "node_modules" / ".bin" / "tsc").exists()
    )


def test_videovault_type_gate_green(run_cmd, repo_root):
    if not _tsc_available(repo_root):
        pytest.skip("VideoVault node_modules not installed")
    vv = repo_root / "components" / "VideoVault"
    res = run_cmd(
        ["npx", "tsc", "--noEmit"],
        cwd=vv,
        timeout=300,
    )
    assert res.returncode == 0, res.output
