"""Native migration of tests/spec/ci-cd/branch-reaper.bats."""

import os
import re
import subprocess
from pathlib import Path

import pytest


def _g(fx: Path, *args, check=True):
    """git -C <fixture> ... (Setup-Aequivalent, set -e)."""
    return subprocess.run(["git", "-C", str(fx), *args], capture_output=True, text=True, check=check)


def _count(lines_text: str, pattern: str, flags=0) -> int:
    """grep -c: Anzahl Zeilen mit Treffer."""
    return sum(1 for ln in lines_text.splitlines() if re.search(pattern, ln, flags))


def _grep(text: str, pattern: str) -> str:
    """grep 'pattern' (Zeilen, die passen) mit `|| true`."""
    return "\n".join(ln for ln in text.splitlines() if re.search(pattern, ln))


_GH_STUB = """#!/usr/bin/env bash
for a in "$@"; do
  if [ "$a" = "chore/openpr-T009003" ]; then echo '[{"number":42}]'; exit 0; fi
done
echo '[]'
"""

_TICKET_STUB = """#!/usr/bin/env bash
for a in "$@"; do
  if [ "$a" = "T009004" ]; then echo '{"external_id":"T009004","status":"in_progress"}'; exit 0; fi
done
echo '{"external_id":"T009001","status":"done"}'
"""


@pytest.fixture
def reaper(repo_root, tmp_path):
    fixture = tmp_path / "fixture"
    remote = tmp_path / "remote.git"
    stubs = tmp_path / "stubs"
    stubs.mkdir()
    plandir = fixture / ".agents/plans/x"
    reaper_path = repo_root / "scripts/branch-reaper.sh"

    subprocess.run(["git", "init", "--bare", "--quiet", str(remote)], check=True)
    subprocess.run(["git", "init", "--quiet", str(fixture)], check=True)
    _g(fixture, "config", "user.email", "t@example.com")
    _g(fixture, "config", "user.name", "Test")
    _g(fixture, "remote", "add", "origin", str(remote))

    # main: Basisstand, den alle Branches teilen
    plandir.mkdir(parents=True)
    (fixture / "scripts").mkdir()
    (plandir / "tasks.md").write_text("base\n")
    (fixture / "scripts/echt.sh").write_text("base\n")
    _g(fixture, "add", "-A")
    _g(fixture, "commit", "--quiet", "-m", "base")
    _g(fixture, "push", "--quiet", "origin", "HEAD:main")
    _g(fixture, "fetch", "--quiet", "origin")

    # Branch 1: nur Plan-Artefakt-Abweichung -> Allowlist trifft
    _g(fixture, "checkout", "--quiet", "-b", "chore/plan-T009001")
    (plandir / "tasks.md").write_text("abweichend\n")
    _g(fixture, "commit", "--quiet", "-am", "plan only")
    _g(fixture, "push", "--quiet", "origin", "chore/plan-T009001")

    # Branch 2: Quelldatei-Abweichung -> Allowlist trifft NICHT
    _g(fixture, "checkout", "--quiet", "main")
    _g(fixture, "checkout", "--quiet", "-b", "chore/src-T009002")
    (fixture / "scripts/echt.sh").write_text("abweichend\n")
    _g(fixture, "commit", "--quiet", "-am", "source change")
    _g(fixture, "push", "--quiet", "origin", "chore/src-T009002")

    # Branch 3 und 4: nur Allowlist-Abweichung
    _g(fixture, "checkout", "--quiet", "main")
    _g(fixture, "checkout", "--quiet", "-b", "chore/openpr-T009003")
    (plandir / "tasks.md").write_text("abweichend3\n")
    _g(fixture, "commit", "--quiet", "-am", "plan only")
    _g(fixture, "push", "--quiet", "origin", "chore/openpr-T009003")

    _g(fixture, "checkout", "--quiet", "main")
    _g(fixture, "checkout", "--quiet", "-b", "chore/openticket-T009004")
    (plandir / "tasks.md").write_text("abweichend4\n")
    _g(fixture, "commit", "--quiet", "-am", "plan only")
    _g(fixture, "push", "--quiet", "origin", "chore/openticket-T009004")

    # Branch 1 gemergt; Branch 2 bleibt ungemergt
    _g(fixture, "checkout", "--quiet", "main")
    _g(fixture, "merge", "--quiet", "chore/plan-T009001", "-m", "merge chore/plan-T009001")
    _g(fixture, "push", "--quiet", "origin", "main")

    # Branch 5: Datei auf Branch und main geloescht
    _g(fixture, "checkout", "--quiet", "-b", "chore/del-T009005")
    _g(fixture, "rm", "--quiet", str(fixture / "scripts/echt.sh"))
    _g(fixture, "commit", "--quiet", "-m", "delete echt.sh on branch")
    _g(fixture, "push", "--quiet", "origin", "chore/del-T009005")

    _g(fixture, "checkout", "--quiet", "main")
    _g(fixture, "merge", "--quiet", "chore/del-T009005", "-m", "merge chore/del-T009005")
    _g(fixture, "push", "--quiet", "origin", "main")

    _g(fixture, "checkout", "--quiet", "main")
    _g(fixture, "fetch", "--quiet", "origin")

    gh = stubs / "gh"
    gh.write_text(_GH_STUB)
    gh.chmod(0o755)
    ticket = stubs / "ticket-stub.sh"
    ticket.write_text(_TICKET_STUB)
    ticket.chmod(0o755)

    env = {
        "PATH": f"{stubs}{os.pathsep}{os.environ.get('PATH', '')}",
        "TICKET_SH": str(ticket),
    }
    return {"reaper": reaper_path, "fixture": fixture, "env": env, "repo": repo_root}


