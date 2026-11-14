"""RED-Tests fuer bp-plan-tooling-ux: plan-lint nennt bei STRUCT2- und
Partial-Budget-Verstoessen den konkreten Regeltext und die gepruefte Stelle.

Jeder Test schlaegt auf dem Stand vor dem Fix fehl (kein Dateibezug / kein
Regeltext in der Meldung) und besteht nach dem Fix. Positive Anker zuerst:
die gueltigen Faelle muessen in beiden Zustaenden PASS liefern.
"""

import json

import pytest


def _lint(run_cmd, repo_root, plan_path):
    return run_cmd(
        ["bash", str(repo_root / "scripts" / "plan-lint.sh"), "--json", str(plan_path)],
        cwd=repo_root,
    )


def _hard(result):
    return json.loads(result.output or result.stdout)["hard"]


MINIMAL_HEAD = """---
title: {title}
domains: [infra]
status: active
---

# {title} Implementation Plan

## File Structure

- Modify: `scripts/example.sh`
"""

VERIFY_BLOCK = """
## Task 9: Verify

- [ ] gate

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
"""


def test_struct2_fehlermeldung_nennt_gepruefte_datei_und_regeltext(run_cmd, repo_root, tmp_path):
    plan = tmp_path / "struct2-ohne-dateibezug.md"
    plan.write_text(
        MINIMAL_HEAD.format(title="Struct2 Repro")
        + """
## Task 1: something without any failing step

Just prose, no test runner here.
"""
        + VERIFY_BLOCK,
        encoding="utf-8",
    )
    # Positiv-Anker: gueltiger Plan mit FAIL-Step besteht (Fixture-Basis intakt).
    anchor = tmp_path / "struct2-anker.md"
    anchor.write_text(
        MINIMAL_HEAD.format(title="Struct2 Anker")
        + """
## Task 1: RED first

Run: `bats tests/unit/example.bats`
Expected: FAIL with "command not found"
"""
        + VERIFY_BLOCK,
        encoding="utf-8",
    )
    res = _lint(run_cmd, repo_root, anchor)
    assert res.returncode == 0, res.output
    assert "STRUCT2" not in res.output

    # Eigentliche Behauptung: die STRUCT2-Meldung nennt die gepruefte Datei
    # (hier der Plan selbst) und den ausgeschlossenen Final-Verify (Regeltext).
    res = _lint(run_cmd, repo_root, plan)
    assert res.returncode == 1, res.output
    struct2 = [m for m in _hard(res) if m.startswith("STRUCT2:")]
    assert len(struct2) == 1, res.output
    assert plan.name in struct2[0], res.output
    assert "does NOT count" in struct2[0], res.output


def _partial_index(title, rows):
    return (
        MINIMAL_HEAD.format(title=title)
        + """
## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
"""
        + rows
        + VERIFY_BLOCK
    )


def _write_partial_change(tmp_path, index_rows, partials):
    change = tmp_path / "change"
    tasks_d = change / "tasks.d"
    tasks_d.mkdir(parents=True)
    (change / "tasks.md").write_text(_partial_index("Partial Repro", index_rows), encoding="utf-8")
    for name, body in partials.items():
        (tasks_d / name).write_text(body, encoding="utf-8")
    return change / "tasks.md"


def test_struct2_im_partial_modus_nennt_das_gepruefte_tests_partial(run_cmd, repo_root, tmp_path):
    plan = _write_partial_change(
        tmp_path,
        "| p1 | tasks.d/p1-impl.md | impl | scripts/example.sh | |\n"
        "| p2 | tasks.d/p2-tests.md | tests | scripts/other.sh | |\n",
        {
            "p1-impl.md": "# p1\n\nRun: `bats tests/unit/example.bats`\nExpected: FAIL\n",
            "p2-tests.md": "# p2\n\nNur Prosa, kein Failing-Step hier.\n",
        },
    )
    res = _lint(run_cmd, repo_root, plan)
    assert res.returncode == 1, res.output
    struct2 = [m for m in _hard(res) if m.startswith("STRUCT2:")]
    assert len(struct2) == 1, res.output
    # Die Meldung muss sagen, DASS sie p2-tests.md geprueft hat — sonst sucht
    # man die Ursache in der falschen Datei (Mishap STRUCT-PARTIAL-Reihenfolge).
    assert "p2-tests.md" in struct2[0], res.output


