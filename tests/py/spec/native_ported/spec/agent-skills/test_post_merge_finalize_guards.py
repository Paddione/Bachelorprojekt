"""Native migration of tests/spec/agent-skills/post-merge-finalize-guards.bats."""

import pytest


@pytest.fixture
def finalize_text(repo_root):
    finalize = repo_root / "scripts/devflow-post-merge-finalize.sh"
    assert finalize.is_file()
    return finalize.read_text(encoding="utf-8")


def test_t006348_auto_pfad_filtert_auf_merged_prs_anker(finalize_text):
    assert "--state merged" in finalize_text


def test_t006348_pr_pfad_prueft_den_pr_state_vor_der_closure_gh_pr_view_json_state(finalize_text):
    assert "gh pr view" in finalize_text
    assert "--json state" in finalize_text


def test_t006348_skript_ist_cwd_unabhaengig_cd_repo_dir_zu_skriptbeginn(finalize_text):
    assert 'cd "$REPO_DIR"' in finalize_text


def test_t006348_branch_reaper_aufruf_existiert_anker(finalize_text):
    assert "branch-reaper.sh" in finalize_text


def test_t006348_branch_reaper_aufruf_ist_cwd_unabhaengig_absoluter_skript_pfad(finalize_text):
    assert 'bash "$REPO_DIR/scripts/branch-reaper.sh"' in finalize_text


def test_t008014_worktree_aufloesung_nutzt_git_worktree_list_anker(finalize_text):
    assert "worktree list --porcelain" in finalize_text


def test_t008014_worktree_aufloesung_ordnet_per_branch_zeile_zu_branch_exact(finalize_text):
    assert 'refs/heads/$BRANCH' in finalize_text
    assert '"branch " b' in finalize_text
