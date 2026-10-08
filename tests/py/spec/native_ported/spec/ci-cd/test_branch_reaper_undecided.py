"""Native migration of tests/spec/ci-cd/branch-reaper-undecided.bats."""

import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest


def _g(fx: Path, *args, check=True):
    return subprocess.run(["git", "-C", str(fx), *args], capture_output=True, text=True, check=check)


def _grep(text: str, pattern: str) -> str:
    return "\n".join(ln for ln in text.splitlines() if re.search(pattern, ln))


def _count(text: str, pattern: str, flags=0) -> int:
    return sum(1 for ln in text.splitlines() if re.search(pattern, ln, flags))


@pytest.fixture
def ctx(repo_root, tmp_path):
    fixture = tmp_path / "fixture"
    remote = tmp_path / "remote.git"
    stubs = tmp_path / "stubs"
    stubs.mkdir()
    real_git = shutil.which("git")

    subprocess.run(["git", "init", "--bare", "--quiet", str(remote)], check=True)
    subprocess.run(["git", "init", "--quiet", "-b", "main", str(fixture)], check=True)
    _g(fixture, "config", "user.email", "t@example.com")
    _g(fixture, "config", "user.name", "Test")
    _g(fixture, "remote", "add", "origin", str(remote))
    (fixture / "scripts").mkdir()
    (fixture / "scripts/x.sh").write_text("base\n")
    _g(fixture, "add", "-A")
    _g(fixture, "commit", "--quiet", "-m", "base")
    _g(fixture, "push", "--quiet", "origin", "HEAD:main")

    # Squash-Merge-Realitaet: Tip ist KEIN Ancestor von main, main traegt denselben Inhalt.
    _g(fixture, "checkout", "--quiet", "-b", "fix/sq-T009101")
    (fixture / "scripts/x.sh").write_text("change\n")
    _g(fixture, "commit", "--quiet", "-am", "change")
    _g(fixture, "push", "--quiet", "origin", "fix/sq-T009101")
    tip = _g(fixture, "rev-parse", "HEAD").stdout.strip()
    _g(fixture, "checkout", "--quiet", "main")
    (fixture / "scripts/x.sh").write_text("change\n")
    _g(fixture, "commit", "--quiet", "-am", "squash fix/sq-T009101")
    _g(fixture, "push", "--quiet", "origin", "main")
    _g(fixture, "fetch", "--quiet", "origin")

    gh = stubs / "gh"
    gh.write_text(
        "#!/usr/bin/env bash\n"
        '[ -n "${GH_FAIL:-}" ] && { echo "error connecting to api.github.com" >&2; exit 1; }\n'
        'case "$*" in\n'
        "  *\"--state open\"*)   echo '[]' ;;\n"
        "  *\"--head\"*\"--state merged\"*) echo '[{\"headRefOid\":\"" + tip + "\"}]' ;;\n"
        "  *) echo '[]' ;;\n"
        "esac\n"
    )
    ticket = stubs / "ticket-stub.sh"
    ticket.write_text("#!/usr/bin/env bash\necho '{\"status\":\"done\"}'\n")
    gh.chmod(0o755)
    ticket.chmod(0o755)

    def break_fetch():
        git_stub = stubs / "git"
        git_stub.write_text(
            "#!/usr/bin/env bash\n"
            'for a in "$@"; do [ "$a" = fetch ] && { echo "fatal: simulated fetch failure" >&2; exit 1; }; done\n'
            f'exec "{real_git}" "$@"\n'
        )
        git_stub.chmod(0o755)

    return {
        "fixture": fixture,
        "reaper": repo_root / "scripts/branch-reaper.sh",
        "repo": repo_root,
        "env": {
            "PATH": f"{stubs}{os.pathsep}{os.environ.get('PATH', '')}",
            "TICKET_SH": str(ticket),
        },
        "break_fetch": break_fetch,
    }


def _sweep(run_cmd, c, env_extra=None):
    env = dict(c["env"])
    if env_extra:
        env.update(env_extra)
    # BATS `run` merges stderr into $output in emission order: 2>&1 im Shell.
    return run_cmd(["bash", "-c", '"$@" 2>&1', "run",
                    "bash", str(c["reaper"]), "--sweep", "--dry-run", "--repo", str(c["fixture"])],
                   cwd=c["repo"], env=env)


def test_t900787_positiv_anker_gemergter_squash_branch_wird_gereapt(run_cmd, ctx):
    res = _sweep(run_cmd, ctx)
    assert res.returncode == 0
    assert _count(_grep(res.output, r"^REAP "), "fix/sq-T009101") == 1


def test_t900787_fehlender_tracking_ref_bei_gescheitertem_fetch_ist_nicht_entscheidbar(run_cmd, ctx):
    res = _sweep(run_cmd, ctx)
    assert _count(_grep(res.output, r"^REAP "), "fix/sq-T009101") == 1

    _g(ctx["fixture"], "update-ref", "-d", "refs/remotes/origin/fix/sq-T009101")
    ctx["break_fetch"]()
    res = _sweep(run_cmd, ctx)
    assert res.returncode == 0
    keep = _grep(res.output, r"^KEEP fix/sq-T009101")
    assert keep
    assert _count(keep, "T900096") == 0
    assert re.search(r"fetch", res.output, re.IGNORECASE)
    assert "nicht entscheidbar" in res.output.splitlines()[-1]


def test_t900787_gh_ausfall_erscheint_in_der_schlusszeile_als_nicht_entscheidbar(run_cmd, ctx):
    res = _sweep(run_cmd, ctx)
    assert _count(_grep(res.output, r"^REAP "), "fix/sq-T009101") == 1

    res = _sweep(run_cmd, ctx, {"GH_FAIL": "1"})
    assert res.returncode == 0
    assert _count(_grep(res.output, r"^REAP "), "fix/sq-T009101") == 0
    assert re.search(r"1 .*nicht entscheidbar", res.output.splitlines()[-1])
