"""Native migration of tests/spec/batch-repo-hygiene-ops-fixes.bats."""
# (Batch T003490)
# Deliberate deviation: the cron test creates its fixture under /var/tmp, as the

# bats original does, because repo-hygiene-cron.sh skips worktrees under /tmp.

import json
import os
import shutil
import signal
import subprocess
import tempfile
import time
from pathlib import Path

import pytest

GH_STUB_TEMPLATE = """#!/usr/bin/env bash
echo "gh $*" >> "{marker}/gh-calls"
args="$*"
case "$args" in
  "pr view --json number -q .number") echo 1 ;;
  *"--json mergeStateStatus"*) echo "" ;;
  *"--json mergeable "*|*"--json mergeable") echo "MERGEABLE" ;;
  *"--json state -q .state") echo "OPEN" ;;
  *"--json headRefName -q .headRefName"*) echo "feature/stub-branch" ;;
  *"checks --watch"*) touch "{marker}/watch-called"; exit 0 ;;
  *"--json headRefOid -q .headRefOid"*) echo "$HEAD_SHA" ;;
  *"check-runs"*"failure"*) cat "{work}/check-runs-failures.txt" 2>/dev/null || true ;;
  *"run list --branch"*) cat "{work}/runs.json" 2>/dev/null || echo '[]' ;;
  *"actions/runs/"*"/jobs"*) cat "{work}/jobs-count.txt" 2>/dev/null || echo "1" ;;
  *"check-runs"*"total_count"*) echo "3" ;;
  *) echo "" ;;
esac
"""

TICKET_STUB = """#!/usr/bin/env bash
echo "ticket.sh $*" >> "$MARKER_DIR/ticket-calls"
exit 0
"""

REAPER_GH_STUB = "#!/usr/bin/env bash\necho '[]'\n"
TICKET_DONE_STUB = "#!/usr/bin/env bash\necho '{\"status\":\"done\"}'\n"
TICKET_INPROGRESS_STUB = "#!/usr/bin/env bash\necho '{\"status\":\"in_progress\"}'\n"

RUNBOOK_REL = Path(".claude") / "skills" / "references" / "repo-hygiene-ops.md"


def _git(run_cmd, cwd: Path, *args):
    return run_cmd(["git", *args], cwd=cwd)


