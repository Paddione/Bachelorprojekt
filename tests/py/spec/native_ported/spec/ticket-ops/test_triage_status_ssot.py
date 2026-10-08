"""Native migration of tests/spec/ticket-ops/triage-status-ssot.bats."""

# [T008345]

def test_triage_status_ssot_triage_ungueltiger_status_wird_mit_exit_2_und_ssot_werten_abgelehnt(run_cmd, repo_root):
    res = run_cmd(["bash", str(repo_root / "scripts/vda.sh"), "ticket", "triage", "--id", "T000001",
                   "--status", "not_a_status"], cwd=repo_root)
    assert res.returncode == 2
    assert "Invalid status: not_a_status" in res.output
    assert "triage|planning|plan_staged" in res.output
    assert "|done|archived" in res.output


def test_triage_status_ssot_triage_positiv_anker_gueltiger_status_passiert_die_validierung(run_cmd, repo_root):
    res = run_cmd(["bash", str(repo_root / "scripts/vda.sh"), "ticket", "triage", "--id", "T000001",
                   "--status", "planning"], cwd=repo_root)
    assert res.returncode != 2
    assert "Invalid status" not in res.output
