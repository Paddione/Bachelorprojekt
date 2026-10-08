"""Native migration of tests/spec/ci-cd/branch-reaper-unknown-ticket-merged-pr.bats."""

import os
import re
import subprocess
from pathlib import Path

import pytest


def _g(fx: Path, *args, check=True):
    return subprocess.run(["git", "-C", str(fx), *args], capture_output=True, text=True, check=check)


def _ls_sha(remote: Path, ref: str) -> str:
    out = subprocess.run(["git", "ls-remote", str(remote), ref], capture_output=True, text=True, check=True).stdout
    return out.split("\t")[0]


def _grep(text: str, pattern: str) -> str:
    return "\n".join(ln for ln in text.splitlines() if re.search(pattern, ln))


def _count(text: str, pattern: str) -> int:
    return sum(1 for ln in text.splitlines() if re.search(pattern, ln))


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
  open) echo '[]'; exit 0 ;;
  merged)
    if [ -n "$branch" ]; then
      case "$branch" in
        fix/unknown-merged-T009031)    echo "[{\"state\":\"MERGED\",\"headRefOid\":\"@SHA_MERGED@\"}]" ;;
        fix/known-open-merged-T009034) echo "[{\"state\":\"MERGED\",\"headRefOid\":\"@SHA_OPEN@\"}]" ;;
        fix/successor-T009036)         echo "[{\"state\":\"MERGED\",\"headRefOid\":\"@SHA_SUCC@\"}]" ;;
        *) echo '[]' ;;
      esac
      exit 0
    fi
    echo "[{\"headRefName\":\"fix/successor-T009036\",\"headRefOid\":\"@SHA_SUCC@\"}]"
    exit 0 ;;
  all) echo '[]'; exit 0 ;;
esac
echo '[]'
"""

_TICKET_STUB = r"""#!/usr/bin/env bash
for a in "$@"; do
  case "$a" in
    T009030|T009036) echo "{\"external_id\":\"$a\",\"status\":\"done\"}"; exit 0 ;;
    T009034)         echo '{"external_id":"T009034","status":"in_progress"}'; exit 0 ;;
  esac
done
exit 0
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

    def _code(name, content):
        _g(fixture, "checkout", "--quiet", "main")
        _g(fixture, "checkout", "--quiet", "-b", name)
        (codedir / "echt.sh").write_text(content + "\n")
        _g(fixture, "commit", "--quiet", "-am", f"change {name}")
        _g(fixture, "push", "--quiet", "origin", name)

    def _plan(name):
        _g(fixture, "checkout", "--quiet", "main")
        _g(fixture, "checkout", "--quiet", "-b", name)
        (plandir / "tasks.md").write_text(name + "\n")
        _g(fixture, "commit", "--quiet", "-am", f"plan only {name}")
        _g(fixture, "push", "--quiet", "origin", name)

    _plan("fix/known-done-T009030")
    _code("fix/unknown-merged-T009031", "v1")
    _code("fix/unknown-nopr-T009032", "v2")
    _plan("fix/unknown-allowlist-T009033")
    _code("fix/known-open-merged-T009034", "v1")
    _code("fix/unknown-succ-T009035", "v9")
    _code("fix/successor-T009036", "v9")

    _g(fixture, "checkout", "--quiet", "main")
    _g(fixture, "merge", "--quiet", "fix/known-done-T009030", "-m", "merge fix/known-done-T009030")
    _g(fixture, "push", "--quiet", "origin", "main")
    _g(fixture, "checkout", "--quiet", "main")
    _g(fixture, "fetch", "--quiet", "origin")

    gh_body = (_GH_TEMPLATE
               .replace("@SHA_MERGED@", _ls_sha(remote, "refs/heads/fix/unknown-merged-T009031"))
               .replace("@SHA_OPEN@", _ls_sha(remote, "refs/heads/fix/known-open-merged-T009034"))
               .replace("@SHA_SUCC@", _ls_sha(remote, "refs/heads/fix/successor-T009036")))
    gh = stubs / "gh"
    gh.write_text(gh_body)
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


def _sweep(run_cmd, c):
    res = run_cmd(["bash", "-c", '"$@" 2>&1', "run", "bash", str(c["reaper"]),
                   "--dry-run", "--sweep", "--repo", str(c["fixture"])],
                  cwd=c["repo"], env=c["env"])
    return res


def _reaped(output):
    return _grep(output, r"^REAP ")


def _kept(output):
    return _grep(output, r"^KEEP ")


def test_t012412_positiv_anker_sweep_laeuft_und_reapt_einen_branch_mit_auffindbarem_done_ticket(run_cmd, ctx):
    res = _sweep(run_cmd, ctx)
    assert res.returncode == 0
    assert _count(_reaped(res.output), "fix/known-done-T009030") == 1


def test_t012412_unbekanntes_ticket_eigener_merged_pr_sha_gleich_tip_wird_gereapt(run_cmd, ctx):
    res = _sweep(run_cmd, ctx)
    assert res.returncode == 0
    assert _count(_reaped(res.output), "fix/unknown-merged-T009031") == 1


def test_t012412_unbekanntes_ticket_merged_nachfolger_mit_identischem_blob_wird_gereapt(run_cmd, ctx):
    res = _sweep(run_cmd, ctx)
    assert res.returncode == 0
    assert _count(_reaped(res.output), "fix/unknown-succ-T009035") == 1


def test_t012412_unbekanntes_ticket_ohne_positiv_signal_bleibt_keep(run_cmd, ctx):
    res = _sweep(run_cmd, ctx)
    assert res.returncode == 0
    assert _count(_reaped(res.output), "fix/unknown-nopr-T009032") == 0
    assert _kept(res.output) and _grep(_kept(res.output), "fix/unknown-nopr-T009032") != ""


def test_t012412_unbekanntes_ticket_ohne_positiv_signal_faellt_nicht_auf_den_allowlist_check_durch(run_cmd, ctx):
    res = _sweep(run_cmd, ctx)
    assert res.returncode == 0
    assert _count(_reaped(res.output), "fix/unknown-allowlist-T009033") == 0
    assert _grep(_kept(res.output), "fix/unknown-allowlist-T009033") != ""


def test_t012412_gelesener_nicht_terminaler_status_bleibt_keep_auch_mit_merged_pr(run_cmd, ctx):
    res = _sweep(run_cmd, ctx)
    assert res.returncode == 0
    assert _count(_reaped(res.output), "fix/known-open-merged-T009034") == 0
    assert _grep(_kept(res.output), "fix/known-open-merged-T009034") != ""


def test_t012412_einzel_ticket_lauf_mit_unbekannter_id_und_merged_pr_reapt_ebenfalls(run_cmd, ctx):
    res = run_cmd(["bash", "-c", '"$@" 2>&1', "run", "bash", str(ctx["reaper"]),
                   "--dry-run", "--ticket", "T009031", "--repo", str(ctx["fixture"])],
                  cwd=ctx["repo"], env=ctx["env"])
    assert res.returncode == 0
    assert _count(_reaped(res.output), "fix/unknown-merged-T009031") == 1
