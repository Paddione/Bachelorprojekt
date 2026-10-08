"""Native migration of tests/spec/ci-cd/branch-reaper-merged-pr-signal.bats."""

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
  open)
    if [ "$branch" = "fix/openpr-T009018" ]; then echo '[{"number":42}]'; exit 0; fi
    echo '[]'; exit 0 ;;
  merged)
    if [ "$branch" = "fix/merged-ghfail-T009013" ]; then echo "stub gh failure" >&2; exit 1; fi
    if [ -n "$branch" ]; then
      case "$branch" in
        fix/merged-T009010)          echo "[{\"state\":\"MERGED\",\"headRefOid\":\"@SHA1@\"}]" ;;
        fix/merged-moved-T009011)    echo "[{\"state\":\"MERGED\",\"headRefOid\":\"@SHA_MOVED_MERGED@\"}]" ;;
        fix/merged-openticket-T009012) echo "[{\"state\":\"MERGED\",\"headRefOid\":\"@SHA3@\"}]" ;;
        fix/merged-ticketmode-T009019) echo "[{\"state\":\"MERGED\",\"headRefOid\":\"@SHA8@\"}]" ;;
        *) echo '[]' ;;
      esac
      exit 0
    fi
    echo "[{\"headRefName\":\"fix/successor-T009015\",\"headRefOid\":\"@SHA5S@\"},{\"headRefName\":\"fix/successor-diff-T009017\",\"headRefOid\":\"@SHA6S@\"}]"
    exit 0 ;;
  all) echo '[]'; exit 0 ;;
esac
echo '[]'
"""

_TICKET_STUB = """#!/usr/bin/env bash
for a in "$@"; do
  if [ "$a" = "T009012" ]; then echo '{"external_id":"T009012","status":"in_progress"}'; exit 0; fi
done
echo '{"external_id":"T009000","status":"done"}'
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

    def _branch(name, content):
        _g(fixture, "checkout", "--quiet", "main")
        _g(fixture, "checkout", "--quiet", "-b", name)
        (codedir / "echt.sh").write_text(content + "\n")
        _g(fixture, "commit", "--quiet", "-am", f"change {name}")
        _g(fixture, "push", "--quiet", "origin", name)

    _branch("fix/merged-T009010", "v1")
    _branch("fix/merged-openticket-T009012", "v1")
    _branch("fix/merged-ghfail-T009013", "v1")
    _branch("fix/succ-T009014", "v1")
    _branch("fix/successor-T009015", "v1")
    _branch("fix/succ-diff-T009016", "v2")
    _branch("fix/successor-diff-T009017", "v3")
    _branch("fix/openpr-T009018", "v1")
    _branch("fix/merged-ticketmode-T009019", "v1")

    # MERGED-PR, aber nach dem Merge gepusht (Tip != headRefOid).
    _g(fixture, "checkout", "--quiet", "main")
    _g(fixture, "checkout", "--quiet", "-b", "fix/merged-moved-T009011")
    (codedir / "echt.sh").write_text("v1\n")
    _g(fixture, "commit", "--quiet", "-am", "change merged-moved")
    _g(fixture, "push", "--quiet", "origin", "fix/merged-moved-T009011")
    sha_moved_merged = _ls_sha(remote, "refs/heads/fix/merged-moved-T009011")
    (fixture / "src-post.txt").write_text("post\n")
    _g(fixture, "add", "-A")
    _g(fixture, "commit", "--quiet", "-am", "post-merge work")
    _g(fixture, "push", "--quiet", "origin", "fix/merged-moved-T009011")

    _g(fixture, "checkout", "--quiet", "main")
    _g(fixture, "fetch", "--quiet", "origin")

    sha = {
        "1": _ls_sha(remote, "refs/heads/fix/merged-T009010"),
        "3": _ls_sha(remote, "refs/heads/fix/merged-openticket-T009012"),
        "8": _ls_sha(remote, "refs/heads/fix/merged-ticketmode-T009019"),
        "5s": _ls_sha(remote, "refs/heads/fix/successor-T009015"),
        "6s": _ls_sha(remote, "refs/heads/fix/successor-diff-T009017"),
    }
    gh_body = (_GH_TEMPLATE.replace("@SHA1@", sha["1"])
               .replace("@SHA_MOVED_MERGED@", sha_moved_merged)
               .replace("@SHA3@", sha["3"])
               .replace("@SHA8@", sha["8"])
               .replace("@SHA5S@", sha["5s"])
               .replace("@SHA6S@", sha["6s"]))
    gh = stubs / "gh"
    gh.write_text(gh_body)
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


