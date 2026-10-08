"""Native migration of tests/spec/selection-integrity/dead-selections.bats."""

def test_selection_snapshot(repo_root, run_cmd):
    result = run_cmd(['bash', str(repo_root / 'scripts/find-dead-selections.sh'), '--check'])
    result.check()
    for expected in ['lost=0', 'stale=0', 'incomplete=0']:
        assert expected in result.output
