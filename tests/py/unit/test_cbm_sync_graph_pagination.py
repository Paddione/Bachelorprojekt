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


def test_fetch_function_full_rows_joins_doc_sig_on_span_overload_safe(graph, monkeypatch):
    """Overloads share (qname, path) but differ by start line: the join must
    keep each overload's own docstring/signature instead of collapsing them."""
    calls = {"n": 0}

    def fake_query_rows(project, timeout, query, ncols):
        calls["n"] += 1
        if "f.docstring" in query:
            assert "f.start_line" in query, "doc query must carry spans"
            return [("q.fn", "lib/a.ts", "10", "20", "doc-one"),
                    ("q.fn", "lib/a.ts", "30", "45", "doc-two")]
        assert "f.signature" in query, query
        return [("q.fn", "lib/a.ts", "10", "20", "(a: int)"),
                ("q.fn", "lib/a.ts", "30", "45", "(a: int, o: object)")]

    monkeypatch.setattr(graph, "query_rows", fake_query_rows)
    rows = graph.fetch_function_full_rows("proj", 60)
    assert len(rows) == 2, rows
    by_span = {(r[4], r[5]): r for r in rows}
    assert by_span[("10", "20")][2] == "doc-one", rows
    assert by_span[("30", "45")][2] == "doc-two", rows
    assert by_span[("10", "20")][3] == "(a: int)", rows
    assert by_span[("30", "45")][3] == "(a: int, o: object)", rows


def test_fetch_method_rows_joins_doc_on_span(graph, monkeypatch):
    def fake_query_rows(project, timeout, query, ncols):
        if "m.docstring" in query:
            assert "m.start_line" in query, "method doc query must carry spans"
            return [("q.C.run", "lib/a.ts", "10", "20", "Runs once.")]
        assert "m.parent_class" in query or "m.signature" in query, query
        return [("q.C.run", "lib/a.ts", "Proj", "10", "20", "(self)"),
                ("q.C.run", "lib/a.ts", "Proj", "30", "40", "(self, x: int)")]

    monkeypatch.setattr(graph, "query_rows", fake_query_rows)
    rows = graph.fetch_method_rows("proj", 60)
    assert len(rows) == 2, rows
    by_span = {(r[5], r[6]): r for r in rows}
    assert by_span[("10", "20")][2] == "Runs once.", rows
    assert by_span[("30", "40")][2] is None, rows


def test_parse_refs_reads_prefix_table_before_rows(graph):
    text = ("rows_refs: 2  (cols: id prefix)\n"
            "  0 prod/ingress.yaml\n"
            "  3 dev-local/components/\n"
            "rows_ref_rule: @N+suffix=prefix+suffix\n"
            "rows: 1  (cols: method path)\n"
            "  - @3+vaultwarden/ingress.yaml\n")
    assert graph.parse_refs(text) == {"0": "prod/ingress.yaml",
                                      "3": "dev-local/components/"}
    assert graph.parse_refs("rows: 1\n") == {}
    assert graph.parse_refs(None) == {}


def test_graph_rows_expands_refs_and_skips_refs_block(graph):
    text = ("rows_refs: 2  (cols: id prefix)\n"
            "  0 prod/ingress.yaml\n"
            "  3 dev-local/components/\n"
            "rows_ref_rule: @N+suffix=prefix+suffix\n"
            "rows: 3  (cols: method path)\n"
            "  - @3+vaultwarden/ingress.yaml\n"
            "  - @0+\n"
            "  - plain/path.yaml\n"
            "total: 3\n")
    rows = graph.graph_rows(text, 2)
    assert rows == [(None, "dev-local/components/vaultwarden/ingress.yaml"),
                    (None, "prod/ingress.yaml"),
                    (None, "plain/path.yaml")], rows


def test_graph_rows_unknown_ref_fails_closed(graph):
    text = ("rows_refs: 1  (cols: id prefix)\n"
            "  0 prod/ingress.yaml\n"
            "rows: 1  (cols: method path)\n"
            "  - @9+missing.yaml\n"
            "total: 1\n")
    with pytest.raises(graph.SyncError, match="ref-unknown"):
        graph.graph_rows(text, 2)


def test_split_row_honors_quoted_values_with_spaces(graph):
    line = ('  "home-proj.assets.Brett Design System.App" '
            '"assets/Brett Design System/App.jsx" "17" "145" ()')
    assert graph._split_row(line, 5) == [
        '"home-proj.assets.Brett Design System.App"',
        '"assets/Brett Design System/App.jsx"', '"17"', '"145"', '()']


def test_graph_rows_parses_quoted_space_paths(graph):
    text = ("rows: 2  (cols: qname path sl el sig)\n"
            '  "home-proj.assets.Brett Design System.App" '
            '"assets/Brett Design System/App.jsx" "17" "145" ()\n'
            "  home-proj.lib.f lib/f.ts \"1\" \"3\" \"(x: int)\"\n"
            "total: 2\n")
    rows = graph.graph_rows(text, 5)
    assert rows == [
        ("home-proj.assets.Brett Design System.App",
         "assets/Brett Design System/App.jsx", "17", "145", "()"),
        ("home-proj.lib.f", "lib/f.ts", "1", "3", "(x: int)")], rows


def test_split_row_unbalanced_quote_skips_row(graph):
    text = ("rows: 2  (cols: qname path)\n"
            '  "oops-broken lib/x.ts\n'
            "  home-proj.lib.f lib/f.ts\n"
            "total: 2\n")
    assert graph.graph_rows(text, 2) == [("home-proj.lib.f", "lib/f.ts")]


def test_resolve_ref_passes_plain_values_through(graph):
    assert graph.resolve_ref("plain/path.yaml", {"0": "x/"}) == \
        "plain/path.yaml"
    assert graph.resolve_ref("@param docstring", {"0": "x/"}) == \
        "@param docstring"
    assert graph.resolve_ref(None, {"0": "x/"}) is None


def test_paged_query_rows_fails_closed_without_meta(graph, monkeypatch):
    def fake_run_cli_json(cmd, timeout):
        return {"content": [{"type": "text", "text": "rows: 0\n"}]}

    monkeypatch.setattr(graph, "run_cli_json", fake_run_cli_json)
    with pytest.raises(graph.SyncError, match="page-meta-missing"):
        graph.paged_query_rows("proj", 60, "MATCH (n) RETURN n", 2)
