"""Native migration of tests/unit/ticket-grill.bats.

Offline: `ticket.sh grill` argument validation, JSON build from --answer pairs
and the merge SQL shape. kubectl is mocked via PATH; no live cluster.
"""
import json
import os
import re
import shutil
from pathlib import Path

import pytest


@pytest.fixture
def mock_env(tmp_path, repo_root):
    mockdir = tmp_path / "mock"
    mockdir.mkdir()
    cap = mockdir / "captured.sql"
    kubectl = mockdir / "kubectl"
    kubectl.write_text(
        "#!/usr/bin/env bash\n"
        'if [[ "$*" == *"get pod"* ]]; then echo "pod/shared-db-0"; exit 0; fi\n'
        f'if [[ "$*" == *"exec"* ]]; then echo "# kubectl $*" >> "{cap}"; cat >> "{cap}"; echo "1"; exit 0; fi\n'
        "exit 0\n"
    )
    kubectl.chmod(0o755)
    env = {"PATH": f"{mockdir}{os.pathsep}{os.environ.get('PATH', '')}", "CAP": str(cap)}
    return {
        "env": env,
        "cap": cap,
        "ticket": str(repo_root / "scripts" / "ticket.sh"),
        "tmp": tmp_path,
    }


def _captured(mock_env):
    cap = mock_env["cap"]
    return cap.read_text(encoding="utf-8") if cap.exists() else ""


def _grill(run_cmd, mock_env, *args):
    return run_cmd(["bash", mock_env["ticket"], "grill", *args], env=mock_env["env"])


def test_grill_requires_id_deterministic_exit_2_without_a_cluster(run_cmd, mock_env):
    r = _grill(run_cmd, mock_env, "--answer", "q1=foo")
    assert r.returncode == 2, r.output
    assert "--id is required" in r.output


def test_grill_requires_an_answer_source(run_cmd, mock_env):
    r = _grill(run_cmd, mock_env, "--id", "T000123")
    assert r.returncode == 2, r.output
    assert "one answer source is required" in r.output


def test_grill_rejects_more_than_one_answer_source(run_cmd, mock_env):
    r = _grill(run_cmd, mock_env, "--id", "T000123", "--json", '{"q1":"a"}', "--answer", "q2=b")
    assert r.returncode == 2, r.output
    assert "exactly one of" in r.output


def test_grill_rejects_a_malformed_answer_pair(run_cmd, mock_env):
    r = _grill(run_cmd, mock_env, "--id", "T000123", "--answer", "noequalshere")
    assert r.returncode == 2, r.output
    assert "<qid>=<text>" in r.output


def test_grill_builds_q1_foo_q2_bar_from_repeated_answer(run_cmd, mock_env):
    r = _grill(run_cmd, mock_env, "--id", "T000123", "--answer", "q1=foo", "--answer", "q2=bar")
    assert r.returncode == 0, r.output
    cap = _captured(mock_env)
    assert '"q1":"foo"' in cap
    assert '"q2":"bar"' in cap


def test_grill_emits_idempotent_add_column_per_question_merge_sql(run_cmd, mock_env):
    r = _grill(run_cmd, mock_env, "--id", "T000123", "--answer", "q1=foo")
    assert r.returncode == 0, r.output
    cap = _captured(mock_env)
    assert "ADD COLUMN IF NOT EXISTS grilling_answers JSONB" in cap
    assert "UPDATE tickets.tickets" in cap
    assert "jsonb_build_object" in cap
    assert "COALESCE(grilling_answers" in cap


def test_grill_no_comment_skips_the_timeline_comment_insert(run_cmd, mock_env):
    r = _grill(run_cmd, mock_env, "--id", "T000123", "--answer", "q1=foo", "--no-comment")
    assert r.returncode == 0, r.output
    assert "INSERT INTO tickets.ticket_comments" not in _captured(mock_env)


def test_grill_default_writes_a_grilling_authored_timeline_comment(run_cmd, mock_env):
    r = _grill(run_cmd, mock_env, "--id", "T000123", "--answer", "q1=foo")
    assert r.returncode == 0, r.output
    cap = _captured(mock_env)
    assert "INSERT INTO tickets.ticket_comments" in cap
    assert "'grilling'" in cap


def test_grill_grilling_doc_rejects_a_missing_file(run_cmd, mock_env):
    r = _grill(run_cmd, mock_env, "--id", "T000999", "--grilling-doc", "/no/such/file.md")
    assert r.returncode == 2, r.output
    assert "grilling doc missing or empty" in r.output


def test_grill_grilling_doc_conflicts_with_json_exactly_one_source(run_cmd, mock_env):
    doc = mock_env["tmp"] / "g.md"
    doc.write_text("## Q?\n")
    r = _grill(run_cmd, mock_env, "--id", "T000999", "--grilling-doc", str(doc), "--json", '{"q1":"x"}')
    assert r.returncode == 2, r.output
    assert "exactly one of" in r.output


def test_grill_grilling_doc_dry_run_json_splits_answered_vs_unanswered(run_cmd, mock_env):
    doc = mock_env["tmp"] / "g.md"
    doc.write_text(
        "---\n"
        "questionnaire: gekko-x\n"
        "title: Gekko X\n"
        "---\n"
        "## Frage eins?\n"
        "Antwort: Antwort eins.\n"
        "## Frage zwei?\n"
        "## Frage drei? {#drei}\n"
        "A: —\n"
    )
    r = _grill(run_cmd, mock_env, "--id", "T000999", "--grilling-doc", str(doc), "--dry-run-json")
    assert r.returncode == 0, r.output
    out = r.output
    assert '"questionnaireId":"gekko-x"' in out
    assert '"answers":{"q1":"Antwort eins."}' in out
    assert '"id":"drei"' in out
    assert '"drei":' not in out


def test_grill_grilling_doc_auto_assigns_q1_qn_and_accepts_numbered_markers(run_cmd, mock_env):
    doc = mock_env["tmp"] / "n.md"
    doc.write_text("1. Erste?\nAntwort: A.\n2) Zweite?\n")
    r = _grill(run_cmd, mock_env, "--id", "T000999", "--grilling-doc", str(doc), "--dry-run-json")
    assert r.returncode == 0, r.output
    assert '"answers":{"q1":"A."}' in r.output
    assert '"id":"q2"' in r.output


def test_grill_emits_deprecation_warning_on_stderr(run_cmd, mock_env):
    r = _grill(run_cmd, mock_env, "--id", "T000123", "--answer", "q1=foo")
    assert r.returncode == 0, r.output
    assert "deprecated" in r.stderr
    assert "vda.sh ticket triage" in r.stderr


def test_grill_stdout_shape_unchanged_despite_deprecation(run_cmd, mock_env):
    r = _grill(run_cmd, mock_env, "--id", "T000123", "--answer", "q1=foo")
    assert r.returncode == 0, r.output
    assert r.stdout.startswith("Grilling session")
    assert "deprecated" not in r.stdout
