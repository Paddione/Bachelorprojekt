"""Native migration of tests/spec/health-goal-latest-image-exclusions.bats."""
def test_latest_image_exclusions(repo_root):
    text = (repo_root / 'CLAUDE.md').read_text()
    for name in ['Website', 'Brett', 'Docs', 'Videovault', 'Mediaviewer-Widget', 'Mentolder-Web', 'Downloads', 'mcp-node', 'repo-sync', 'dev-shell']:
        assert name in text, name
