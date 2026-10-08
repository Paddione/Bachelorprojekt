"""Native migration of tests/unit/scs-index.bats."""
import re

import pytest


@pytest.fixture
def index_ts(repo_root):
    path = repo_root / "scripts" / "index-repo.ts"
    assert path.is_file() and path.stat().st_size > 0, "scripts/index-repo.ts missing or empty"
    return path.read_text(encoding="utf-8")


@pytest.fixture
def scs_index_block(repo_root):
    """Emulate: sed -n '/^  scs:index:/,/^  scs:search:/p' taskfiles/Taskfile.data.yml"""
    lines = (repo_root / "taskfiles" / "Taskfile.data.yml").read_text(encoding="utf-8").splitlines()
    block, active = [], False
    start, end = re.compile(r"^  scs:index:"), re.compile(r"^  scs:search:")
    for line in lines:
        if not active and start.search(line):
            active = True
            block.append(line)
            continue
        if active:
            if end.search(line):
                break
            block.append(line)
    return block


def _count(text, needle):
    """Emulate: grep -c NEEDLE (fixed string, line-based)."""
    return sum(1 for line in text.splitlines() if needle in line)


def test_scs1_index_repo_ts_exists_and_is_non_empty(repo_root):
    """SCS-1: scripts/index-repo.ts exists and is non-empty"""
    path = repo_root / "scripts" / "index-repo.ts"
    assert path.is_file()
    assert path.stat().st_size > 0


def test_scs1_index_repo_contains_code_embeddings_table_ddl(index_ts):
    """SCS-1: index-repo.ts contains code_embeddings table DDL"""
    assert _count(index_ts, "code_embeddings") >= 3


def test_scs1_index_repo_contains_file_dependencies_table_ddl(index_ts):
    """SCS-1: index-repo.ts contains file_dependencies table DDL"""
    assert _count(index_ts, "file_dependencies") >= 2


def test_scs1_index_repo_uses_vector_1024_for_bge_m3_dimension(index_ts):
    """SCS-1: index-repo.ts uses vector(1024) for bge-m3 dimension"""
    assert _count(index_ts, "EMBED_DIM") >= 2


def test_scs1_index_repo_supports_file_flag_for_incremental_reindex(index_ts):
    """SCS-1: index-repo.ts supports --file flag for incremental reindex"""
    assert _count(index_ts, "--file") >= 1


def test_scs1_index_repo_uses_bge_m3_model(index_ts):
    """SCS-1: index-repo.ts uses bge-m3 model"""
    assert _count(index_ts, "bge-m3") >= 1


def test_scs1_index_repo_extracts_imports_for_dependency_graph(index_ts):
    """SCS-1: index-repo.ts extracts imports for dependency graph"""
    assert _count(index_ts, "extractImports") >= 1


def test_scs1_index_repo_ignores_node_modules_and_dist(index_ts):
    """SCS-1: index-repo.ts ignores node_modules and dist"""
    assert "node_modules" in index_ts
    assert "'dist'" in index_ts


def test_scs1_index_repo_chunks_yaml_separately_from_source(index_ts):
    """SCS-1: index-repo.ts chunks YAML separately from source"""
    assert _count(index_ts, "chunkYaml") >= 1


def test_scs1_index_repo_has_sha256_file_hashing_for_incremental(index_ts):
    """SCS-1: index-repo.ts has sha256 file hashing for incremental"""
    assert _count(index_ts, "sha256") >= 1


def test_scs1_index_repo_uses_ivfflat_index_for_cosine_similarity(index_ts):
    """SCS-1: index-repo.ts uses ivfflat index for cosine similarity"""
    assert _count(index_ts, "ivfflat") >= 1


def test_scs1_schema_sql_creates_unique_constraint_on_file_path_chunk_index(index_ts):
    """SCS-1: schema SQL creates UNIQUE constraint on file_path + chunk_index"""
    assert "UNIQUE(file_path, chunk_index)" in index_ts


