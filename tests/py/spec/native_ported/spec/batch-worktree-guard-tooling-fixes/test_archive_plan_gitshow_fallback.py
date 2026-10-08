"""Native migration of tests/spec/batch-worktree-guard-tooling-fixes/archive-plan-gitshow-fallback.bats."""

import os
import stat

import pytest

KUBECTL_STUB = r'''#!/bin/bash
# T015008: ctx-guard probe vor dem Write — LAN-Server vorgaukeln.
if [[ "$*" == *"config view"* ]]; then
  if [[ "$*" == *".contexts["* ]]; then echo "stub-cluster"; else echo "https://10.0.33.1:6443"; fi
  exit 0
fi
if [[ "$1" == "get" ]]; then
  echo "pod/shared-db-0"
elif [[ "$1" == "exec" ]]; then
  # ticket.sh: `printf "%s" "$plan_content" | kubectl exec ...` — stdin lesen
  TMP_IN=$(mktemp)
  cat > "$TMP_IN"

  SQL_CONTENT=$(cat "$TMP_IN")
  if [[ "$SQL_CONTENT" == *"db_identity"* ]]; then
    # Identity-Probe (T015168): der Stub antwortet mit der SSOT-Kennung, damit die
    # produktive Pruefung ohne BATS-Sentinel gruen laeuft.
    echo "${TICKET_DB_IDENTITY_EXPECTED:-9f1d3c6e-4b2a-4f8a-9c1d-7e5b3a2f1d00}"
  elif [[ "$SQL_CONTENT" == *"SELECT id FROM tickets.tickets"* ]]; then
    echo "11111111-2222-3333-4444-555555555555"
  elif [[ "$SQL_CONTENT" == *"SELECT count"* ]]; then
    echo "1"
  else
    echo "INSERT 0 1"
  fi
  mkdir -p "$(dirname "$KUBECTL_LOG")"
  cat "$TMP_IN" >> "$KUBECTL_LOG"
  rm "$TMP_IN"
fi
'''


def _git(run_cmd, cwd, *args):
    result = run_cmd(["git", *args], cwd=cwd)
    assert result.returncode == 0, result.output
    return result


@pytest.fixture
def fixture_env(repo_root, run_cmd, tmp_path):
    bats_tmpdir = tmp_path
    stub_bin = bats_tmpdir / "bin"
    stub_bin.mkdir(parents=True, exist_ok=True)

    kubectl = stub_bin / "kubectl"
    kubectl.write_text(KUBECTL_STUB, encoding="utf-8")
    kubectl.chmod(kubectl.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    fixture = bats_tmpdir / "fixture"
    fixture.mkdir(parents=True, exist_ok=True)

    # Fixture: die Plandatei existiert NUR im Branch, nicht auf Disk.
    _git(run_cmd, fixture, "init", "-b", "main")
    _git(run_cmd, fixture, "config", "user.email", "test@example.com")
    _git(run_cmd, fixture, "config", "user.name", "Test User")
    (fixture / "README.md").touch()
    _git(run_cmd, fixture, "add", "README.md")
    _git(run_cmd, fixture, "commit", "-m", "chore: init")

    _git(run_cmd, fixture, "checkout", "-b", "feature/plan-only-T004269")
    (fixture / "plans").mkdir()
    (fixture / "plans" / "demo.md").write_text("NUR-IM-BRANCH-ARCHIV-TEST\n", encoding="utf-8")
    _git(run_cmd, fixture, "add", "plans/demo.md")
    _git(run_cmd, fixture, "commit", "-m", "feat: add plan")
    _git(run_cmd, fixture, "checkout", "main")

    return {"stub_bin": stub_bin, "fixture": fixture, "tmpdir": bats_tmpdir}


def test_archive_plan_with_git_show_fallback_status_0_and_marker_in_log(repo_root, run_cmd, fixture_env):
    kubectl_log = fixture_env["tmpdir"] / "kubectl.log"
    if kubectl_log.exists():
        kubectl_log.unlink()

    env = {
        "PATH": f"{fixture_env['stub_bin']}{os.pathsep}{os.environ.get('PATH', '')}",
        "KUBECTL_LOG": str(kubectl_log),
    }
    result = run_cmd(
        ["bash", str(repo_root / "scripts/ticket.sh"), "archive-plan",
         "--id", "T004269",
         "--slug", "demo",
         "--branch", "feature/plan-only-T004269",
         "--plan-file", "plans/demo.md"],
        cwd=fixture_env["fixture"],
        env=env,
    )

    assert result.returncode == 0, result.output
    assert "Plan successfully archived for ticket T004269" in result.output
    # git-show-Fallback muss den Plan-Inhalt real in den INSERT-Stdin liefern.
    assert kubectl_log.exists()
    assert "NUR-IM-BRANCH-ARCHIV-TEST" in kubectl_log.read_text(encoding="utf-8")


def test_fehlerpfad_weder_datei_noch_blob_exit_ungleich_0_und_alte_meldung(repo_root, run_cmd, fixture_env):
    env = {
        "PATH": f"{fixture_env['stub_bin']}{os.pathsep}{os.environ.get('PATH', '')}",
    }
    result = run_cmd(
        ["bash", str(repo_root / "scripts/ticket.sh"), "archive-plan",
         "--id", "T004269",
         "--slug", "demo",
         "--branch", "feature/plan-only-T004269",
         "--plan-file", "plans/ghost.md"],
        cwd=fixture_env["fixture"],
        env=env,
    )

    assert result.returncode != 0
    assert "plan file does not exist or is empty" in result.output
