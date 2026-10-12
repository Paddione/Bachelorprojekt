"""T901882: check-commit-vs-diff nennt chore(plan), Allowlist kennt nur plans.

Die Fehlermeldung von scripts/check-commit-vs-diff.sh (Zeilen 15, 213) und der
Hint in .githooks/commit-msg empfehlen chore(plan): fuer Plan-Only-Commits.
Der Scope plan existiert nicht (commitlint.config.cjs kennt nur plans,
T001434-Gotcha: chore(plans):) — Agenten, die der Meldung folgen, produzieren
Commits, die commitlint ablehnt.
"""

import pytest


@pytest.fixture
def ctx(tmp_path, repo_root, run_cmd):
    repo = tmp_path / "repo"
    repo.mkdir()
    for cmd in (
        ["git", "init", "-q"],
        ["git", "config", "user.email", "t@t"],
        ["git", "config", "user.name", "t"],
    ):
        run_cmd(cmd, cwd=repo).check(0)
    plans = repo / ".agents" / "plans" / "x"
    plans.mkdir(parents=True)
    (plans / "tasks.md").write_text("plan", encoding="utf-8")
    run_cmd(["git", "add", "--", ".agents/plans/"], cwd=repo).check(0)
    msg = tmp_path / "msg"
    msg.write_text("fix(infra): chain middleware\n", encoding="utf-8")
    return {
        "repo": repo,
        "msg": str(msg),
        "script": str(repo_root / "scripts" / "check-commit-vs-diff.sh"),
        "hook": str(repo_root / ".githooks" / "commit-msg"),
    }


def test_guard_empfiehlt_plans_scope(ctx, run_cmd, repo_root):
    """Fehlermeldung nennt den gueltigen Scope chore(plans):."""
    r = run_cmd(["bash", ctx["script"], ctx["msg"]], cwd=ctx["repo"])
    assert r.returncode != 0
    assert "chore(plans):" in r.output, r.output
    assert "chore(plan):" not in r.output, r.output


def test_kein_singular_scope_in_meldung_und_hook(ctx):
    """Weder Skript (Kommentar + Meldung) noch Hook-Hint nennen chore(plan):."""
    script_text = open(ctx["script"], encoding="utf-8").read()
    hook_text = open(ctx["hook"], encoding="utf-8").read()
    assert "chore(plan):" not in script_text
    assert "chore(plan):" not in hook_text
    assert "chore(plans):" in script_text
    assert "chore(plans):" in hook_text


def test_gueltiger_plans_commit_bleibt_gruen(ctx, run_cmd):
    """Positiv-Anker: chore(plans): mit Plan-Only-Diff passiert den Guard."""
    msg = ctx["repo"] / "msg-ok"
    msg.write_text(
        "chore(plans): stage x for execution [T901882]\n", encoding="utf-8"
    )
    r = run_cmd(["bash", ctx["script"], str(msg)], cwd=ctx["repo"])
    assert r.returncode == 0, r.output