def _run(run_cmd, rp, *args):
    return run_cmd(["bash", str(rp["reaper"]), *args], cwd=rp["repo"], env=rp["env"])


def test_branch_mit_reinen_plan_artefakten_wird_zum_loeschen_vorgeschlagen(run_cmd, reaper):
    res = _run(run_cmd, reaper, "--dry-run", "--ticket", "T009001", "--repo", str(reaper["fixture"]))
    assert res.returncode == 0
    # Auf die REAP-Zeilen einschraenken.
    reaped = _grep(res.output, r"^REAP ")
    assert _count(reaped, "chore/plan-T009001") == 1


def test_branch_mit_abweichender_quelldatei_wird_verschont_und_begruendet(run_cmd, reaper):
    res = _run(run_cmd, reaper, "--dry-run", "--ticket", "T009002", "--repo", str(reaper["fixture"]))
    assert res.returncode == 0
    reaped = _grep(res.output, r"^REAP ")
    assert _count(reaped, "chore/src-T009002") == 0
    kept = _grep(_grep(res.output, r"^KEEP "), "chore/src-T009002")
    assert kept
    assert _count(kept, "T900096") == 1


def test_branch_mit_offenem_pr_wird_verschont_und_begruendet(run_cmd, reaper):
    res = _run(run_cmd, reaper, "--dry-run", "--ticket", "T009003", "--repo", str(reaper["fixture"]))
    assert res.returncode == 0
    reaped = _grep(res.output, r"^REAP ")
    assert _count(reaped, "chore/openpr-T009003") == 0
    kept = _grep(_grep(res.output, r"^KEEP "), "chore/openpr-T009003")
    assert kept
    assert _count(kept, r"pull request|offener PR|open PR", re.IGNORECASE) == 1


def test_branch_mit_offenem_ticket_wird_verschont_und_begruendet(run_cmd, reaper):
    res = _run(run_cmd, reaper, "--dry-run", "--ticket", "T009004", "--repo", str(reaper["fixture"]))
    assert res.returncode == 0
    reaped = _grep(res.output, r"^REAP ")
    assert _count(reaped, "chore/openticket-T009004") == 0
    kept = _grep(_grep(res.output, r"^KEEP "), "chore/openticket-T009004")
    assert kept
    assert _count(kept, "in_progress") == 1


def test_ungueltiges_ticket_id_format_wird_abgelehnt(run_cmd, reaper):
    # Positiv-Anker: eine gueltige ID laeuft durch.
    res = _run(run_cmd, reaper, "--dry-run", "--ticket", "T009001", "--repo", str(reaper["fixture"]))
    assert res.returncode == 0
    res = _run(run_cmd, reaper, "--dry-run", "--ticket", "T00.*", "--repo", str(reaper["fixture"]))
    assert res.returncode != 0
    # Die Ablehnung muss begruendet sein, nicht bloss ein Nicht-Null-Exit.
    assert _count(res.output, "ticket", re.IGNORECASE) >= 1


def test_beidseitig_geloeschte_datei_gilt_nicht_als_abweichend(run_cmd, reaper):
    res = _run(run_cmd, reaper, "--dry-run", "--ticket", "T009005", "--repo", str(reaper["fixture"]))
    assert res.returncode == 0
    reaped = _grep(res.output, r"^REAP ")
    assert _count(reaped, "chore/del-T009005") == 1
