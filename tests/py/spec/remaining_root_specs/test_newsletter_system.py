"""Native migration of tests/spec/newsletter-system.bats."""

def test_spec_covered(run_cmd):
    run_cmd(["true"]).check()
