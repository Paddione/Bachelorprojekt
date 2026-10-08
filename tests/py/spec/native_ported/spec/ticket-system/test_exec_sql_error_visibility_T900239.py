"""Native migration of tests/spec/ticket-system/exec-sql-error-visibility-T900239.bats."""

import os
import shutil

import pytest

ERROR_KUBECTL = """#!/usr/bin/env bash
echo "$*" >> "{log}"
case " $* " in
  *" exec "*)
    echo "ERROR:  column tp.brand does not exist" >&2
    exit 3
    ;;
esac
exit 0
"""

OK_KUBECTL = """#!/usr/bin/env bash
echo "$*" >> "{log}"
exit 0
"""


@pytest.fixture
def ev(repo_root, tmp_path, monkeypatch):
    fix = tmp_path
    log = fix / "kubectl.log"
    log.write_text("")
    (fix / "bin").mkdir()
    stub = fix / "bin" / "kubectl"
    stub.write_text(ERROR_KUBECTL.format(log=log))
    stub.chmod(0o755)
    monkeypatch.setenv("STUB_LOG", str(log))
    monkeypatch.setenv("PATH", f"{fix / 'bin'}:{os.environ.get('PATH', '')}")
    return {"repo": repo_root, "fix": fix, "log": log}


def test_positiv_anker_exec_sql_laesst_eine_erfolgreiche_select_query_normal_durch(ev, run_cmd):
    fix = ev["fix"]
    ok_bin = fix / "bin-ok"
    ok_bin.mkdir()
    ok = ok_bin / "kubectl"
    ok.write_text(OK_KUBECTL.format(log=ev["log"]))
    ok.chmod(0o755)
    script = fix / "exec-ok.sh"
    script.write_text(
        "set -euo pipefail\n"
        'CTX="fleet"; NS=workspace\n'
        'source "$REPO_ROOT/scripts/vda/ticket/_ticket-core.sh"\n'
        '_exec_sql pod/shared-db-0 <<<"SELECT 1;"\n'
        'echo "REACHED_AFTER_OK"\n'
    )
    res = run_cmd(["bash", str(script)],
                  env={"REPO_ROOT": str(ev["repo"]), "PATH": f"{ok_bin}:{os.environ['PATH']}"})
    assert res.returncode == 0, res.output
    assert "REACHED_AFTER_OK" in res.output


def test_exec_sql_sql_fehler_unter_set_e_zeigt_die_fehlerursache_auf_stderr_statt_still_abzubrechen(ev, run_cmd):
    script = ev["fix"] / "exec-err.sh"
    script.write_text(
        "set -euo pipefail\n"
        'CTX="fleet"; NS=workspace\n'
        'source "$REPO_ROOT/scripts/vda/ticket/_ticket-core.sh"\n'
        '_exec_sql pod/shared-db-0 <<<"SELECT 1;"\n'
    )
    res = run_cmd(["bash", str(script)], env={"REPO_ROOT": str(ev["repo"])})
    # Der Exit-Code war schon vor dem Fix nonzero; das Defizit war die fehlende Fehlerursache auf stderr.
    assert res.returncode != 0
    assert "column tp.brand does not exist" in res.output
