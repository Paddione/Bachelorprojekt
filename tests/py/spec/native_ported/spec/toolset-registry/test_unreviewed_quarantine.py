"""Native migration of tests/spec/toolset-registry/unreviewed-quarantine.bats."""

# The toolset loader identifies unreviewed entries. Command output verification [T002448-M4].

def test_toolset_loader_identifies_unreviewed_entries(run_cmd, repo_root, tmp_path):
    reg_dir = tmp_path / "registry"
    reg_dir.mkdir()
    registry = reg_dir / "capabilities.yaml"
    registry.write_text(
        "capabilities:\n  unknown-cap:\n    mcp:foo:\n      state: unreviewed\n"
        '      reason: "Needs review"\n',
        encoding="utf-8",
    )
    js = (
        "import('./scripts/toolset/lib/registry.mjs').then(({ loadRegistry }) => { "
        "const r = loadRegistry('" + str(registry) + "'); "
        "if (r.capabilities['unknown-cap']['mcp:foo'].state !== 'unreviewed') process.exit(1); });"
    )
    res = run_cmd(["node", "-e", js], cwd=repo_root)
    assert res.returncode == 0, "Loader failed for unreviewed entry"
