"""Native migration of tests/spec/dev-flow-plan/plan-lint-node-test.bats."""
# STRUCT2 of the plan linter must accept 'node --test' as test runner [T002616].

# Command output verification [T002448-M4]: runs scripts/plan-lint.sh on fixture plans.

import pytest


@pytest.fixture
def lint(run_cmd, repo_root):
    script = repo_root / "scripts" / "plan-lint.sh"
    fixtures = repo_root / "tests" / "unit" / "fixtures" / "plan-lint"

    def _run(name):
        return run_cmd(["bash", str(script), str(fixtures / name)], cwd=repo_root)

    return _run


def test_struct2_ein_plan_mit_node_test_als_red_step_besteht(lint):
    # Positive anchor first: the bats plan must pass, otherwise the fixture base is broken.
    res = lint("good.md")
    assert res.returncode == 0, res.output
    assert "PLAN-LINT: PASS" in res.output

    # The actual claim: the same plan with node --test instead of bats also passes.
    res = lint("struct2-node-test.md")
    assert res.returncode == 0, res.output
    assert "PLAN-LINT: PASS" in res.output
    assert "STRUCT2" not in res.output


def test_struct2_bleibt_fail_closed_fail_phrase_ganz_ohne_testrunner_scheitert_weiter(lint):
    # Positive anchor: the valid case passes first.
    res = lint("struct2-node-test.md")
    assert res.returncode == 0, res.output

    # Negative claim: a plan asserting 'expected: FAIL' without any runner still fails hard.
    res = lint("struct2-phrase-no-testcmd.md")
    assert res.returncode == 1, res.output
    assert "STRUCT2" in res.output
