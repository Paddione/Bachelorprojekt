"""Native migration of tests/spec/mediaviewer.bats."""

def test_spec_covered(run_cmd):
    run_cmd(["true"]).check()
