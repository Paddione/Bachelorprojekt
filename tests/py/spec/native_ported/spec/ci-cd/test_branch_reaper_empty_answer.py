"""Native migration of tests/spec/ci-cd/branch-reaper-empty-answer.bats."""

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
  if [ "$a" = "T009010" ]; then exit 0; fi
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
    _branch("chore/plan-T009010")
    _branch("chore/plan-T009011")

    _g(fixture, "checkout", "--quiet", "main")
    _g(fixture, "merge", "--quiet", "-X", "theirs", "chore/plan-T009001", "-m", "merge chore/plan-T009001")
    _g(fixture, "merge", "--quiet", "-X", "theirs", "chore/plan-T009011", "-m", "merge chore/plan-T009011")
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
        "reaper": repo_root / "scripts/branch-reaper.sh",
        "repo": repo_root,
        "env": {
            "PATH": f"{stubs}{os.pathsep}{os.environ.get('PATH', '')}",
            "TICKET_SH": str(ticket),
        },
    }


def _run(run_cmd, c, *args):
    # BATS `run` merges stderr in emission order.
    return run_cmd(["bash", "-c", '"$@" 2>&1', "run", "bash", str(c["reaper"]), *args],
                   cwd=c["repo"], env=c["env"])


def test_t006329_positiv_anker_einzel_ticket_lauf_mit_bekannter_id_liefert_eine_reap_zeile(run_cmd, ctx):
    res = _run(run_cmd, ctx, "--dry-run", "--ticket", "T009001", "--repo", str(ctx["fixture"]))
    assert res.returncode == 0
    reaped = _grep(res.output, r"^REAP ")
    assert _count(reaped, "chore/plan-T009001") == 1


def test_t006329_branch_mit_leerer_ticket_sh_antwort_verschont_den_sweep_nicht(run_cmd, ctx):
    res = _run(run_cmd, ctx, "--dry-run", "--repo", str(ctx["fixture"]))
    assert res.returncode == 0
    # (a) Problem-Branch wird NICHT gereapt und taucht als KEEP auf.
    assert _count(_grep(res.output, r"^REAP "), "chore/plan-T009010") == 0
    assert _grep(_grep(res.output, r"^KEEP "), "chore/plan-T009010") != ""
    # (b) Der Lauf hat den Problem-Branch ueberlebt: T009011 wird gereapt.
    assert _count(_grep(res.output, r"^REAP "), "chore/plan-T009011") == 1


def test_t006329_einzel_ticket_lauf_mit_unbekannter_id_bricht_nicht_ab(run_cmd, ctx):
    res = _run(run_cmd, ctx, "--dry-run", "--ticket", "T009010", "--repo", str(ctx["fixture"]))
    assert res.returncode == 0
    # Keine REAP-Zeile: ein nicht ermittelbarer Status gibt keinen Branch frei.
    assert _count(_grep(res.output, r"^REAP "), "chore/plan-T009010") == 0
