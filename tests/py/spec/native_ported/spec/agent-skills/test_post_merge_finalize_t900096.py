"""Native migration of tests/spec/agent-skills/post-merge-finalize-t900096.bats."""

import os

import pytest

STEP10_HELPER = r'''
_step10_delete_branch() {
  local repo="$1" branch="$2"
  if finalize_branch_fully_merged "$repo" "$branch"; then
    git branch -D "$branch" && echo "[ok] Schritt 10: lokaler Branch $branch entfernt"
  else
    echo "[warn] Schritt 10: lokaler Branch $branch traegt ungemergte Commits — bleibt erhalten" >&2
    echo "[skip] Schritt 10: lokaler Branch $branch behalten"
  fi
}
'''

GIT_STUB = """#!/usr/bin/env bash
echo "git $*" >> "$GIT_TRACE"
case "$*" in
  *"status --porcelain"*) printf '%s' "$GIT_PORCELAIN"; exit 0 ;;
  *"merge-base --is-ancestor"*) exit "${GIT_MERGEBASE_RC:-0}" ;;
  *"log --oneline"*) printf '%s\\n' "$GIT_LOG"; exit 0 ;;
  *) exit 0 ;;
esac
"""


@pytest.fixture
def finalize(repo_root):
    script = repo_root / "scripts/devflow-post-merge-finalize.sh"
    assert script.is_file()
    return script


@pytest.fixture
def guards_lib(repo_root):
    """Ersetzbar per FINALIZE_GUARDS_LIB (RED-Umschalter), Default: Repo-Lib."""
    lib = os.environ.get("FINALIZE_GUARDS_LIB") or str(repo_root / "scripts/lib/finalize-step-guards.sh")
    assert os.path.isfile(lib)
    return lib


@pytest.fixture
def stubs(tmp_path, monkeypatch):
    """BATS setup: git-Stub im PATH, Trace-Datei, Basis-Environment."""
    stub_dir = tmp_path / "stubs"
    stub_dir.mkdir()
    git = stub_dir / "git"
    git.write_text(GIT_STUB, encoding="utf-8")
    git.chmod(0o755)
    trace = tmp_path / "git-trace.log"
    trace.write_text("", encoding="utf-8")
    base_env = {
        "PATH": f"{stub_dir}:{os.environ.get('PATH', '')}",
        "GIT_TRACE": str(trace),
        "GIT_PORCELAIN": "",
        "GIT_LOG": "",
        "GIT_MERGEBASE_RC": "0",
    }
    return {"dir": stub_dir, "trace": trace, "env": base_env}


def _driver(guards_lib, body):
    return f'source "{guards_lib}"\n' + body


def _trace(stubs):
    return stubs["trace"].read_text(encoding="utf-8")


def test_t900096_1a_branch_mit_ungemergten_commits_wird_behalten_kein_branch_d(run_cmd, guards_lib, stubs):
    env = dict(stubs["env"], GIT_MERGEBASE_RC="1", GIT_LOG=(
        "a1b2c3d plan: Arbeit auf Branch-B (T900078-Fall)\n"
        "e4f5g6h fix: zweiter ungemergter Commit"
    ))
    script = _driver(guards_lib, STEP10_HELPER + '\n_step10_delete_branch "/tmp/repo" "feature/plan-T900078"\n')
    r = run_cmd(["bash", "-c", script], env=env)
    assert r.returncode == 0, r.output
    # Kein Delete ...
    assert "branch -D" not in _trace(stubs)
    # ... dafuer warn+skip, und die Warnung nennt die ungemergten Commits.
    assert "[warn]" in r.output
    assert "zweiter ungemergter Commit" in r.output
    assert "[skip]" in r.output


def test_t900096_1a_anker_voll_gemergter_branch_wird_geloescht_branch_d_laeuft_ok_zeile(run_cmd, guards_lib, stubs):
    # Positiv-Anker: ohne ihn waere (1a) vakuos.
    env = dict(stubs["env"], GIT_MERGEBASE_RC="0")
    script = _driver(guards_lib, STEP10_HELPER + '\n_step10_delete_branch "/tmp/repo" "feature/plan-T900078"\n')
    r = run_cmd(["bash", "-c", script], env=env)
    assert r.returncode == 0, r.output
    assert "branch -D" in _trace(stubs)
    assert "[ok] Schritt 10: lokaler Branch feature/plan-T900078 entfernt" in r.output


def test_t900096_1b_call_site_guard_existiert_in_finalize_sh_merge_base_anker_branch_d_anker(finalize):
    text = finalize.read_text(encoding="utf-8")
    assert "merge-base --is-ancestor" in text
    assert "finalize_branch_fully_merged" in text
    # Anker: die Delete-Aussage waere ohne bestehenden Delete-Aufruf vakuos.
    assert "branch -D" in text


def test_t900096_2a_dirty_tree_bricht_vor_checkout_b_ab_fatal_nennt_pfade(run_cmd, guards_lib, stubs):
    porcelain = "M docs/agent-guide/registry/agents.yaml\n?? .agents/plans/fremd/tasks.md"
    env = dict(stubs["env"], GIT_PORCELAIN=porcelain)
    # Die Lib ruft `exit 1`, darum in der Subshell: Guard zuerst, checkout -B danach.
    script = (
        f'export GIT_TRACE="{stubs["trace"]}" GIT_PORCELAIN="{porcelain}"\n'
        f'source "{guards_lib}"\n'
        'finalize_assert_clean_tree "/tmp/archive" && git checkout -B "chore/x" origin/main\n'
    )
    r = run_cmd(["bash", "-c", script], env=env)
    assert r.returncode != 0
    assert "FATAL" in r.output
    assert "docs/agent-guide/registry/agents.yaml" in r.output
    assert ".agents/plans/fremd/tasks.md" in r.output
    # Stub-Trace belegt: checkout -B wurde nie aufgerufen.
    assert "checkout -B" not in _trace(stubs)


def test_t900096_2a_anker_sauberer_tree_laeuft_durch_kein_fatal_checkout_b_erreicht(run_cmd, guards_lib, stubs):
    # Positiv-Anker: ohne ihn waere (2a) vakuos.
    env = dict(stubs["env"], GIT_PORCELAIN="")
    script = (
        f'export GIT_TRACE="{stubs["trace"]}" GIT_PORCELAIN=""\n'
        f'source "{guards_lib}"\n'
        'finalize_assert_clean_tree "/tmp/archive" && git checkout -B "chore/x" origin/main\n'
    )
    r = run_cmd(["bash", "-c", script], env=env)
    assert r.returncode == 0, r.output
    assert "FATAL" not in r.output
    assert "checkout -B" in _trace(stubs)
