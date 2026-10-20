"""Ticketlose Branches: ein gemergter PR mit gleichem Head genuegt als Loeschgrund.

Seit dem Wegfall der Ticket-DB tragen neue Branches keine T######-ID mehr. Ohne ID
entscheiden nur die Positiv-Signale (eigener MERGED-PR, gemergter Nachfolger); der
Blob-Allowlist-Check gibt einen ticketlosen Branch nie frei.
"""

import os
import re
import subprocess
from pathlib import Path

import pytest


def _g(fx: Path, *args):
    return subprocess.run(["git", "-C", str(fx), *args], capture_output=True, text=True, check=True)


def _ls_sha(remote: Path, ref: str) -> str:
    out = subprocess.run(["git", "ls-remote", str(remote), ref], capture_output=True, text=True, check=True).stdout
    return out.split("\t")[0]


def _lines(text: str, prefix: str, branch: str) -> list[str]:
    return [ln for ln in text.splitlines() if ln.startswith(prefix) and re.search(rf"\b{re.escape(branch)}\b", ln)]


_GH_TEMPLATE = r"""#!/usr/bin/env bash
branch=""; state=""
while [ $# -gt 0 ]; do
  case "$1" in
    --head) branch="$2"; shift 2 ;;
    --state) state="$2"; shift 2 ;;
    *) shift ;;
  esac
done
case "$state" in
  open)
    case "$branch" in
      feat/ticketless-open) echo '[{"number":7}]' ;;
      *) echo '[]' ;;
    esac
    exit 0 ;;
  merged)
    if [ -n "$branch" ]; then
      case "$branch" in
        fix/ticketless-merged)       echo "[{\"state\":\"MERGED\",\"headRefOid\":\"@SHA_MERGED@\"}]" ;;
        fix/ticketless-stale-merged) echo "[{\"state\":\"MERGED\",\"headRefOid\":\"@SHA_BASE@\"}]" ;;
        feat/ticketless-open)        echo "[{\"state\":\"MERGED\",\"headRefOid\":\"@SHA_OPEN@\"}]" ;;
        *) echo '[]' ;;
      esac
      exit 0
    fi
    echo '[]'; exit 0 ;;
esac
echo '[]'
"""

# Ein Ticket-Stub, der jede Abfrage beantwortet, darf ticketlose Branches nicht beeinflussen.
_TICKET_STUB = r"""#!/usr/bin/env bash
echo '{"status":"done"}'
"""


@pytest.fixture
def ctx(repo_root, tmp_path):
    fixture = tmp_path / "fixture"
    remote = tmp_path / "remote.git"
    stubs = tmp_path / "stubs"
    stubs.mkdir()
    plandir = fixture / ".agents/plans/x"
    codedir = fixture / "scripts"

    subprocess.run(["git", "init", "--bare", "--quiet", str(remote)], check=True)
    subprocess.run(["git", "init", "--quiet", str(fixture)], check=True)
    _g(fixture, "config", "user.email", "t@example.com")
    _g(fixture, "config", "user.name", "Test")
    _g(fixture, "remote", "add", "origin", str(remote))

    plandir.mkdir(parents=True)
    codedir.mkdir(parents=True)
    (plandir / "tasks.md").write_text("base\n")
    (codedir / "echt.sh").write_text("base\n")
    _g(fixture, "add", "-A")
    _g(fixture, "commit", "--quiet", "-m", "base")
    _g(fixture, "push", "--quiet", "origin", "HEAD:main")

    def _branch(name, path, content):
        _g(fixture, "checkout", "--quiet", "main")
        _g(fixture, "checkout", "--quiet", "-b", name)
        path.write_text(content + "\n")
        _g(fixture, "commit", "--quiet", "-am", f"change {name}")
        _g(fixture, "push", "--quiet", "origin", name)

    _branch("fix/ticketless-merged", codedir / "echt.sh", "v1")
    _branch("fix/ticketless-nopr", codedir / "echt.sh", "v2")
    _branch("fix/ticketless-stale-merged", codedir / "echt.sh", "v3")
    _branch("feat/ticketless-open", codedir / "echt.sh", "v4")
    _branch("chore/ticketless-plan-only", plandir / "tasks.md", "plan")
    _g(fixture, "checkout", "--quiet", "main")
    _g(fixture, "fetch", "--quiet", "origin")

    gh = stubs / "gh"
    gh.write_text(_GH_TEMPLATE
                  .replace("@SHA_MERGED@", _ls_sha(remote, "refs/heads/fix/ticketless-merged"))
                  .replace("@SHA_OPEN@", _ls_sha(remote, "refs/heads/feat/ticketless-open"))
                  .replace("@SHA_BASE@", _ls_sha(remote, "refs/heads/main")))
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


@pytest.fixture
def output(run_cmd, ctx):
    res = run_cmd(["bash", "-c", '"$@" 2>&1', "run", "bash", str(ctx["reaper"]),
                   "--dry-run", "--sweep", "--repo", str(ctx["fixture"])],
                  cwd=ctx["repo"], env=ctx["env"])
    assert res.returncode == 0, res.output
    return res.output


def test_ticketloser_branch_mit_merged_pr_gleich_tip_wird_gereapt(output):
    assert _lines(output, "REAP ", "fix/ticketless-merged")


def test_ticketloser_branch_ohne_pr_bleibt_keep(output):
    assert not _lines(output, "REAP ", "fix/ticketless-nopr")
    assert _lines(output, "KEEP ", "fix/ticketless-nopr")


def test_ticketloser_branch_mit_merged_pr_auf_aelterem_head_bleibt_keep(output):
    assert not _lines(output, "REAP ", "fix/ticketless-stale-merged")
    assert _lines(output, "KEEP ", "fix/ticketless-stale-merged")


def test_ticketloser_branch_mit_offenem_pr_bleibt_keep(output):
    assert not _lines(output, "REAP ", "feat/ticketless-open")
    assert _lines(output, "KEEP ", "feat/ticketless-open")


def test_ticketloser_branch_faellt_nicht_auf_den_allowlist_check_durch(output):
    assert not _lines(output, "REAP ", "chore/ticketless-plan-only")
    keep = _lines(output, "KEEP ", "chore/ticketless-plan-only")
    assert keep and "keine Ticket-ID" in keep[0]
