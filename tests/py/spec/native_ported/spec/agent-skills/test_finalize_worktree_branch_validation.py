"""Native migration of tests/spec/agent-skills/finalize-worktree-branch-validation.bats."""

import re
from pathlib import Path

import pytest


@pytest.fixture
def finalize(repo_root):
    script = repo_root / "scripts/devflow-post-merge-finalize.sh"
    assert script.is_file()
    return script


@pytest.fixture
def sandbox(tmp_path, run_cmd, monkeypatch):
    """BATS setup: Sandbox-Git-Repo mit einem Init-Commit."""
    repo = tmp_path / "repo"
    repo.mkdir()
    monkeypatch.setenv("GIT_AUTHOR_NAME", "t")
    monkeypatch.setenv("GIT_AUTHOR_EMAIL", "t@example.invalid")
    monkeypatch.setenv("GIT_COMMITTER_NAME", "t")
    monkeypatch.setenv("GIT_COMMITTER_EMAIL", "t@example.invalid")
    run_cmd(["git", "-C", str(repo), "init", "-q", "."]).check()
    run_cmd(["git", "-C", str(repo), "commit", "-q", "--allow-empty", "-m", "init"]).check()
    return repo


def _resolve_worktree(run_cmd, finalize, repo_dir, branch, slug):
    lines = finalize.read_text(encoding="utf-8").splitlines()
    section_lines = []
    inside = False
    for line in lines:
        if line == 'WORKTREE=""':
            inside = True
        if inside:
            section_lines.append(line)
            if re.match(r'^\[\[ -z "\$WORKTREE" \]\] && WORKTREE=', line):
                break
    section = "\n".join(section_lines)
    assert section, "FATAL: Aufloesungssektion nicht gefunden"
    script = "set -uo pipefail\n" + section + "\nprintf '%s\\n' \"$WORKTREE\"\n"
    return run_cmd(
        ["bash", "-c", script],
        env={"REPO_DIR": str(repo_dir), "BRANCH": branch, "SLUG": slug},
    )


def _branch_of(run_cmd, path):
    r = run_cmd(["git", "-C", str(path), "branch", "--show-current"])
    return r.stdout.strip()


def test_resolve_worktree_unter_abweichendem_pfad_wird_am_ziel_branch_gefunden(run_cmd, finalize, sandbox):
    slug = "mishap-rollup-2026-08-17-T009369"
    branch = f"chore/{slug}"
    run_cmd(["git", "-C", str(sandbox), "worktree", "add", "-q", "-b", branch,
             str(sandbox / ".worktrees" / f"{slug}-reuse")]).check()

    r = _resolve_worktree(run_cmd, finalize, sandbox, branch, slug)
    assert r.returncode == 0
    out = r.output
    assert out == str(sandbox / ".worktrees" / f"{slug}-reuse")
    assert Path(out).is_dir()
    assert _branch_of(run_cmd, out) == branch


def test_resolve_slug_pfad_mit_fremdem_branch_wird_nicht_gewaehlt(run_cmd, finalize, sandbox):
    slug = "mishap-rollup-2026-08-17-T009369"
    branch = f"chore/{slug}"
    run_cmd(["git", "-C", str(sandbox), "worktree", "add", "-q", "-b", branch,
             str(sandbox / ".worktrees" / f"{slug}-reuse")]).check()
    # Fremder Worktree belegt den Slug-Pfad, haelt aber einen anderen Branch
    run_cmd(["git", "-C", str(sandbox), "worktree", "add", "-q", "-b", "feature/fremd",
             str(sandbox / ".worktrees" / slug)]).check()

    r = _resolve_worktree(run_cmd, finalize, sandbox, branch, slug)
    assert r.returncode == 0
    out = r.output
    assert Path(out).is_dir()
    assert _branch_of(run_cmd, out) == branch
    assert out == str(sandbox / ".worktrees" / f"{slug}-reuse")


def test_resolve_kein_worktree_auf_dem_branch_fallback_bleibt_der_slug_pfad(run_cmd, finalize, sandbox):
    slug = "verwaister-slug-T000001"
    r = _resolve_worktree(run_cmd, finalize, sandbox, f"chore/{slug}", slug)
    assert r.returncode == 0
    out = r.output
    assert out == str(sandbox / ".worktrees" / slug)
    assert not Path(out).is_dir()
