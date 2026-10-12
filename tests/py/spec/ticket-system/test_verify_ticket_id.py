"""T901953: verify-ticket-id.sh rejectet alle IDs.

Das Skript fragt `SELECT uuid::text FROM tickets.tickets` ab, die Spalte
heisst `id` (information_schema, 12.10.). Folge: Exit 1 fuer jede
existierende ID — der T002371-Guard ist wirkungslos.

Der kubectl-Stub emuliert die information_schema-Wahrheit: SQL mit
`uuid::text` scheitert wie psql (Fehler + Exit 1), SQL mit `id::text`
liefert die UUID fuer die bekannte ID aus $KNOWN_ID.
"""

import os

import pytest

STUB_KUBECTL = """#!/usr/bin/env bash
# Mock-kubectl: emuliert Pod-Lookup + psql mit information_schema-Wahrheit.
if [[ " $* " == *" get pod "* ]]; then
  echo "pod/shared-db-0"
  exit 0
fi
sql="$(cat)"; eid=""
for a in "$@"; do
  if [[ "$a" == eid=* ]]; then eid="${a#eid=}"; fi
done
if [[ "$sql" == *"uuid::text"* ]]; then
  echo 'psql: ERROR: column "uuid" does not exist' >&2
  exit 1
fi
if [[ -n "$eid" && "$eid" == "$KNOWN_ID" ]]; then
  echo "42c4c6d9-5b0a-4423-b882-86a5786c907b"
fi
exit 0
"""


@pytest.fixture
def guard(repo_root, tmp_path, monkeypatch):
    """kubectl-Stub auf PATH + Runner fuer das echte Guard-Skript."""
    bindir = tmp_path / "bin"
    bindir.mkdir()
    stub = bindir / "kubectl"
    stub.write_text(STUB_KUBECTL)
    stub.chmod(0o755)
    monkeypatch.setenv("PATH", f"{bindir}{os.pathsep}{os.environ['PATH']}")

    def run(ext_id, run_cmd):
        env = {"KNOWN_ID": "T901952"}
        return run_cmd(
            ["bash", str(repo_root / "scripts/verify-ticket-id.sh"),
             ext_id, "mentolder"],
            cwd=repo_root,
            env=env,
        )

    return {"run": run}


def test_bekannte_id_ist_ok(guard, run_cmd):
    """Kern-Regression T901953: existierende ID wird akzeptiert (Exit 0)."""
    res = guard["run"]("T901952", run_cmd)
    assert res.returncode == 0, res.output
    assert "OK" in res.output


def test_unbekannte_id_ist_rejected(guard, run_cmd):
    """Fail-closed-Pin: unbekannte ID bleibt REJECTED (Exit 1)."""
    res = guard["run"]("T000000", run_cmd)
    assert res.returncode == 1, res.output
    assert "REJECTED" in res.output