def test_partial_budget_meldung_nennt_regeltext_mit_zeichenlimit(run_cmd, repo_root, tmp_path):
    filler = "Wort " * 6200  # ~31000 Zeichen -> ueber 7000 Token
    plan = _write_partial_change(
        tmp_path,
        "| p1 | tasks.d/p1-impl.md | impl | scripts/example.sh | |\n"
        "| p2 | tasks.d/p2-tests.md | tests | scripts/other.sh | |\n",
        {
            "p1-impl.md": "# p1\n\n" + filler + "\n",
            "p2-tests.md": "# p2\n\nRun: `bats tests/unit/example.bats`\nExpected: FAIL\n",
        },
    )
    res = _lint(run_cmd, repo_root, plan)
    assert res.returncode == 1, res.output
    budget = [m for m in _hard(res) if "T002453-C" in m]
    assert len(budget) == 1, res.output
    # Positiv-Anker im selben Satz: Datei, Token und Limit bleiben erhalten ...
    assert "p1-impl.md" in budget[0], res.output
    assert "7000" in budget[0], res.output
    # ... und der kanonische Regeltext (Zeichenbudget + Split-Regel) kommt dazu.
    assert "28000" in budget[0], res.output
    assert "split the slot otherwise" in budget[0], res.output


def _finalize_harness(tmp_path, run_cmd, plan_status):
    """Fixture-Repo mit Bare-Remote, gemergtem Branch und Worktree.

    Gibt (fix, worktree, env) zurueck; der Plan liegt UNCOMMITTED mit
    plan_status im Worktree. gh ist ein Stub ohne Netz (PR-Pfad = Skip).
    """
    import os

    fix = tmp_path / "fix"
    remote = tmp_path / "remote.git"
    bin_dir = tmp_path / "bin"
    run_cmd(["git", "init", "-q", "--bare", str(remote)]).check()
    run_cmd(["git", "init", "-q", "-b", "main", str(fix)]).check()
    run_cmd(["git", "-C", str(fix), "config", "user.email", "t@example.invalid"]).check()
    run_cmd(["git", "-C", str(fix), "config", "user.name", "test"]).check()
    run_cmd(["git", "-C", str(fix), "remote", "add", "origin", str(remote)]).check()
    (fix / "file").write_text("base\n", encoding="utf-8")
    run_cmd(["git", "-C", str(fix), "add", "-A"]).check()
    run_cmd(["git", "-C", str(fix), "commit", "-qm", "seed"]).check()
    run_cmd(["git", "-C", str(fix), "push", "-q", "origin", "HEAD:main"]).check()
    run_cmd(["git", "-C", str(fix), "remote", "set-head", "origin", "main"]).check()
    for name, body in (
        ("agent-lock.sh", "#!/usr/bin/env bash\necho free\n"),
        ("worktree-clean-check.sh", "#!/usr/bin/env bash\nexit 0\n"),
    ):
        p = fix / "scripts" / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(body, encoding="utf-8")
        p.chmod(0o755)
    run_cmd(["git", "-C", str(fix), "add", "-A"]).check()
    run_cmd(["git", "-C", str(fix), "commit", "-qm", "scripts"]).check()
    run_cmd(["git", "-C", str(fix), "push", "-q", "origin", "HEAD:main"]).check()
    wt = fix / "wt"
    run_cmd(["git", "-C", str(fix), "worktree", "add", "-q", "-b", "fix/demo", str(wt)]).check()
    plan_dir = wt / ".agents" / "plans" / "demo"
    plan_dir.mkdir(parents=True)
    (plan_dir / "tasks.md").write_text(
        "# plan\ntitle: demo\nstatus: %s\n" % plan_status, encoding="utf-8"
    )
    bin_dir.mkdir()
    gh = bin_dir / "gh"
    gh.write_text("#!/usr/bin/env bash\nexit 1\n", encoding="utf-8")
    gh.chmod(0o755)
    env = dict(os.environ, PATH="%s:%s" % (bin_dir, os.environ["PATH"]))
    return fix, wt, env


