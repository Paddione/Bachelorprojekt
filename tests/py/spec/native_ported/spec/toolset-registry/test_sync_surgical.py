"""Native migration of tests/spec/toolset-registry/sync-surgical.bats."""
# Surgical write: disabledMcpjsonServers is updated, the unrelated theme field stays unchanged.

# Command output verification [T002448-M4].

def test_toolset_sync_surgically_updates_target_without_touching_other_fields(run_cmd, repo_root, tmp_path):
    (tmp_path / "registry").mkdir()
    (tmp_path / "out" / ".claude").mkdir(parents=True)
    (tmp_path / "registry" / "capabilities.yaml").write_text(
        "capabilities:\n  github:\n    cli:gh-axi:\n      state: canonical\n"
        "    mcp:github-mcp:\n      state: suppressed\n      reason: \"Use CLI\"\n",
        encoding="utf-8",
    )
    settings = tmp_path / "out" / ".claude" / "settings.json"
    settings.write_text('{\n  "theme": "dark",\n  "disabledMcpjsonServers": []\n}\n', encoding="utf-8")

    res = run_cmd(["node", "scripts/toolset/sync.mjs"], cwd=repo_root,
                  env={"TOOLSET_REGISTRY": str(tmp_path / "registry" / "capabilities.yaml"),
                       "TOOLSET_OUT_DIR": str(tmp_path / "out")})
    assert res.returncode == 0, f"Sync failed (status={res.returncode})"

    text = settings.read_text(encoding="utf-8")
    assert '"theme": "dark"' in text, "Theme field modified!"
    assert '"github-mcp"' in text, "disabledMcpjsonServers not updated!"
