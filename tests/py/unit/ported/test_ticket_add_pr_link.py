"""Native migration of tests/unit/ticket-add-pr-link.bats."""
import os
import re
import stat

import pytest


@pytest.fixture
def mock_env(tmp_path):
    """Fake kubectl on PATH that records stdin SQL to a capture file (setup() in BATS)."""
    mockdir = tmp_path / "mock"
    mockdir.mkdir()
    cap = tmp_path / "captured.sql"
    script = (
        "#!/usr/bin/env bash\n"
        "# get pod -> fake pod name; exec -> record stdin SQL to CAP\n"
        'if [[ "$*" == *"get pod"* ]]; then echo "pod/shared-db-0"; exit 0; fi\n'
        'if [[ "$*" == *"exec"* ]]; then cat >> "CAP_PATH"; echo "fake-uuid-1234"; exit 0; fi\n'
        "exit 0\n"
    ).replace("CAP_PATH", str(cap))
    kubectl = mockdir / "kubectl"
    kubectl.write_text(script, encoding="utf-8")
    kubectl.chmod(kubectl.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    env = {"PATH": f"{mockdir}{os.pathsep}{os.environ.get('PATH', '')}", "CAP": str(cap)}
    return {"env": env, "cap": cap}


@pytest.fixture
def ticket_sh(repo_root):
    return str(repo_root / "scripts" / "ticket.sh")


def test_add_pr_link_requires_id_and_pr(run_cmd, ticket_sh, mock_env):
    r = run_cmd(["bash", ticket_sh, "add-pr-link", "--id", "T000123"], env=mock_env["env"])
    assert r.returncode != 0
    assert "--id and --pr are required" in r.output


def test_add_pr_link_rejects_a_non_numeric_pr(run_cmd, ticket_sh, mock_env):
    r = run_cmd(["bash", ticket_sh, "add-pr-link", "--id", "T000123", "--pr", "abc"], env=mock_env["env"])
    assert r.returncode != 0
    assert "--pr must be an integer" in r.output


def test_add_pr_link_inserts_into_ticket_links_with_kind_pr_and_pr_number(run_cmd, ticket_sh, mock_env):
    r = run_cmd(["bash", ticket_sh, "add-pr-link", "--id", "T000123", "--pr", "1234"], env=mock_env["env"])
    assert r.returncode == 0
    # UUID SELECT und INSERT werden beide an CAP angehaengt.
    sql = mock_env["cap"].read_text(encoding="utf-8")
    assert "SELECT id FROM tickets.tickets" in sql
    assert "INSERT INTO tickets.ticket_links" in sql
    assert "kind" in sql
    assert re.search(r"pr_number", sql, re.IGNORECASE)
    # to_id ist NOT NULL (FK): der INSERT muss es setzen.
    assert "to_id" in sql
    # Keine Spalten aus dem Spec-Snippet (ref/url).
    assert not re.search(r"\bref\b|\burl\b", sql)