def _dry(run_cmd, c):
    return _run(run_cmd, c, "--dry-run", "--repo", str(c["fixture"]))


def test_anker_branch_mit_eigenem_merged_pr_und_abweichung_ausserhalb_der_allowlist_wird_reap_kandidat(run_cmd, ctx):
    res = _dry(run_cmd, ctx)
    assert res.returncode == 0
    assert _count(_grep(res.output, r"^REAP "), "fix/merged-T009010") == 1


def test_anker_inhalt_via_nachfolge_branch_mit_merged_pr_und_identischen_blobs_wird_reap_kandidat(run_cmd, ctx):
    res = _dry(run_cmd, ctx)
    assert res.returncode == 0
    assert _count(_grep(res.output, r"^REAP "), "fix/succ-T009014") == 1


def test_anker_ticket_modus_reapt_branch_mit_eigenem_merged_pr_und_abweichung_ausserhalb_der_allowlist(run_cmd, ctx):
    res = _run(run_cmd, ctx, "--dry-run", "--ticket", "T009019", "--repo", str(ctx["fixture"]))
    assert res.returncode == 0
    assert _count(_grep(res.output, r"^REAP "), "fix/merged-ticketmode-T009019") == 1


def test_branch_mit_post_merge_pushes_tip_ungleich_headrefoid_wird_verschont(run_cmd, ctx):
    res = _dry(run_cmd, ctx)
    assert res.returncode == 0
    assert _count(_grep(res.output, r"^REAP "), "fix/merged-T009010") == 1
    assert _count(_grep(res.output, r"^REAP "), "fix/merged-moved-T009011") == 0
    assert _grep(_grep(res.output, r"^KEEP "), "fix/merged-moved-T009011") != ""


def test_branch_mit_merged_pr_aber_nicht_done_ticket_wird_verschont(run_cmd, ctx):
    res = _dry(run_cmd, ctx)
    assert res.returncode == 0
    assert _count(_grep(res.output, r"^REAP "), "fix/merged-T009010") == 1
    assert _count(_grep(res.output, r"^REAP "), "fix/merged-openticket-T009012") == 0
    assert _grep(_grep(res.output, r"^KEEP "), "fix/merged-openticket-T009012") != ""


def test_gh_ausfall_auf_dem_merged_pr_check_verschont_den_branch(run_cmd, ctx):
    res = _dry(run_cmd, ctx)
    assert res.returncode == 0
    assert _count(_grep(res.output, r"^REAP "), "fix/merged-T009010") == 1
    assert _count(_grep(res.output, r"^REAP "), "fix/merged-ghfail-T009013") == 0
    assert _grep(_grep(res.output, r"^KEEP "), "fix/merged-ghfail-T009013") != ""


def test_ein_branch_ist_nicht_sein_eigener_nachfolger_selbstreferenz_reapt_nicht(run_cmd, ctx):
    res = _dry(run_cmd, ctx)
    assert res.returncode == 0
    assert _count(_grep(res.output, r"^REAP "), "fix/merged-T009010") == 1
    assert _count(_grep(res.output, r"^REAP "), "fix/successor-T009015") == 0
    assert _grep(_grep(res.output, r"^KEEP "), "fix/successor-T009015") != ""


def test_nachfolger_mit_abweichendem_blob_verschont_den_branch(run_cmd, ctx):
    res = _dry(run_cmd, ctx)
    assert res.returncode == 0
    assert _count(_grep(res.output, r"^REAP "), "fix/merged-T009010") == 1
    assert _count(_grep(res.output, r"^REAP "), "fix/succ-diff-T009016") == 0
    assert _grep(_grep(res.output, r"^KEEP "), "fix/succ-diff-T009016") != ""


def test_offener_pr_verschont_den_branch_bestehende_regel_bleibt(run_cmd, ctx):
    res = _dry(run_cmd, ctx)
    assert res.returncode == 0
    assert _count(_grep(res.output, r"^REAP "), "fix/merged-T009010") == 1
    assert _count(_grep(res.output, r"^REAP "), "fix/openpr-T009018") == 0
    assert _grep(_grep(res.output, r"^KEEP "), "fix/openpr-T009018") != ""
