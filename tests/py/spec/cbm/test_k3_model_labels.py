"""k3 model labels: the local :8095 pipeline must label LFM2.5 (what the
endpoint serves since Oct 2026), while cluster-facing bge-m3 paths keep
their label. A wrong label silently corrupts stores on endpoint swaps
because hashes bind (model, text)."""

import importlib.util
import subprocess
from pathlib import Path


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, str(path))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_local_pipeline_labels_lfm25(repo_root):
    mcp = repo_root / "scripts" / "mcp"
    sync = _load("cbm_embed_sync", mcp / "cbm-embed-sync.py")
    store = _load("cbm_embed_store", mcp / "cbm-embed-store.py")
    assert sync.DEFAULT_MODEL == "lfm25-embedding-350m"
    assert store.DEFAULT_MODEL == "lfm25-embedding-350m"
    assert sync.DEFAULT_MODEL == store.DEFAULT_MODEL

    rerank_src = (repo_root / "scripts" / "mcp" / "cbm-graph-rerank.py").read_text()
    # --model default lives on the top-level parser (built inside main(),
    # invisible to `hybrid --help`); pin the source line instead.
    assert 'add_argument("--model", default="lfm25-embedding-350m")' in rerank_src


def test_cluster_facing_paths_keep_bge_m3(repo_root):
    """Knowledge pgvector + bge-mcp resolve to the cluster true-bge-m3
    endpoint in production — their default must NOT follow the local
    :8095 relabel."""
    retrieve = (repo_root / "scripts" / "knowledge"
                / "lib-context-retrieve.mjs").read_text()
    server = (repo_root / "scripts" / "bge-mcp" / "server.mjs").read_text()
    assert "?? 'bge-m3'" in retrieve
    assert "?? 'bge-m3'" in server
