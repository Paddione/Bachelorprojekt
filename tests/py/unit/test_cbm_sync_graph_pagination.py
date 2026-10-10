"""Tests for scripts/mcp/cbm-sync-graph.py snapshot pagination.

Regression: query_graph defaults to 200 visible rows plus a small output-token
budget, so single-page fetches silently truncated the embed corpus (T901xxx —
embed-sync status reported ~400 candidates instead of ~36k and planned to
prune 22k good vectors). Every fetch helper must exhaust pages via cursor.
"""

import importlib.util
from pathlib import Path

import pytest


def load_graph_module(repo_root: Path):
    path = repo_root / "scripts" / "mcp" / "cbm-sync-graph.py"
    spec = importlib.util.spec_from_file_location("cbm_sync_graph_under_test", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def make_envelope(rows_text: str, has_more: bool, cursor: str | None = None) -> dict:
    body = (
        "rows: 2  (cols: qname path)\n"
        f"{rows_text}"
        "returned: 2\n"
        "total: 4\n"
        "total_relation: eq\n"
        f"has_more: {'true' if has_more else 'false'}\n"
    )
    if has_more and cursor:
        body += f"next_cursor: {cursor}\n"
    return {"content": [{"type": "text", "text": body}]}


@pytest.fixture
def graph(repo_root: Path):
    return load_graph_module(repo_root)


def test_parse_page_meta_continues(graph):
    text = "has_more: true\nnext_cursor: abc123\n"
    assert graph.parse_page_meta(text) == (True, "abc123")


def test_parse_page_meta_last_page(graph):
    assert graph.parse_page_meta("has_more: false\n") == (False, None)


def test_parse_page_meta_missing_fails_closed(graph):
    assert graph.parse_page_meta("rows: 1\n") == (None, None)


def test_paged_query_rows_exhausts_cursor(graph, monkeypatch):
    pages = [
        make_envelope("  a p1\n  b p2\n", True, "cursor-1"),
        make_envelope("  c p3\n  d p4\n", False),
    ]
    calls = []

    def fake_run_cli_json(cmd, timeout):
        calls.append(cmd)
        return pages[len(calls) - 1]

    monkeypatch.setattr(graph, "run_cli_json", fake_run_cli_json)
    rows = graph.paged_query_rows("proj", 60, "MATCH (n) RETURN n", 2)
    assert rows == [("a", "p1"), ("b", "p2"), ("c", "p3"), ("d", "p4")]
    assert len(calls) == 2
    assert "--cursor" not in calls[0]
    assert calls[1][calls[1].index("--cursor") + 1] == "cursor-1"


def test_paged_query_rows_fails_closed_on_stall(graph, monkeypatch):
    stalled = make_envelope("", True, "cursor-1")

    def fake_run_cli_json(cmd, timeout):
        return stalled

    monkeypatch.setattr(graph, "run_cli_json", fake_run_cli_json)
    with pytest.raises(graph.SyncError, match="no-progress"):
        graph.paged_query_rows("proj", 60, "MATCH (n) RETURN n", 2)


def test_paged_query_rows_fails_closed_without_meta(graph, monkeypatch):
    def fake_run_cli_json(cmd, timeout):
        return {"content": [{"type": "text", "text": "rows: 0\n"}]}

    monkeypatch.setattr(graph, "run_cli_json", fake_run_cli_json)
    with pytest.raises(graph.SyncError, match="page-meta-missing"):
        graph.paged_query_rows("proj", 60, "MATCH (n) RETURN n", 2)
