"""llm-proxy als Mitte fuer Embed/Rerank (T901560).

Portiert von tests/spec/llm-proxy-embed-mitte.bats — BATS ist seit T901392
deinstalliert, pytest unter tests/py/ ist der Standard. Stub-frei: reine
Datei-Assertions, kein Cluster noetig.

`LLM_MITTE_TEST_ROOT` (optional) ueberschreibt den Repo-Root — damit laesst
sich der RED-Zustand gegen Vor-Change-Dateien belegen, ohne den Checkout
anzufassen.
"""

import os
import re
from pathlib import Path
from urllib.parse import urlparse

ENV_FILES = [
    "environments/dev.yaml",
    "environments/fleet-mentolder.yaml",
    "environments/mentolder.yaml",
    "environments/staging.yaml",
    "environments/korczewski.yaml",
    "environments/fleet-korczewski.yaml",
]


def _root(repo_root: Path) -> Path:
    override = os.environ.get("LLM_MITTE_TEST_ROOT")
    return Path(override) if override else repo_root


def _quoted_url(text: str, key: str) -> str:
    m = re.search(rf'^\s*{key}:\s*"([^"]+)"', text, re.MULTILINE)
    assert m, f"{key} fehlt oder nicht quoted"
    return m.group(1)


def test_embed_und_rerank_url_teilen_proxy_host(repo_root: Path):
    """Alle environments/*.yaml: EMBED- und RERANKER-URL teilen denselben Basis-Host (eine Mitte)."""
    root = _root(repo_root)
    for rel in ENV_FILES:
        text = (root / rel).read_text(encoding="utf-8")
        embed = _quoted_url(text, "LLM_EMBED_URL")
        rerank = _quoted_url(text, "LLM_RERANKER_URL")
        embed_host = urlparse(embed).hostname
        rerank_host = urlparse(rerank).hostname
        assert embed_host == rerank_host, f"{rel}: Split-Hosts ({embed_host} vs {rerank_host})"


def test_probe_prueft_18235(repo_root: Path):
    """scripts/mcp-gateway/probe.sh hat :18235 im Raster (llm-proxy ist kein MCP-Server: HTTP-Health)."""
    text = (_root(repo_root) / "scripts" / "mcp-gateway" / "probe.sh").read_text(encoding="utf-8")
    assert "18235" in text, "probe.sh ohne 18235"


def test_watchdog_kennt_18235(repo_root: Path):
    """scripts/mcp-gateway/watchdog-check.sh behandelt :18235 (devmesh-Kette mit :13005)."""
    text = (_root(repo_root) / "scripts" / "mcp-gateway" / "watchdog-check.sh").read_text(encoding="utf-8")
    assert "18235" in text, "watchdog-check.sh ohne 18235"
