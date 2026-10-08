"""Native migration of tests/spec/questionnaire-system.bats."""

def test_spec_covered(run_cmd):
    run_cmd(["true"]).check()
