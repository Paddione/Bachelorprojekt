"""Native migration of tests/spec/ticket-seq-integrity/seq-repair.bats."""

import subprocess
from pathlib import Path

import pytest


@pytest.fixture
def emitter(repo_root: Path) -> Path:
    return repo_root / "scripts" / "vda" / "ticket" / "_seq-repair-sql.sh"


@pytest.fixture
def ticket_sh(repo_root: Path) -> Path:
    return repo_root / "scripts" / "ticket.sh"


def _emit(run_cmd, emitter: Path) -> str:
    # sql="$(bash "$EMITTER")": command substitution drops trailing newlines.
    return run_cmd(["bash", str(emitter)]).stdout.rstrip("\n")


def test_t015011_emitter_produces_setval_against_max_numeric_external_id(emitter, run_cmd):
    """T015011: emitter produces setval against max numeric external_id"""
    sql = _emit(run_cmd, emitter)
    assert sql, "Emitter leer"
    assert "setval(" in sql, "kein setval"
    assert "last_value" in sql, "last_value fehlt"
    assert "substring(external_id FROM 2)" in sql, "external_id-Numeric-Teil fehlt"
    assert "'^T[0-9]+$'" in sql, "Format-Anker auf T-Zahlen fehlt"


def test_t015011_emitter_does_not_reference_the_uuid_id_column_as_sequence_source(emitter, run_cmd):
    """T015011: emitter does NOT reference the uuid id column as sequence source"""
    sql = _emit(run_cmd, emitter)
    assert sql, "Emitter leer"
    assert "MAX(id)" not in sql, "MAX(id) ist falsch — id ist eine UUID, nicht die Sequenzquelle"


def test_t015011_emitter_output_is_a_single_statement_terminated_by_semicolon(emitter, run_cmd):
    """T015011: emitter output is a single statement terminated by semicolon"""
    sql = _emit(run_cmd, emitter)
    assert sql.endswith(";"), "kein Statement-Abschluss"
    assert sum(1 for line in sql.splitlines() if ";" in line) <= 1, "mehrere Statements"


def test_t015011_ticket_sh_wires_seq_repair_into_its_dispatch_table_structural(ticket_sh):
    """T015011: ticket.sh wires seq-repair into its dispatch table (structural)"""
    assert "seq-repair)        cmd_seq_repair" in ticket_sh.read_text(encoding="utf-8"), "seq-repair fehlt im Dispatch"


def test_t015011_both_scripts_are_syntactically_valid_bash(emitter, ticket_sh):
    """T015011: both scripts are syntactically valid bash"""
    for script in (emitter, ticket_sh):
        result = subprocess.run(["bash", "-n", str(script)], capture_output=True, text=True)
        assert result.returncode == 0, f"{script.name}: {result.stdout}{result.stderr}"
