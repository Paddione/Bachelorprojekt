"""Native pytest migration of tests/spec/llm-pipeline/index-repo-embed-port.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_index_repo_ts_resolveembedconfig_bevorzugt_llm_embed_url_vor_jedem_fallback_2(repo_root, run_cmd, tmp_path):
    'index-repo.ts: resolveEmbedConfig bevorzugt LLM_EMBED_URL vor jedem Fallback'
    path_index_repo = str(repo_root) + '/scripts/index-repo.ts'
    assert Path(path_index_repo).is_file()
    result = run_cmd(['grep', '-c', 'process.env.LLM_EMBED_URL', path_index_repo])
    assert result.returncode == 0, result.output
    assert int(result.output) >= 1
    result = run_cmd(['grep', '-n', 'llm-router.workspace.svc.cluster.local', path_index_repo])
    assert result.returncode != 0, result.output
