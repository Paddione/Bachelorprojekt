"""Native migration of tests/spec/plan-lifecycle.bats."""

import os
import re
import subprocess
from pathlib import Path

import pytest

TICKET_STUB = """#!/usr/bin/env bash
if [ "$1" = "get" ]; then
  for a in "$@"; do [ "$a" = "T009004" ] && { echo '{"external_id":"T009004","status":"in_progress"}'; exit 0; }; done
  echo '{"status":"done"}'; exit 0
fi
if [ "$1" = "get-timeline" ]; then
  for a in "$@"; do
    [ "$a" = "T009001" ] && { echo '{"events":[{"source":"plan_archived","detail":{"slug":"demo-done"}}]}'; exit 0; }
    [ "$a" = "T009003" ] && { echo '{"events":[{"source":"plan_archived","detail":{"slug":"fremder-slug"}}]}'; exit 0; }
  done
  echo '{"events":[]}'; exit 0
fi
echo '{}'
"""

GH_STUB = "#!/usr/bin/env bash\necho '[]'\n"


def _git(fixture: Path, *args):
    return subprocess.run(["git", "-C", str(fixture), *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          text=True, check=True)


@pytest.fixture
def pl(repo_root, tmp_path):
    """BATS setup: Wegwerf-Repo mit origin/main, Stubs fuer gh und ticket.sh."""
    fixture = tmp_path / "fixture"
    remote = tmp_path / "remote.git"
    stubs = tmp_path / "stubs"
    stubs.mkdir()
    subprocess.run(["git", "init", "--bare", "--quiet", str(remote)], check=True)
    subprocess.run(["git", "init", "--quiet", str(fixture)], check=True)
    _git(fixture, "config", "user.email", "t@example.com")
    _git(fixture, "config", "user.name", "Test")
    _git(fixture, "remote", "add", "origin", str(remote))

    (fixture / ".agents" / "plans" / "demo-done").mkdir(parents=True)
    (fixture / ".agents" / "plans" / "demo-open").mkdir(parents=True)
    (fixture / ".agents" / "plans" / "demo-done" / "tasks.md").write_text(
        "---\ntitle: Demo\nticket_id: T009001\ndomains: [x]\nstatus: completed\n---\n", encoding="utf-8")
    (fixture / ".agents" / "plans" / "demo-open" / "tasks.md").write_text(
        "---\ntitle: Open\nticket_id: T009004\ndomains: [x]\nstatus: active\n---\n", encoding="utf-8")
    _git(fixture, "add", "-A")
    _git(fixture, "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "seed")
    _git(fixture, "push", "--quiet", "origin", "HEAD:main")
    _git(fixture, "fetch", "--quiet", "origin")
    _git(fixture, "checkout", "--quiet", "main")

    (stubs / "gh").write_text(GH_STUB, encoding="utf-8")
    (stubs / "gh").chmod(0o755)
    (stubs / "ticket-stub.sh").write_text(TICKET_STUB, encoding="utf-8")
    (stubs / "ticket-stub.sh").chmod(0o755)

    env = {
        "PATH": f"{stubs}{os.pathsep}{os.environ.get('PATH', '')}",
        "TICKET_SH": str(stubs / "ticket-stub.sh"),
    }
    reaper = os.environ.get("REAPER_OVERRIDE") or str(repo_root / "scripts" / "branch-reaper.sh")
    return {
        "fixture": fixture,
        "env": env,
        "reaper": reaper,
        "repo_root": repo_root,
    }


def _reaper(run_cmd, pl, *args):
    return run_cmd(["bash", pl["reaper"], *args], env=pl["env"])


def _commit_reticket(pl, from_id, to_id):
    fixture = pl["fixture"]
    tasks = fixture / ".agents" / "plans" / "demo-done" / "tasks.md"
    tasks.write_text(tasks.read_text(encoding="utf-8").replace(f"ticket_id: {from_id}", f"ticket_id: {to_id}"),
                     encoding="utf-8")
    _git(fixture, "-c", "commit.gpgsign=false", "commit", "--quiet", "-am", "reticket")
    _git(fixture, "push", "--quiet", "origin", "HEAD:main")
    _git(fixture, "fetch", "--quiet", "origin")


def _lines(output: str, prefix: str, needle: str = None):
    return [line for line in output.splitlines() if line.startswith(prefix) and (needle is None or needle in line)]


# Positiv-Anker: der lesende Sweep laeuft durch und benennt Plan-Kandidaten.
def test_t900999_p3_positiv_anker_sweep_plan_cleanup_dry_run_laeuft_und_nennt_plan_kandidaten(run_cmd, pl):
    r = _reaper(run_cmd, pl, "--sweep", "--plan-cleanup", "--dry-run", "--repo", str(pl["fixture"]))
    assert r.returncode == 0, r.output
    assert len([line for line in r.output.splitlines() if re.match(r"^(REAP|KEEP) PLAN ", line)]) >= 1


def test_t900999_p3_fall_a_done_ticket_ohne_record_delete_verweigert_exit_0_keep_ordner_bleibt(run_cmd, pl):
    # demo-done zeigt auf T009002 (done, kein Record im Stub).
    _commit_reticket(pl, "T009001", "T009002")
    r = _reaper(run_cmd, pl, "--sweep", "--plan-cleanup", "--dry-run", "--repo", str(pl["fixture"]))
    assert r.returncode == 0, r.output
    assert _lines(r.output, "KEEP PLAN ", "demo-done")
    assert not _lines(r.output, "REAP PLAN ", "demo-done")
    assert (pl["fixture"] / ".agents" / "plans" / "demo-done" / "tasks.md").is_file()


def test_t900999_p3_fall_b_done_ticket_mit_verifiziertem_record_delete_erlaubt_reap_plan(run_cmd, pl):
    r = _reaper(run_cmd, pl, "--sweep", "--plan-cleanup", "--dry-run", "--repo", str(pl["fixture"]))
    assert r.returncode == 0, r.output
    assert _lines(r.output, "REAP PLAN ", "demo-done")


def test_t900999_p3_fall_c_record_mit_falschem_slug_delete_verweigert(run_cmd, pl):
    _commit_reticket(pl, "T009001", "T009003")
    r = _reaper(run_cmd, pl, "--sweep", "--plan-cleanup", "--dry-run", "--repo", str(pl["fixture"]))
    assert r.returncode == 0, r.output
    assert _lines(r.output, "KEEP PLAN ", "demo-done")
    assert not _lines(r.output, "REAP PLAN ", "demo-done")


def test_t900999_p3_offenes_ticket_plan_ordner_wird_verschont(run_cmd, pl):
    r = _reaper(run_cmd, pl, "--sweep", "--plan-cleanup", "--dry-run", "--repo", str(pl["fixture"]))
    assert r.returncode == 0, r.output
    assert _lines(r.output, "KEEP PLAN ", "demo-open")
    assert not _lines(r.output, "REAP PLAN ", "demo-open")


def test_t900999_p3_plan_cleanup_ohne_sweep_wird_abgelehnt_kein_einzel_pfad(run_cmd, pl):
    r = _reaper(run_cmd, pl, "--plan-cleanup", "--repo", str(pl["fixture"]))
    assert r.returncode != 0


def test_t900999_p4_archive_plan_reason_bogus_scheitert_validiert_exit_2_ohne_cluster(run_cmd, pl):
    r = run_cmd(["bash", str(pl["repo_root"] / "scripts" / "ticket.sh"), "archive-plan", "--id", "T009001",
                 "--slug", "s", "--branch", "b",
                 "--plan-file", str(pl["fixture"] / ".agents" / "plans" / "demo-done" / "tasks.md"),
                 "--reason", "bogus"], env=pl["env"])
    assert r.returncode == 2, r.output
