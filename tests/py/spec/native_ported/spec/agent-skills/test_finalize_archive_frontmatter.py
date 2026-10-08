"""Native migration of tests/spec/agent-skills/finalize-archive-frontmatter.bats."""

import re
import subprocess

import pytest


@pytest.fixture
def finalize(repo_root):
    script = repo_root / "scripts/devflow-post-merge-finalize.sh"
    assert script.is_file()
    return script


@pytest.fixture
def fix(tmp_path, run_cmd):
    """BATS setup: Fixture-Repo mit lokalem Bare-Remote 'origin'. Kein Netz, keine DB."""
    fix_dir = tmp_path / "fix"
    remote = tmp_path / "remote.git"
    run_cmd(["git", "init", "-q", "--bare", str(remote)]).check()
    run_cmd(["git", "init", "-q", str(fix_dir)]).check()
    run_cmd(["git", "-C", str(fix_dir), "config", "user.email", "t@example.com"]).check()
    run_cmd(["git", "-C", str(fix_dir), "config", "user.name", "test"]).check()
    run_cmd(["git", "-C", str(fix_dir), "remote", "add", "origin", str(remote)]).check()
    plan = fix_dir / ".agents/plans/demo-change"
    (plan / "specs").mkdir(parents=True)
    (plan / ".ticket").write_text("T015916\n", encoding="utf-8")
    (plan / "proposal.md").write_text("# demo\n", encoding="utf-8")
    (plan / "tasks.md").write_text("# plan\ntitle: demo\nstatus: active\n", encoding="utf-8")
    run_cmd(["git", "-C", str(fix_dir), "add", "-A"]).check()
    run_cmd(["git", "-C", str(fix_dir), "-c", "commit.gpgsign=false", "commit", "-q", "-m", "seed"]).check()
    run_cmd(["git", "-C", str(fix_dir), "push", "-q", "origin", "HEAD:main"]).check()
    run_cmd(["git", "-C", str(fix_dir), "fetch", "-q", "origin", "main"]).check()
    return fix_dir


def test_t015916_frontmatter_state_meldet_stale_fuer_status_active(run_cmd, finalize, fix):
    r = run_cmd(["bash", str(finalize), "--frontmatter-state", "demo-change", "--repo", str(fix)], cwd=fix)
    assert r.returncode == 0
    assert r.output == "stale"


def test_t015916_frontmatter_state_meldet_completed_fuer_gesetztes_frontmatter(run_cmd, finalize, fix):
    tasks = fix / ".agents/plans/demo-change/tasks.md"
    tasks.write_text(re.sub(r"(?m)^status: active$", "status: completed", tasks.read_text(encoding="utf-8")),
                     encoding="utf-8")
    r = run_cmd(["bash", str(finalize), "--frontmatter-state", "demo-change", "--repo", str(fix)], cwd=fix)
    assert r.returncode == 0
    assert r.output == "completed"


def test_t015916_der_verstreute_plan_file_sed_aus_schritt_7_ist_entfernt(finalize):
    text = finalize.read_text(encoding="utf-8")
    lines = text.splitlines()
    # Positiv-Anker: die Alternation existiert genau einmal, im Helper.
    hits = sum(1 for line in lines if "active|plan_staged|in_progress|planning" in line)
    assert hits == 1
    # Negativ-Aussage: kein Sed gegen "$PLAN_FILE" mit der Alternation.
    stray = [line for line in lines if re.search(r'sed .*planning.*"\$PLAN_FILE"', line)]
    assert stray == []


def test_t900226_apply_completed_frontmatter_setzt_status_active_auf_completed(run_cmd, finalize, fix):
    tasks = fix / ".agents/plans/demo-change/tasks.md"
    r = run_cmd(["bash", str(finalize), "--apply-completed-frontmatter", str(tasks)], cwd=fix)
    assert r.returncode == 0
    assert re.search(r"^status: completed$", tasks.read_text(encoding="utf-8"), re.M)


def test_t900226_apply_completed_frontmatter_ist_idempotent_und_tastet_fremde_stati_nicht_an(
    run_cmd, finalize, fix
):
    tasks = fix / ".agents/plans/demo-change/tasks.md"
    tasks.write_text("# plan\ntitle: draft-demo\nstatus: draft\n", encoding="utf-8")
    before = tasks.read_text(encoding="utf-8")
    r = run_cmd(["bash", str(finalize), "--apply-completed-frontmatter", str(tasks)], cwd=fix)
    assert r.returncode == 0
    assert tasks.read_text(encoding="utf-8") == before


def test_t900226_completed_frontmatter_is_archived_directly_in_the_ticket_database(finalize):
    lines = finalize.read_text(encoding="utf-8").splitlines()

    def first_line(needle):
        for n, line in enumerate(lines, start=1):
            if needle in line:
                return n
        return None

    ln_complete = first_line('_apply_plan_frontmatter_completed_path "$_plan_copy"')
    ln_archive_plan = first_line('bash "$TICKET_SH" archive-plan')
    assert ln_complete is not None and ln_archive_plan is not None
    assert ln_complete < ln_archive_plan