def _finalize(run_cmd, repo_root, fix, env, *args):
    return run_cmd(
        ["bash", str(repo_root / "scripts" / "devflow-post-merge-finalize.sh"),
         "--repo", str(fix), *args],
        cwd=fix,
        env=env,
    )


def test_schritt7_lehnt_unbekannten_plan_status_laut_ab(
    run_cmd, repo_root, tmp_path
):
    fix, wt, env = _finalize_harness(tmp_path, run_cmd, "draft")
    # Realer Ablauf: der Plan ist auf dem Branch committet (Schritt 1 loest
    # ihn ueber den Git-Tree auf, Schritt 7 arbeitet auf dem Worktree).
    run_cmd(["git", "-C", str(wt), "add", "-A"]).check()
    run_cmd(["git", "-C", str(wt), "commit", "-qm", "plan"]).check()
    run_cmd(["git", "-C", str(fix), "merge", "-q", "--no-ff", "fix/demo"]).check()
    run_cmd(["git", "-C", str(fix), "push", "-q", "origin", "HEAD:main"]).check()
    res = _finalize(
        run_cmd, repo_root, fix, env, "--branch", "fix/demo", "--plan",
        ".agents/plans/demo/tasks.md",
    )
    tasks = wt / ".agents" / "plans" / "demo" / "tasks.md"
    # `status: draft` ist weder completed noch aktiv: kein stiller
    # "bereits completed"-Skip, sondern ein lauter Fehler mit Statusnennung.
    assert res.returncode == 1, res.output
    assert "ERROR: Schritt 7" in res.output, res.output
    assert "draft" in res.output, res.output
    assert "bereits completed" not in res.output, res.output
    assert wt.is_dir(), "Worktree muss bei Schritt-7-Fehler erhalten bleiben"
    content = tasks.read_text(encoding="utf-8")
    assert "status: draft" in content, content


def test_schritt7_meldet_unaufloesbaren_plan_laut_statt_warnung(
    run_cmd, repo_root, tmp_path
):
    fix, wt, env = _finalize_harness(tmp_path, run_cmd, "active")
    # Branch ist gemergt: ohne Schritt-7-Fehler wuerde das Cleanup bis zum
    # Ende laufen (Exit 0). Der Plan liegt aber AUSSERHALB des Worktrees.
    run_cmd(["git", "-C", str(wt), "add", "-A"]).check()
    run_cmd(["git", "-C", str(wt), "commit", "-qm", "plan"]).check()
    run_cmd(["git", "-C", str(fix), "merge", "-q", "--no-ff", "fix/demo"]).check()
    run_cmd(["git", "-C", str(fix), "push", "-q", "origin", "HEAD:main"]).check()
    elsewhere = tmp_path / "elsewhere" / "tasks.md"
    elsewhere.parent.mkdir(parents=True)
    elsewhere.write_text(
        "# plan\ntitle: elsewhere\nstatus: active\n", encoding="utf-8"
    )
    res = _finalize(
        run_cmd, repo_root, fix, env, "--branch", "fix/demo", "--plan", str(elsewhere),
    )
    assert res.returncode == 1, res.output
    assert "ERROR: Schritt 7" in res.output, res.output
    assert "[warn] Schritt 7" not in res.output, res.output
    assert wt.is_dir(), "Worktree muss bei Schritt-7-Fehler erhalten bleiben"
