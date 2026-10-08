"""Native migration of tests/spec/ci-cd/branch-reaper-freshness-regen.bats."""

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


_GH_STUB = """#!/usr/bin/env bash
branch=""; state=""
while [ $# -gt 0 ]; do
  case "$1" in
    --head) branch="$2"; shift 2 ;;
    --state) state="$2"; shift 2 ;;
    *) shift ;;
  esac
done
if [ "$state" != "all" ]; then echo '[]'; exit 0; fi
case "$branch" in
  chore/freshness-regen-31781030910) echo '[{"state":"MERGED"}]' ;;
  chore/freshness-regen-31819894419) echo '[{"state":"MERGED"}]' ;;
  chore/freshness-regen-31832299018) echo '[{"state":"OPEN"}]' ;;
  chore/freshness-regen-31839712179) echo '[{"state":"CLOSED"}]' ;;
  *) echo '[]' ;;
esac
"""

FR_MERGED = "chore/freshness-regen-31781030910"
FR_MERGED_OUT = "chore/freshness-regen-31819894419"
FR_OPEN = "chore/freshness-regen-31832299018"
FR_CLOSED = "chore/freshness-regen-31839712179"
FR_NOPR = "chore/freshness-regen-31842116870"


@pytest.fixture
def ctx(repo_root, tmp_path):
    fixture = tmp_path / "fixture"
    remote = tmp_path / "remote.git"
    stubs = tmp_path / "stubs"
    stubs.mkdir()
    plandir = fixture / ".agents/plans/x"
    codedir = fixture / "docs/code-quality"

    subprocess.run(["git", "init", "--bare", "--quiet", str(remote)], check=True)
    subprocess.run(["git", "init", "--quiet", str(fixture)], check=True)
    _g(fixture, "config", "user.email", "t@example.com")
    _g(fixture, "config", "user.name", "Test")
    _g(fixture, "remote", "add", "origin", str(remote))

    plandir.mkdir(parents=True)
    codedir.mkdir(parents=True)
    (fixture / "src").mkdir()
    (plandir / "tasks.md").write_text("base\n")
    (codedir / "repo-index.json").write_text("v1\n")
    _g(fixture, "add", "-A")
    _g(fixture, "commit", "--quiet", "-m", "base")
    _g(fixture, "push", "--quiet", "origin", "HEAD:main")

    def _branch(name, draft=False):
        _g(fixture, "checkout", "--quiet", "main")
        _g(fixture, "checkout", "--quiet", "-b", name)
        (codedir / "repo-index.json").write_text(name + "\n")
        if draft:
            (fixture / "src/draft.txt").write_text("draft\n")
            _g(fixture, "add", "-A")
        _g(fixture, "commit", "--quiet", "-am", f"regen {name}")
        _g(fixture, "push", "--quiet", "origin", name)

    _branch(FR_MERGED)
    _branch(FR_MERGED_OUT, draft=True)
    _branch(FR_OPEN)
    _branch(FR_CLOSED)
    _branch(FR_NOPR)
    _branch("chore/ohne-ticket")

    _g(fixture, "checkout", "--quiet", "main")
    _g(fixture, "merge", "--quiet", FR_MERGED, "-m", f"merge {FR_MERGED}")
    _g(fixture, "push", "--quiet", "origin", "main")
    _g(fixture, "checkout", "--quiet", "main")
    _g(fixture, "fetch", "--quiet", "origin")

    gh = stubs / "gh"
    gh.write_text(_GH_STUB)
    gh.chmod(0o755)
    ticket = stubs / "ticket-stub.sh"
    ticket.write_text("#!/usr/bin/env bash\necho '{\"status\":\"done\"}'\n")
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


def _dry(run_cmd, c):
    return _run(run_cmd, c, "--dry-run", "--repo", str(c["fixture"]))


def test_t005958_positiv_anker_gemergter_freshness_regen_branch_wird_reap_kandidat(run_cmd, ctx):
    res = _dry(run_cmd, ctx)
    assert res.returncode == 0
    assert _count(_grep(res.output, r"^REAP "), FR_MERGED) == 1


def test_t005958_geschlossener_unmergter_freshness_regen_branch_wird_verschont_t900096_guard(run_cmd, ctx):
    res = _dry(run_cmd, ctx)
    assert res.returncode == 0
    # Positiv-Anker im selben Lauf.
    assert _count(_grep(res.output, r"^REAP "), FR_MERGED) == 1
    kept = _grep(_grep(res.output, r"^KEEP "), FR_CLOSED)
    assert kept
    assert _count(kept, "T900096") == 1


def test_t005958_freshness_regen_branch_mit_abweichung_ausserhalb_der_allowlist_wird_verschont(run_cmd, ctx):
    res = _dry(run_cmd, ctx)
    assert res.returncode == 0
    assert _count(_grep(res.output, r"^REAP "), FR_MERGED) == 1
    assert _count(_grep(res.output, r"^REAP "), FR_MERGED_OUT) == 0
    assert _grep(_grep(res.output, r"^KEEP "), FR_MERGED_OUT) != ""


def test_t005958_freshness_regen_branch_mit_offenem_pr_wird_verschont(run_cmd, ctx):
    res = _dry(run_cmd, ctx)
    assert res.returncode == 0
    assert _count(_grep(res.output, r"^REAP "), FR_MERGED) == 1
    assert _count(_grep(res.output, r"^REAP "), FR_OPEN) == 0
    assert _grep(_grep(res.output, r"^KEEP "), FR_OPEN) != ""


def test_t005958_freshness_regen_branch_ohne_auffindbaren_pr_wird_verschont(run_cmd, ctx):
    res = _dry(run_cmd, ctx)
    assert res.returncode == 0
    assert _count(_grep(res.output, r"^REAP "), FR_MERGED) == 1
    assert _count(_grep(res.output, r"^REAP "), FR_NOPR) == 0
    assert _grep(_grep(res.output, r"^KEEP "), FR_NOPR) != ""


def test_t005958_die_regel_leakt_nicht_auf_andere_branches_ohne_ticket_id(run_cmd, ctx):
    res = _dry(run_cmd, ctx)
    assert res.returncode == 0
    assert _count(_grep(res.output, r"^REAP "), FR_MERGED) == 1
    assert _count(_grep(res.output, r"^REAP "), "chore/ohne-ticket") == 0
    assert _grep(_grep(res.output, r"^KEEP "), "chore/ohne-ticket") != ""


def test_t005958_ticketloser_aufruf_ohne_dry_run_loescht_nicht_versehentlich(run_cmd, ctx):
    res = _dry(run_cmd, ctx)
    assert res.returncode == 0
    _run(run_cmd, ctx, "--repo", str(ctx["fixture"]))
    ls = subprocess.run(["git", "ls-remote", "--heads", str(ctx["remote"])], capture_output=True, text=True).stdout
    assert _count(ls, "refs/heads/chore/") == 6
