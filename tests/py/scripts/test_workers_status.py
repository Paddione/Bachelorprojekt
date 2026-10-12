"""Tests for scripts/llm/workers-status.sh (task llm:workers:status)."""

from pathlib import Path


def test_workers_status_exits_zero_with_sections(run_cmd, repo_root: Path):
    script = repo_root / "scripts" / "llm" / "workers-status.sh"
    res = run_cmd(["bash", str(script)], cwd=repo_root, timeout=120)
    assert res.returncode == 0, res.output
    assert "WORKER" in res.output
    assert "Rollen-Ketten" in res.output
    assert "GPU-Totals" in res.output
    assert "Proxy-Backends" in res.output
