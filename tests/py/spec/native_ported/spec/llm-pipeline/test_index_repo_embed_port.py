"""Native migration of tests/spec/llm-pipeline/index-repo-embed-port.bats."""
import re

import pytest

# T002570 / Bug 3: scripts/index-repo.ts must not reference the decommissioned
# host-local llama.cpp port :8095. Source grep is deliberate (T002448-M4 exception):
# a constant/comment statement in a TypeScript file.


@pytest.fixture
def index_repo(repo_root):
    path = repo_root / "scripts" / "index-repo.ts"
    assert path.is_file(), f"missing: {path}"
    return path


def _count(path, pattern: str) -> int:
    """grep -c equivalent: number of lines containing the fixed string."""
    return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if pattern in line)


def test_index_repo_ts_embed_fallbacks_point_to_8081_nowhere_to_8095(index_repo):
    # Positive anchor first: the corrected state must be present. Without the fix,
    # :8081 is not set and this block fails.
    assert _count(index_repo, "localhost:8081") >= 1
    assert _count(index_repo, "llm-gateway-embed.workspace.svc.cluster.local") >= 1
    assert _count(index_repo, "`http://${clusterHost}:8081`") >= 1
    # Negative: no occurrence of the dead port anywhere, comments included.
    assert "8095" not in index_repo.read_text(encoding="utf-8")


def test_resolve_embed_config_prefers_llm_embed_url_over_any_fallback(index_repo):
    # Positive anchor: the env var convention must remain the primary source.
    assert _count(index_repo, "process.env.LLM_EMBED_URL") >= 1
    # The dead llm-router service must not appear as an embedding target.
    assert "llm-router.workspace.svc.cluster.local" not in index_repo.read_text(encoding="utf-8")