def _write_exec(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    path.chmod(0o755)


@pytest.fixture
def ctx(repo_root: Path, run_cmd, tmp_path: Path, monkeypatch):
    work = tmp_path
    markers = work / "markers"
    (work / "bin").mkdir(parents=True)
    (work / "scripts").mkdir(parents=True)
    markers.mkdir(parents=True)
    monkeypatch.setenv("MARKER_DIR", str(markers))
    return {
        "project": repo_root,
        "work": work,
        "markers": markers,
        "run": run_cmd,
        "runbook": repo_root / RUNBOOK_REL,
        "monkeypatch": monkeypatch,
    }


def _env_with_path(c, *prefix: str, **extra) -> dict:
    path = os.pathsep.join([*prefix, os.environ.get("PATH", "")])
    env = {"PATH": path}
    env.update(extra)
    return env


def _reaper_fixture(c) -> dict:
    run = c["run"]
    work = c["work"]
    fixture = work / "fixture"
    remote = work / "remote.git"
    stubs = work / "stubs"
    stubs.mkdir(parents=True, exist_ok=True)
    (fixture / ".agents" / "plans" / "x").mkdir(parents=True)

    run(["git", "init", "--bare", "--quiet", str(remote)]).check(0)
    _git(run, fixture, "init", "--quiet").check(0)
    _git(run, fixture, "config", "user.email", "t@example.com").check(0)
    _git(run, fixture, "config", "user.name", "Test").check(0)
    _git(run, fixture, "remote", "add", "origin", str(remote)).check(0)
    (fixture / ".agents" / "plans" / "x" / "tasks.md").write_text("base\n", encoding="utf-8")
    _git(run, fixture, "add", "-A").check(0)
    _git(run, fixture, "commit", "--quiet", "-m", "base").check(0)
    _git(run, fixture, "push", "--quiet", "origin", "HEAD:main").check(0)

    def branch(name: str) -> None:
        _git(run, fixture, "checkout", "--quiet", "main").check(0)
        _git(run, fixture, "checkout", "--quiet", "-b", name).check(0)
        (fixture / ".agents" / "plans" / "x" / "tasks.md").write_text(f"{name}\n", encoding="utf-8")
        _git(run, fixture, "commit", "--quiet", "-am", "plan only").check(0)
        _git(run, fixture, "push", "--quiet", "origin", name).check(0)

    branch("chore/plan-T009001")
    branch("chore/plan-T009002")
    _git(run, fixture, "checkout", "--quiet", "main").check(0)
    _git(run, fixture, "merge", "--quiet", "-s", "ours", "chore/plan-T009001",
         "chore/plan-T009002", "-m", "merge fixture branches").check(0)
    _git(run, fixture, "push", "--quiet", "origin", "main").check(0)
    _git(run, fixture, "fetch", "--quiet", "origin").check(0)

    _write_exec(stubs / "gh", REAPER_GH_STUB)
    _write_exec(stubs / "ticket-stub.sh", TICKET_DONE_STUB)
    ticket_sh = stubs / "ticket-stub.sh"
    c["monkeypatch"].setenv("TICKET_SH", str(ticket_sh))
    c["monkeypatch"].setenv("PATH", f"{stubs}{os.pathsep}{os.environ.get('PATH', '')}")
    return {"fixture": fixture, "stubs": stubs}


def _reaper(c, fixture: Path, env_extra=None):
    return c["run"](
        ["bash", str(c["project"] / "scripts" / "branch-reaper.sh"),
         "--sweep", "--dry-run", "--repo", str(fixture)],
        cwd=c["work"],
        env=env_extra,
    )


def test_t003074_positive_anchor_sweep_without_ticket_lists_all_remote_heads_as_reap(ctx):
    fx = _reaper_fixture(ctx)
    res = _reaper(ctx, fx["fixture"])
    assert res.returncode == 0, res.output
    reaped = [l for l in res.output.split("\n") if l.startswith("REAP ")]
    assert sum(1 for l in reaped if "T009001" in l) == 1, f"T009001 nicht gereapt: {res.output}"
    assert sum(1 for l in reaped if "T009002" in l) == 1, f"T009002 nicht gereapt (Sweep filtert auf EINE ID?): {res.output}"


def test_t003074_empty_sweep_inventory_is_distinguishable_from_failure_explicit_message_exit_0(ctx):
    fx = _reaper_fixture(ctx)
    _write_exec(ctx["work"] / "stubs" / "ticket-stub.sh", TICKET_INPROGRESS_STUB)
    res = _reaper(ctx, fx["fixture"])
    assert res.returncode == 0, res.output
    assert not [l for l in res.output.split("\n") if l.startswith("REAP ")]
    assert "keine verwaisten Branches gefunden" in res.output, f"keine explizite Leer-Meldung: {res.output}"


def test_t003183_runbook_s2_documents_reaper_before_gone_prune_and_archive_tag_signal(ctx):
    text = ctx["runbook"].read_text(encoding="utf-8")
    assert "refs/tags/reaped/<branch>" in text, "Archiv-Tag-Signal fehlt in §2"
    assert "Reaper VOR [gone]-Prune" in text, "Reihenfolge-Regel fehlt"
    assert 'rev-parse --verify --quiet "refs/tags/reaped/$b"' in text, "Archiv-Tag im [gone]-Loop fehlt"


def test_t003181_runbook_s3_uses_merge_tree_write_tree_as_primary_conflict_probe(ctx):
    text = ctx["runbook"].read_text(encoding="utf-8")
    assert "git merge-tree --write-tree --name-only" in text, "merge-tree-Probe fehlt in §3"
    assert "Konfliktmarker im Working" in text, "Invasiv-Merge ist nicht als Ausnahme markiert"
    assert "nicht der Primärweg" in text, "Invasiv-Merge ist nicht als Ausnahme markiert"


def test_t003181_merge_tree_write_tree_mutates_neither_working_tree_nor_index(ctx):
    run = ctx["run"]
    work = ctx["work"]
    a = work / "a"
    b = work / "b"
    run(["git", "init", "--quiet", "-b", "main", str(a)]).check(0)
    _git(run, a, "config", "user.email", "t@example.com").check(0)
    _git(run, a, "config", "user.name", "Test").check(0)
    (a / "f.txt").write_text("one\n", encoding="utf-8")
    _git(run, a, "add", "-A").check(0)
    _git(run, a, "commit", "--quiet", "-m", "one").check(0)
    _git(run, a, "checkout", "--quiet", "-b", "side").check(0)
    (a / "f.txt").write_text("two\n", encoding="utf-8")
    _git(run, a, "commit", "--quiet", "-am", "two").check(0)
    _git(run, a, "checkout", "--quiet", "main").check(0)
    if run(["git", "clone", "--quiet", "--no-hardlinks", str(a), str(b)]).returncode != 0:
        run(["git", "clone", "--quiet", str(a), str(b)]).check(0)
    _git(run, b, "checkout", "--quiet", "-b", "side", "origin/side").check(0)
    (b / "untracked.txt").write_text("dirty\n", encoding="utf-8")

    before = _git(run, b, "status", "--porcelain").stdout
    res = _git(run, b, "merge-tree", "--write-tree", "--name-only", "main", "side")
    assert res.returncode == 0, f"merge-tree meldet Konflikt im konfliktfreien Fall: {res.output}"
    assert _git(run, b, "status", "--porcelain").stdout == before, "merge-tree hat den Working Tree verändert"


def _setup_ciwatch(c, head_sha: str = "aaaa1111") -> None:
    run = c["run"]
    work = c["work"]
    _git(run, work, "init", "-q", "-b", "main").check(0)
    run(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t",
         "commit", "-q", "--allow-empty", "-m", "init"], cwd=work).check(0)
    c["monkeypatch"].setenv("HEAD_SHA", head_sha)
    _write_exec(work / "scripts" / "ticket.sh", TICKET_STUB)
    _write_exec(work / "bin" / "gh", GH_STUB_TEMPLATE.format(marker=c["markers"], work=work))


