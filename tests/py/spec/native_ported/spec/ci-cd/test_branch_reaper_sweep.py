"""Native migration of tests/spec/ci-cd/branch-reaper-sweep.bats."""

import os
import re
import subprocess
from pathlib import Path

import pytest


def _g(fx: Path, *args, check=True):
    return subprocess.run(["git", "-C", str(fx), *args], capture_output=True, text=True, check=check)


def _grep(text: str, pattern: str) -> str:
    return "\n".join(ln for ln in text.splitlines() if re.search(pattern, ln))


def _count(text: str, pattern: str) -> int:
    return sum(1 for ln in text.splitlines() if re.search(pattern, ln))


_TICKET_STUB = """#!/usr/bin/env bash
for a in "$@"; do
  if [ "$a" = "T009004" ]; then echo '{"external_id":"T009004","status":"in_progress"}'; exit 0; fi
done
echo '{"status":"done"}'
"""


@pytest.fixture
def ctx(repo_root, tmp_path):
    fixture = tmp_path / "fixture"
    remote = tmp_path / "remote.git"
    stubs = tmp_path / "stubs"
    stubs.mkdir()
    plandir = fixture / ".agents/plans/x"

    subprocess.run(["git", "init", "--bare", "--quiet", str(remote)], check=True)
    subprocess.run(["git", "init", "--quiet", str(fixture)], check=True)
    _g(fixture, "config", "user.email", "t@example.com")
    _g(fixture, "config", "user.name", "Test")
    _g(fixture, "remote", "add", "origin", str(remote))

    plandir.mkdir(parents=True)
    (plandir / "tasks.md").write_text("base\n")
    _g(fixture, "add", "-A")
    _g(fixture, "commit", "--quiet", "-m", "base")
    _g(fixture, "push", "--quiet", "origin", "HEAD:main")

    def _branch(name):
        _g(fixture, "checkout", "--quiet", "main")
        _g(fixture, "checkout", "--quiet", "-b", name)
        (plandir / "tasks.md").write_text(name + "\n")
        _g(fixture, "commit", "--quiet", "-am", "plan only")
        _g(fixture, "push", "--quiet", "origin", name)

    _branch("chore/plan-T009001")
    _branch("chore/plan-T009002")
    _branch("chore/open-T009004")
    _branch("chore/ohne-ticket")

    _g(fixture, "checkout", "--quiet", "main")
    _g(fixture, "merge", "--quiet", "-X", "theirs", "chore/plan-T009001", "-m", "merge chore/plan-T009001")
    _g(fixture, "merge", "--quiet", "-X", "theirs", "chore/plan-T009002", "-m", "merge chore/plan-T009002")
    _g(fixture, "push", "--quiet", "origin", "main")
    _g(fixture, "checkout", "--quiet", "main")
    _g(fixture, "fetch", "--quiet", "origin")

    gh = stubs / "gh"
    gh.write_text("#!/usr/bin/env bash\necho '[]'\n")
    gh.chmod(0o755)
    ticket = stubs / "ticket-stub.sh"
    ticket.write_text(_TICKET_STUB)
    ticket.chmod(0o755)

    return {
        "fixture": fixture,
        "remote": remote,
        "reaper": repo_root / "scripts/branch-reaper.sh",
        "repo": repo_root,
        "env": {
            "PATH": f"{stubs}{os.pathsep}{os.environ.get('PATH', '')}",
            "TICKET_SH": str(ticket),
        },
    }


def _run(run_cmd, c, *args):
    return run_cmd(["bash", "-c", '"$@" 2>&1', "run", "bash", str(c["reaper"]), *args],
                   cwd=c["repo"], env=c["env"])


def _distinct_reaped_tickets(output: str) -> int:
    ids = set()
    for ln in output.splitlines():
        if ln.startswith("REAP "):
            ids.update(re.findall(r"T\d{6}", ln))
    return len(ids)


def test_t003180_positiv_anker_einzel_ticket_modus_liefert_weiterhin_eine_reap_zeile(run_cmd, ctx):
    res = _run(run_cmd, ctx, "--dry-run", "--ticket", "T009001", "--repo", str(ctx["fixture"]))
    assert res.returncode == 0
    reaped = _grep(res.output, r"^REAP ")
    assert _count(reaped, "chore/plan-T009001") == 1
    # Gegenprobe zur Abgrenzung: der Einzel-Lauf sieht das zweite Ticket NICHT.
    assert _count(reaped, "chore/plan-T009002") == 0


def test_t003180_dry_run_ohne_ticket_ist_aufrufbar_und_listet_kandidaten(run_cmd, ctx):
    res = _run(run_cmd, ctx, "--dry-run", "--repo", str(ctx["fixture"]))
    assert res.returncode == 0
    assert _count(res.output, r"^REAP ") >= 1


def test_t003074_der_ticketlose_sweep_erfasst_mehr_als_eine_ticket_id(run_cmd, ctx):
    res = _run(run_cmd, ctx, "--dry-run", "--repo", str(ctx["fixture"]))
    assert res.returncode == 0
    assert _distinct_reaped_tickets(res.output) >= 2
    reaped = _grep(res.output, r"^REAP ")
    assert _count(reaped, "chore/plan-T009001") == 1
    assert _count(reaped, "chore/plan-T009002") == 1


def test_t003074_der_sweep_loest_den_ticket_status_je_branch_auf_und_verschont_offene_tickets(run_cmd, ctx):
    res = _run(run_cmd, ctx, "--dry-run", "--repo", str(ctx["fixture"]))
    assert res.returncode == 0
    assert _count(_grep(res.output, r"^REAP "), "chore/open-T009004") == 0
    assert _grep(_grep(res.output, r"^KEEP "), "chore/open-T009004") != ""


def test_t003074_ein_branch_ohne_ticket_id_im_namen_wird_im_sweep_nicht_geloescht(run_cmd, ctx):
    res = _run(run_cmd, ctx, "--dry-run", "--repo", str(ctx["fixture"]))
    assert res.returncode == 0
    assert _count(_grep(res.output, r"^REAP "), "chore/ohne-ticket") == 0
    assert _grep(_grep(res.output, r"^KEEP "), "chore/ohne-ticket") != ""


def test_t003180_ticketloser_aufruf_ohne_dry_run_loescht_nicht_versehentlich(run_cmd, ctx):
    res = _run(run_cmd, ctx, "--dry-run", "--repo", str(ctx["fixture"]))
    assert res.returncode == 0
    _run(run_cmd, ctx, "--repo", str(ctx["fixture"]))
    ls = subprocess.run(["git", "ls-remote", "--heads", str(ctx["remote"])], capture_output=True, text=True).stdout
    assert _count(ls, "refs/heads/chore/") == 4
