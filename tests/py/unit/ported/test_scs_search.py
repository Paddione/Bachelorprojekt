"""Native migration of tests/unit/scs-search.bats."""
import os
import re
from pathlib import Path


def _lines(path: Path):
    return path.read_text(encoding="utf-8").splitlines()


def _count(path: Path, pattern: str, regex: bool = False) -> int:
    """grep -c equivalent: number of lines matching pattern (literal unless regex=True)."""
    compiled = re.compile(pattern if regex else re.escape(pattern))
    return sum(1 for line in _lines(path) if compiled.search(line))


def _is_executable(path: Path) -> bool:
    return path.is_file() and os.access(path, os.X_OK)


CODESEARCH_API = "components/website/src/pages/sdlc/api/codesearch.ts"
CODESEARCH_DB = "components/website/src/lib/sdlc/codesearch-db.ts"
DETAIL_PANEL = "components/website/src/components/sdlc/cockpit/DetailPanelSidebar.svelte"
SUGGESTED_FILES = "components/website/src/components/sdlc/cockpit/SuggestedFiles.svelte"
COCKPIT_FLOOR = "components/website/src/lib/sdlc/cockpit-floor.ts"


# ── SCS-2 ─────────────────────────────────────────────────────────


def test_scs_2_codesearch_ts_exists(repo_root):
    """SCS-2: components/website/src/pages/sdlc/api/codesearch.ts exists"""
    assert (repo_root / CODESEARCH_API).is_file()


def test_scs_2_codesearch_api_requires_admin_auth(repo_root):
    """SCS-2: codesearch API requires admin auth"""
    assert _count(repo_root / CODESEARCH_API, "isAdmin") >= 1


def test_scs_2_codesearch_api_validates_query_parameter_q(repo_root):
    """SCS-2: codesearch API validates query parameter q"""
    assert _count(repo_root / CODESEARCH_API, "searchParams.get('q')") >= 1


def test_scs_2_codesearch_api_returns_503_when_embedding_service_unavailable(repo_root):
    """SCS-2: codesearch API returns 503 when embedding service unavailable"""
    assert _count(repo_root / CODESEARCH_API, "embedding service unavailable") >= 1


def test_scs_2_codesearch_api_supports_augmented_query_parameter(repo_root):
    """SCS-2: codesearch API supports augmented query parameter"""
    assert _count(repo_root / CODESEARCH_API, "augmented") >= 2


def test_scs_2_codesearch_db_ts_exists(repo_root):
    """SCS-2: components/website/src/lib/sdlc/codesearch-db.ts exists"""
    assert (repo_root / CODESEARCH_DB).is_file()


def test_scs_2_codesearch_db_ts_has_searchcode_function(repo_root):
    """SCS-2: codesearch-db.ts has searchCode function"""
    assert _count(repo_root / CODESEARCH_DB, "export async function searchCode") >= 1


def test_scs_2_codesearch_db_ts_uses_pgvector_cosine_distance_operator(repo_root):
    """SCS-2: codesearch-db.ts uses pgvector cosine distance operator"""
    assert _count(repo_root / CODESEARCH_DB, "<=>") >= 1


# ── SCS-3 ─────────────────────────────────────────────────────────


def test_scs_3_codesearch_db_ts_has_searchcodeaugmented_function(repo_root):
    """SCS-3: codesearch-db.ts has searchCodeAugmented function"""
    assert _count(repo_root / CODESEARCH_DB, "export async function searchCodeAugmented") >= 1


def test_scs_3_searchcodeaugmented_queries_file_dependencies_for_1_hop_neighbors(repo_root):
    """SCS-3: searchCodeAugmented queries file_dependencies for 1-hop neighbors"""
    assert _count(repo_root / CODESEARCH_DB, "file_dependencies") >= 1


def test_scs_3_augmented_neighbors_get_score_0_7(repo_root):
    # BRE in the original: '.' matches any character.
    """SCS-3: augmented neighbors get score=0.7"""
    assert _count(repo_root / CODESEARCH_DB, "score: 0.7", regex=True) >= 1


# ── SCS-4 ─────────────────────────────────────────────────────────


def test_scs_4_detailpanel_svelte_has_suggested_files_section(repo_root):
    """SCS-4: DetailPanel.svelte has suggested_files section"""
    assert _count(repo_root / DETAIL_PANEL, "suggested_files") >= 2


def test_scs_4_detailpanel_svelte_has_scorecolor_function(repo_root):
    """SCS-4: DetailPanel.svelte has scoreColor function"""
    assert _count(repo_root / SUGGESTED_FILES, "scoreColor") >= 1


def test_scs_4_cockpit_floor_ts_ticketdetail_has_suggested_files_field(repo_root):
    """SCS-4: cockpit-floor.ts TicketDetail has suggested_files field"""
    assert _count(repo_root / COCKPIT_FLOOR, "suggested_files") >= 2


# ── SCS-5 ─────────────────────────────────────────────────────────


def test_scs_5_githooks_post_commit_index_exists_and_is_executable(repo_root):
    """SCS-5: .githooks/post-commit-index exists and is executable"""
    hook = repo_root / ".githooks" / "post-commit-index"
    assert hook.is_file()
    assert _is_executable(hook)


def test_scs_5_post_commit_index_filters_for_indexable_file_extensions(repo_root):
    """SCS-5: post-commit-index filters for indexable file extensions"""
    assert _count(repo_root / ".githooks" / "post-commit-index", "ts|svelte|astro|yaml", regex=True) >= 1


def test_scs_5_scripts_index_repo_incremental_sh_exists_and_is_executable(repo_root):
    """SCS-5: scripts/index-repo-incremental.sh exists and is executable"""
    script = repo_root / "scripts" / "index-repo-incremental.sh"
    assert script.is_file()
    assert _is_executable(script)


def test_scs_5_taskfile_suite_has_scs_index_task(repo_root):
    """SCS-5: Taskfile suite has scs:index task"""
    assert _count(repo_root / "taskfiles" / "Taskfile.data.yml", "scs:index") >= 1


def test_scs_5_taskfile_suite_has_scs_search_task(repo_root):
    """SCS-5: Taskfile suite has scs:search task"""
    assert _count(repo_root / "taskfiles" / "Taskfile.data.yml", "scs:search") >= 1


def test_scs_5_secrets_install_hooks_includes_post_commit_index(repo_root):
    """SCS-5: secrets:install-hooks includes post-commit-index"""
    assert _count(repo_root / "taskfiles" / "Taskfile.platform.yml", "post-commit-index") >= 1


def test_scs_5_githooks_post_commit_exists_is_executable_and_dispatches_to_post_commit_index(repo_root):
    # git only auto-invokes a hook file named exactly "post-commit" [T001692].
    """SCS-5: .githooks/post-commit exists, is executable, and dispatches to post-commit-index"""
    hook = repo_root / ".githooks" / "post-commit"
    assert hook.is_file()
    assert _is_executable(hook)
    assert _count(hook, "post-commit-index") >= 1


def test_scs_5_secrets_install_hooks_chmods_post_commit(repo_root):
    """SCS-5: secrets:install-hooks chmods post-commit"""
    assert _count(repo_root / "taskfiles" / "Taskfile.platform.yml", r"chmod \+x .githooks/post-commit$", regex=True) >= 1