def _ciwatch(c):
    work = c["work"]
    return c["run"](
        ["bash", str(c["project"] / "scripts" / "devflow-ci-watch.sh"), "T999999",
         "https://github.com/x/y/pull/1"],
        cwd=work,
        env={"PATH": f"{work / 'bin'}{os.pathsep}{os.environ.get('PATH', '')}"},
    )


def test_t003225_positive_anchor_only_current_head_sha_checks_count_foreign_shas_green(ctx):
    _setup_ciwatch(ctx, "aaaa1111")
    work = ctx["work"]
    (work / "check-runs-failures.txt").write_text("", encoding="utf-8")
    (work / "runs.json").write_text("[]\n", encoding="utf-8")
    (work / "jobs-count.txt").write_text("1\n", encoding="utf-8")
    res = _ciwatch(ctx)
    assert res.returncode == 0, res.output
    gh_calls = (ctx["markers"] / "gh-calls").read_text(encoding="utf-8")
    assert "commits/aaaa1111/check-runs" in gh_calls, f"check-runs-Abfrage fehlt (keine HEAD-Bindung): {gh_calls}"
    assert "alle grün" in res.output, f"fremde head-SHAs wurden als Fehler gewertet: {res.output}"


def test_t003225_running_conclusion_empty_is_not_an_error(ctx):
    _setup_ciwatch(ctx, "aaaa1111")
    (ctx["work"] / "runs.json").write_text("[]\n", encoding="utf-8")
    res = _ciwatch(ctx)
    assert res.returncode == 0, f"laufender Check wurde als Fehler gewertet: {res.output}"


