"""Native migration of tests/spec/toolset-registry/sync-all-harnesses.bats."""

# Checks that scripts/toolset/sync.mjs runs without error against a fixture registry under tmp_path.

def test_toolset_sync_runs_without_error(run_cmd, repo_root, tmp_path):
    (tmp_path / "registry").mkdir()
    (tmp_path / "out" / ".claude").mkdir(parents=True)
    (tmp_path / "out" / ".opencode").mkdir(parents=True)
    (tmp_path / "registry" / "capabilities.yaml").write_text(
        "capabilities:\n  github:\n    cli:gh-axi:\n      state: canonical\n", encoding="utf-8"
    )
    (tmp_path / "out" / ".claude" / "settings.json").write_text(
        '{\n  "disabledMcpjsonServers": []\n}\n', encoding="utf-8"
    )
    res = run_cmd(["node", "scripts/toolset/sync.mjs"], cwd=repo_root,
                  env={"TOOLSET_REGISTRY": str(tmp_path / "registry" / "capabilities.yaml"),
                       "TOOLSET_OUT_DIR": str(tmp_path / "out")})
    assert res.returncode == 0, f"Sync failed (status={res.returncode})"
