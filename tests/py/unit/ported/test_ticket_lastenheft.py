"""Native migration of tests/unit/ticket-lastenheft.bats."""
import os

import pytest

SQL_FLAG_TRUE = '"lastenheft_locked":true'
SQL_FLAG_FALSE = '"lastenheft_locked":false'


def mock_kubectl(path, cap, count):
    """kubectl-Mock: get pod liefert pod/shared-db-0; exec schreibt stdin nach CAP und liefert count."""
    if count is None:
        exec_body = f'echo "# kubectl $*" >> "{cap}"; cat >> "{cap}"; echo "1"; exit 0;'
    else:
        exec_body = f'echo "{count}"; exit 0;'
    path.write_text(
        "#!/usr/bin/env bash\n"
        'if [[ "$*" == *"get pod"* ]]; then echo "pod/shared-db-0"; exit 0; fi\n'
        f'if [[ "$*" == *"exec"* ]]; then {exec_body}\n'
        "fi\n"
        "exit 0\n"
    )
    path.chmod(0o755)


@pytest.fixture
def mock(tmp_path, repo_root):
    """setup(): Mock-Verzeichnis, CAP-Datei und PATH-Erweiterung."""
    mockdir = tmp_path / "mock"
    mockdir.mkdir()
    cap = mockdir / "captured.sql"
    mock_kubectl(mockdir / "kubectl", cap, None)
    env = {"PATH": f"{mockdir}{os.pathsep}{os.environ.get('PATH', '')}", "CAP": str(cap)}
    return {"dir": mockdir, "cap": cap, "env": env, "ticket": repo_root / "scripts/ticket.sh"}


def ticket(run_cmd, m, *args):
    return run_cmd(["bash", str(m["ticket"]), *args], env=m["env"], timeout=300)


def test_lastenheft_requires_a_subaction_deterministic_exit_2_without_a_cluster(run_cmd, mock):
    run = ticket(run_cmd, mock, "lastenheft")
    assert run.returncode == 2, run.output
    assert "lock|unlock" in run.output


def test_lastenheft_rejects_an_unknown_subaction(run_cmd, mock):
    run = ticket(run_cmd, mock, "lastenheft", "frobnicate", "--id", "T000123")
    assert run.returncode == 2, run.output
    assert "lock|unlock" in run.output


def test_lastenheft_lock_requires_id(run_cmd, mock):
    run = ticket(run_cmd, mock, "lastenheft", "lock")
    assert run.returncode == 2, run.output
    assert "--id is required" in run.output


def test_lastenheft_lock_sets_the_flag_true_and_forward_transitions_status_to_backlog(run_cmd, mock):
    run = ticket(run_cmd, mock, "lastenheft", "lock", "--id", "T000123")
    assert run.returncode == 0, run.output
    cap = mock["cap"].read_text()
    assert SQL_FLAG_TRUE in cap
    assert "COALESCE(readiness,'{}'::jsonb) ||" in cap
    assert ("status    = CASE WHEN status IN ('triage','planning','plan_staged') "
            "THEN 'backlog' ELSE status END") in cap


def test_lastenheft_lock_refuses_an_empty_lastenheft_exit_3(run_cmd, mock):
    # Mock so umschreiben, dass die Requirements-Zaehlung 0 liefert.
    mock_kubectl(mock["dir"] / "kubectl", mock["cap"], "0")
    run = ticket(run_cmd, mock, "lastenheft", "lock", "--id", "T000123")
    assert run.returncode == 3, run.output
    assert "Lastenheft is empty" in run.output


def test_lastenheft_unlock_clears_the_flag_false_and_does_not_transition_status(run_cmd, mock):
    run = ticket(run_cmd, mock, "lastenheft", "unlock", "--id", "T000123")
    assert run.returncode == 0, run.output
    cap = mock["cap"].read_text()
    assert SQL_FLAG_FALSE in cap
    assert "THEN 'backlog'" not in cap


def test_plan_meta_requirements_writes_requirements_list_preserving_commas_pipe_separated(run_cmd, mock):
    run = ticket(run_cmd, mock, "plan-meta", "set", "--id", "T000123",
                 "--requirements", "Login via SSO|Export, als PDF")
    assert run.returncode == 0, run.output
    assert ("requirements_list = COALESCE(ARRAY['Login via SSO','Export, als PDF'], requirements_list)"
            in mock["cap"].read_text())
