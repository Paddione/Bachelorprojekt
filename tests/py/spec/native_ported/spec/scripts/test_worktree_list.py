"""Native migration of tests/spec/scripts/worktree-list.bats."""

import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

# Prüfmodus: überwiegend command output verification — `worktree-list.sh` wird
# gegen ein echtes Wegwerf-Repo mit echtem `git worktree add` AUSGEFÜHRT und
# seine Ausgabe geprüft. Der letzte Test ist bewusst ein Konfigurations-Guard
# (grep): dass zwei Konfigurationsstellen denselben Pfad nennen, manifestiert
# sich ausschließlich im Quelltext — die dokumentierte Ausnahme der
# Test-Resultats-Konvention.


@pytest.fixture
def ctx(run_cmd, repo_root):
    """setup(): throwaway repo with an empty commit on branch main."""
    tmp = Path(tempfile.mkdtemp())
    main = tmp / "main"
    run_cmd(["git", "init", "-q", str(main)]).check()
    run_cmd(["git", "-C", str(main), "config", "user.email", "t@example.com"]).check()
    run_cmd(["git", "-C", str(main), "config", "user.name", "Test"]).check()
    run_cmd(["git", "-C", str(main), "commit", "-q", "--allow-empty", "-m", "init"]).check()
    run_cmd(["git", "-C", str(main), "branch", "-M", "main"]).check()
    yield {"repo": repo_root, "tmp": tmp, "main": main,
           "script": repo_root / "scripts/worktree-list.sh"}
    shutil.rmtree(tmp, ignore_errors=True)


def test_worktree_list_listet_den_haupt_checkout_und_einen_angelegten_worktree(run_cmd, ctx):
    main, script = ctx["main"], ctx["script"]
    # Positiv-Anker zuerst: ohne zweiten Worktree steht der Haupt-Checkout da.
    result = run_cmd(["bash", str(script)], cwd=main)
    assert result.returncode == 0
    assert str(main) in result.output

    run_cmd(["git", "-C", str(main), "worktree", "add", "-q", "-b", "feature/probe",
             str(main / ".worktrees" / "probe"), "main"]).check()

    result = run_cmd(["bash", str(script)], cwd=main)
    assert result.returncode == 0
    # Der neue Worktree erscheint mit seinem Branch — das ist die Zusicherung.
    probe_lines = [ln for ln in result.stdout.splitlines() if ".worktrees/probe" in ln]
    probe_line = "\n".join(probe_lines)
    assert probe_line
    assert "feature/probe" in probe_line


def test_worktree_list_json_gibt_beide_worktrees_als_eintraege_aus(run_cmd, ctx):
    main, script = ctx["main"], ctx["script"]
    run_cmd(["git", "-C", str(main), "worktree", "add", "-q", "-b", "feature/probe",
             str(main / ".worktrees" / "probe"), "main"]).check()

    result = run_cmd(["bash", str(script), "--json"], cwd=main)
    assert result.returncode == 0
    # Semantik statt Darstellung: geprüft wird, dass beide Pfade als JSON-Werte
    # vorkommen, nicht das Einrücken oder die Feldreihenfolge.
    assert f'"path": "{main}"' in result.output
    assert f'"path": "{main}/.worktrees/probe"' in result.output
    assert '"branch": "feature/probe"' in result.output


def test_worktree_list_meldet_ausserhalb_eines_git_repos_einen_umgebungsfehler(run_cmd, ctx):
    result = run_cmd(["bash", str(ctx["script"])], cwd=ctx["tmp"])
    assert result.returncode == 2


def test_opencode_worktreepath_stimmt_mit_dem_von_preflight_pr_scope_erzwungenen_pfad_ueberein(
        repo_root):
    # Drift-Guard: .opencode/worktree.jsonc legt Worktrees an, preflight-pr-scope.sh
    # verweigert den PR, wenn sie woanders liegen. Gehen die beiden auseinander,
    # erzeugt opencode Worktrees, aus denen kein PR entstehen kann.
    oc_path = ""
    pattern = re.compile(r'.*"worktreePath"[^\S\n]*:[^\S\n]*"([^"]*)".*')
    for line in (repo_root / ".opencode/worktree.jsonc").read_text().splitlines():
        m = pattern.match(line)
        if m:
            oc_path = m.group(1)
            break
    # Positiv-Anker: der Wert wurde überhaupt gelesen.
    assert oc_path
    assert oc_path == ".worktrees"

    text = (repo_root / "scripts/preflight-pr-scope.sh").read_text()
    assert re.search("/" + oc_path + "/", text)
