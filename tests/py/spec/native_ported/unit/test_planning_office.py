"""Native migration of tests/unit/planning-office.bats."""


def test_plan_meta_requires_a_subaction(repo_root, run_cmd):
    r = run_cmd(["bash", str(repo_root / "scripts/ticket.sh"), "plan-meta"])
    assert r.returncode != 0
    assert "set|get" in r.output


def test_plan_meta_set_rejects_missing_id(repo_root, run_cmd):
    r = run_cmd(["bash", str(repo_root / "scripts/ticket.sh"), "plan-meta", "set", "--effort", "klein"])
    assert r.returncode != 0
    assert "--id" in r.output


def test_plan_meta_set_rejects_invalid_effort(repo_root, run_cmd):
    r = run_cmd(
        ["bash", str(repo_root / "scripts/ticket.sh"), "plan-meta", "set", "--id", "T-1", "--effort", "riesig"]
    )
    assert r.returncode != 0
    assert "effort" in r.output


def test_plan_meta_get_rejects_missing_id(repo_root, run_cmd):
    r = run_cmd(["bash", str(repo_root / "scripts/ticket.sh"), "plan-meta", "get"])
    assert r.returncode != 0
    assert "--id" in r.output