def test_t003224_aggregated_failure_run_without_failure_jobs_is_not_a_code_error(ctx):
    _setup_ciwatch(ctx, "aaaa1111")
    work = ctx["work"]
    (work / "check-runs-failures.txt").write_text("ci: u1\n", encoding="utf-8")
    (work / "runs.json").write_text(
        '[{"databaseId":42,"headSha":"aaaa1111","status":"completed","conclusion":"failure"}]\n',
        encoding="utf-8",
    )
    (work / "jobs-count.txt").write_text("0\n", encoding="utf-8")
    res = _ciwatch(ctx)
    assert res.returncode == 0, f"cancelled/skipped wurde als failure gewertet: {res.output}"
    gh_calls = (ctx["markers"] / "gh-calls").read_text(encoding="utf-8")
    assert "actions/runs/42/jobs" in gh_calls, f"Job-Gegenprobe fehlt: {gh_calls}"


def test_t003227_runbook_s1_documents_hygiene_tick_precheck_tick_running(ctx):
    text = ctx["runbook"].read_text(encoding="utf-8")
    assert "tick_running" in text, "tick_running-Vorcheck fehlt in §1"
    assert "/tmp/repo-hygiene-tick.lock" in text, "Lock-Pfad fehlt"


def test_t003227_repo_hygiene_cron_skips_worktree_measurement_when_tick_running(ctx):
    run = ctx["run"]
    base = Path(tempfile.mkdtemp(prefix="bats-cron-", dir="/var/tmp"))
    lock_proc = None
    try:
        fixture = base / "fixture"
        wt_path = base / "wt"
        remote = base / "remote.git"
        run(["git", "init", "--bare", "--quiet", str(remote)]).check(0)
        run(["git", "init", "--quiet", "-b", "main", str(fixture)]).check(0)
        _git(run, fixture, "config", "user.email", "t@example.com").check(0)
        _git(run, fixture, "config", "user.name", "Test").check(0)
        _git(run, fixture, "remote", "add", "origin", str(remote)).check(0)
        (fixture / "base.txt").write_text("base\n", encoding="utf-8")
        _git(run, fixture, "add", "-A").check(0)
        _git(run, fixture, "commit", "--quiet", "-m", "base").check(0)
        _git(run, fixture, "push", "--quiet", "origin", "HEAD:main").check(0)
        _git(run, fixture, "worktree", "add", "--quiet", "-b", "feature/x", str(wt_path)).check(0)

        _write_exec(ctx["work"] / "bin" / "gh", "#!/usr/bin/env bash\necho '[]'\n")

        tick_lock = ctx["work"] / "hygiene-tick.lock"
        lock_proc = subprocess.Popen(
            ["bash", "-c", f"( flock -w 10 -x 9; sleep 30 ) 9>{tick_lock}"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
        )
        time.sleep(0.2)

        res = run(
            ["bash", str(ctx["project"] / "scripts" / "repo-hygiene-cron.sh"), "standard"],
            cwd=ctx["work"],
            env={
                "PATH": f"{ctx['work'] / 'bin'}{os.pathsep}{os.environ.get('PATH', '')}",
                "REPO_DIR": str(fixture),
                "AGENT_LOCK_DIR": str(ctx["work"] / "locks"),
                "REPO_HYGIENE_TICK_LOCK": str(tick_lock),
            },
            timeout=300,
        )
    finally:
        if lock_proc is not None:
            try:
                os.killpg(lock_proc.pid, signal.SIGKILL)
            except OSError:
                pass
            lock_proc.wait()
        shutil.rmtree(base, ignore_errors=True)

    assert res.returncode == 0, f"cron fehlgeschlagen (Exit {res.returncode}): {res.output}"
    try:
        skipped = json.loads(res.stdout)["metrics"]["worktrees"]["skipped"] or 0
    except (ValueError, KeyError, TypeError):
        skipped = 0
    assert skipped >= 1, f"Worktree-Sektion wurde bei tick_running=true NICHT übersprungen (skipped={skipped}): {res.output}"