def test_t002261_m2_index_repo_incremental_does_not_suppress_stderr_with_dev_null(repo_root):
    # Der npx-tsx-Aufruf darf stderr nicht nach /dev/null umleiten.
    path = repo_root / "scripts" / "index-repo-incremental.sh"
    assert path.is_file(), "scripts/index-repo-incremental.sh missing"
    assert "2>/dev/null" not in path.read_text(encoding="utf-8")


def test_t002261_m2_index_repo_incremental_does_not_discard_exit_codes_with_or_true(repo_root):
    # Der npx-tsx-Aufruf darf nicht mit || true Fehler verwerfen.
    path = repo_root / "scripts" / "index-repo-incremental.sh"
    assert path.is_file(), "scripts/index-repo-incremental.sh missing"
    assert "|| true" not in path.read_text(encoding="utf-8")


def test_scs1_index_repo_classifies_infrastructure_errors(index_ts):
    """SCS-1: index-repo.ts classifies infrastructure errors (T002292)"""
    assert _count(index_ts, "isInfrastructureError") >= 2


def test_scs1_index_repo_reports_unchanged_and_failed_files_separately(index_ts):
    """SCS-1: index-repo.ts reports unchanged and failed files separately (T002292)"""
    assert _count(index_ts, "unchanged_files") >= 1
    assert _count(index_ts, "failed_files") >= 1


def test_scs1_scs_index_does_not_use_fuser_k(scs_index_block):
    # Kommentarzeilen ausfiltern: der Task erklaert, warum hier kein fuser steht.
    """SCS-1: scs:index does not use fuser -k, which kills its own shell (T002292)"""
    executable = [line for line in scs_index_block if not re.match(r"^[ \t]*#", line)]
    assert sum(1 for line in executable if "fuser -k" in line) == 0


def test_scs1_scs_index_retry_loop_captures_exit_code_with_or(scs_index_block):
    """SCS-1: scs:index retry loop captures exit code with || (T002292)"""
    assert sum(1 for line in scs_index_block if "npx tsx scripts/index-repo.ts || rc=" in line) == 1


def test_scs1_ensure_schema_detects_vector_index_by_access_method_not_name(index_ts):
    """SCS-1: ensureSchema detects the vector index by access method, not by name (T002315)"""
    executable = [line for line in index_ts.splitlines() if not re.match(r"^\s*//", line)]
    assert sum(1 for line in executable if "indexname LIKE '%ivfflat%'" in line) == 0
    assert _count(index_ts, "am.amname IN ('hnsw', 'ivfflat')") == 1


def test_scs1_vector_index_is_hnsw_not_ivfflat(index_ts):
    """SCS-1: vector index is HNSW, not ivfflat (T002315)"""
    assert _count(index_ts, "USING hnsw (embedding vector_cosine_ops)") >= 1
    # kein CREATE eines ivfflat-Index mehr
    assert not any(re.search(r"CREATE INDEX.*USING ivfflat", line) for line in index_ts.splitlines())


def test_scs1_chunks_are_written_in_multi_row_inserts(index_ts):
    """SCS-1: chunks are written in multi-row inserts (T002315)"""
    assert _count(index_ts, "INSERT_BATCH") >= 2


def test_scs1_parallelism_defaults_to_one_worker(index_ts):
    """SCS-1: parallelism defaults to one worker (T002315)"""
    assert _count(index_ts, "process.env.SCS_WORKERS ?? 1") == 1


def test_scs1_files_containing_nul_bytes_are_skipped_before_insert(index_ts):
    """SCS-1: files containing NUL bytes are skipped before the insert (T002315)"""
    assert _count(index_ts, "u0000") >= 1


def test_scs1_chunking_lives_in_its_own_module(repo_root, index_ts):
    """SCS-1: chunking lives in its own module (T002315)"""
    assert (repo_root / "scripts" / "lib" / "scs-chunking.ts").is_file()
    assert _count(index_ts, "from './lib/scs-chunking.js'") >= 1
