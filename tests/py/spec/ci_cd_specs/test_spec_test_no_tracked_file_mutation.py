"""Native assertions from tests/spec/ci-cd/spec-test-no-tracked-file-mutation.bats."""

def test_agents_map_freshness_preserves_tracked_map_mtimes(repo_root, run_cmd, tmp_path):
    maps = [repo_root / "docs/agent-guide/maps" / file for file in ["agents-map.md", "danger-map.md", "goals-map.md", "tools-map.md"]]
    for file in maps:
        assert file.is_file()
    before = [file.stat().st_mtime_ns for file in maps]
    run_cmd(["node", "scripts/agent-guide/emit-maps.mjs"], env={"AGENT_GUIDE_MAPS_OUT_DIR": str(tmp_path)}).check()
    assert maps[0].read_bytes() == (tmp_path / "agents-map.md").read_bytes()
    assert before == [file.stat().st_mtime_ns for file in maps]
