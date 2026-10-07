---
name: code-graph-interpretation
description: Use when an agent needs to inspect or interpret the Bachelorprojekt K3 code graph, explain symbols and call paths, assess change impact (blast radius) from graph edges, resolve a stacktrace, failing test, or diff to the code it implicates, trace a feature end to end, find dead code, or decide whether graph evidence is trustworthy. Guides codebase-memory-mcp queries, freshness checks, edge interpretation, and source verification.
---

# Interpret the K3 code graph

Use this read-only runbook to answer a concrete code question. The graph is a map of parsed source and inferred relationships, so its output is a lead to verify against code, not a proof of runtime behavior. For platform doctrine use authored `docs/`; for broad semantic discovery use K1 first. See [recall routing](../../../docs/brain/recall-routing.md). Start here for anything structural (where, who-uses, how-does-X-reach-Y, what-breaks-if-changed); a trivial single-file lookup is faster with grep. Navigate via the graph and read only the files it implicates.

## 1. Establish the snapshot

From the repository root, discover the project and compare its indexed commit with the checkout you intend to discuss:

```bash
codebase-memory-mcp cli list_projects
codebase-memory-mcp cli index_status --project home-patrick-Bachelorprojekt
codebase-memory-mcp cli detect_changes --project home-patrick-Bachelorprojekt
git rev-parse HEAD
git rev-parse --verify origin/main
git status --short --branch
```

Record `git.head_sha`, `root_path`, `status`, `changed_count`, the local HEAD and locally known `origin/main`. A zero drift count means the tool detected no changes in its selected scope; it does not prove complete parsing or freshness against another checkout. Label `git.head_sha` as the SHA reported by the graph tool unless its version explicitly documents it as the last successfully indexed commit. Distinguish committed changes from staged, unstaged, and untracked files; deduplicate returned paths. Local `origin/main` can itself be stale: fetch when a live upstream comparison is needed. For a conservative fresh/stale/unknown decision with receipt evidence, run `python3 scripts/mcp/cbm-freshness.py status --repo PATH --project NAME --timeout SECONDS`; failed or missing probes never yield fresh. If a refresh is needed, resolve the serialized refresh task with `bash scripts/vda.sh oracle 'Refresh the K3 code graph'`; see the [stampede runbook](../../../docs/runbooks/cbm-index-stampede.md). If the graph is unavailable, inspect source directly and label the graph finding unavailable.

When the area is unfamiliar, orient before anchoring: use `get_architecture` scoped with `--path` and `--aspects '["overview"]'` to avoid dumping the file tree, and `get_graph_schema` for the actual node labels and edge types. Record observed blind spots separately from plausible parser limits: generated/minified symbols and route candidates without handlers were observed here; reflection, dynamic dispatch, callbacks, shell execution, and unsupported constructs need source checks. An architecture summary is a discovery aid, not a coverage measurement. Check the installed CLI version and MCP input schema before relying on enum values: `--help` may list a string flag without its allowed values.

## 2. Find one precise anchor

For a known name, use `search_graph` with a label, file pattern, and small limit. Use `--query` for a keyword search; `--name-pattern` is ignored when `--query` is present. Keep the full `qualified_name`, `file_path`, label, and `total`/`has_more` fields. Names often collide across code and tests.

```bash
codebase-memory-mcp cli search_graph --project home-patrick-Bachelorprojekt --name-pattern getSession --label Function --limit 10
codebase-memory-mcp cli get_code_snippet --project home-patrick-Bachelorprojekt --qualified-name '<qualified_name_from_search>'
```

The first result is not automatically the right symbol. Exclude test or generated-file matches when the question concerns production code, but retain them when assessing test coverage. A short name can be ambiguous; pass the selected full `qualified_name` to later tools.

When the input is a failure — a stacktrace, failing-test id, or diff — extract frames, paths, and symbol names, then resolve candidates with `search_graph`. Use the actual supplied diff or failure as evidence; do not invent missing input. Check `detect_changes --help` to select the comparison scope and combine it with the relevant `git diff` and `git status`. An arbitrary supplied diff may not exist in the indexed checkout. Deduplicate seeds by qualified name. Resolve `path:line` with `get_code_snippet` or source reads; search results may omit line numbers. Rank candidates by the failure frame, changed lines, and verified relationships. Focused `rg` is appropriate when a literal test name or frame is already known or the graph cannot resolve it.

## 3. Follow only relevant relationships

Consult `get_graph_schema` before custom Cypher. For call analysis, start with `trace_path` in `calls` mode, depth 1 or 2, and the selected full name. Valid directions in the inspected MCP schema are `inbound` (callers), `outbound` (callees), and `both`. The strings `callers` and `callees` silently produced incomplete responses in the local CLI. For service boundaries, use `cross_service` and corroborate routes and HTTP calls in source. Set `--include-tests true` when assessing test impact; tests are excluded by default. Use custom Cypher only with supported syntax and bounded results (`LIMIT` and `--max-rows`).

```bash
codebase-memory-mcp cli trace_path --project home-patrick-Bachelorprojekt --function-name '<qualified_name>' --direction inbound --mode calls --depth 2 --include-tests true
codebase-memory-mcp cli get_graph_schema --project home-patrick-Bachelorprojekt
```

Interpret edges by their declared type, not by node degree. `CALLS` is a parsed call relation; `USAGE` is a broader reference; `IMPORTS` is a dependency; `DEFINES` links a container to a symbol; `TESTS_FILE` associates a test with a file. `HTTP_CALLS`, `CONFIGURES`, similarity and co-change edges may be inferred or historical. Inspect `confidence`, `strategy`, `via`, and other edge properties when present. `in_degree` counts multiple edge types: it is **not** a caller count.

Choose the workflow for the question:

- **Change impact:** trace inbound from each changed symbol; add outbound traversal when dependency context is needed. Union results by qualified name while retaining each seed, direction, hop count, and edge reason when provided. Report direct and indirect candidates separately. Architecture tiers (entry / service / handler / data) are analyst classifications and need source support. A candidate may need inspection without necessarily breaking. Hop-based risk labels do not establish business severity.
- **Feature flow:** start at a verified entry and follow outbound calls and service edges. Label each mechanism and unsupported hop; do not invent queue/event connections absent from the schema or source.
- **A-to-B reachability:** resolve both endpoints and search within declared directions, edge types, and depth. A bounded traversal or arbitrary `MATCH` does not prove the globally shortest path. Report shortest-path capability as unverified unless the installed engine supports it and the actual query establishes it.
- **Unused-code candidates:** `search_graph --label Function --max-degree 0 --exclude-entry-points true --limit 20` is only an isolation heuristic. Total degree includes definitions and other non-call edges, so it can miss unused functions. Also examine inbound call/reference relationships, exports, framework registration, and runtime configuration in source. Neither filter is a deletion certificate.

For an empty result, first validate parameters, project, symbol identity, freshness, test exclusion, and response shape. Distinguish an error or omitted result field from an explicit empty list. A retry is useful when correcting a parameter or testing a new hypothesis; repeating an unchanged empty query is not. Report an absence account with the search bounds, known limitations, and a focused source check. Label query observations **FACT** and explanations such as dynamic dispatch **HEURISTIC** until verified. A grep can check a specific literal or reference; zero text matches do not prove runtime absence. Use this report convention without implying the engine returns a native absence envelope:

```json
{"results": [], "absence": {"fact": "No paths returned within the stated query bounds", "query": {"project": "...", "seed": "...", "mode": "calls", "direction": "inbound", "depth": 2, "include_tests": true}, "hypotheses": [], "source_check": {"command": "rg -n -F 'symbolName' relevant/path", "result": "not run"}}}
```

## 4. Verify and explain

Trust the graph for navigation — do not re-verify every returned node with grep. Open the source at the returned `file_path` and line span to confirm the anchor; for an impact or safety claim, additionally verify at least one representative relationship in source, and for a cross-service claim both sides plus the route/configuration. Use focused `rg`/file reads for literals, shell, generated code, and unsupported languages. Check `git diff` when working from uncommitted changes. Treat architecture summaries and hotspots as discovery hints: this repository's graph includes generated/minified symbols and route candidates without handlers.

Report: (1) project, tool version, reported graph SHA, checkout SHA, upstream comparison when relevant, and drift scope; (2) question and chosen qualified symbols; (3) relevant edges/path with direction, depth, test inclusion and truncation; (4) source files that corroborate claims; (5) uncertainty and the absence account when applicable. Label facts and hypotheses separately. Never infer runtime execution frequency, complete test coverage, or safe change scope from graph topology alone.

For the comparison that motivated these workflows and measurable follow-up goals, read [synthesis and goals](references/synthesis-and-goals.md). Suggestions do not authorize starting a goal or changing the graph engine.

## Viewing

The local graph UI is normally at `http://127.0.0.1:9749`; verify it responds before directing someone there. On a remote host, forward port 9749. The production/fleet 3D graph webview is deployed and accessible at `https://brain.mentolder.de` (protected by Pocket ID SSO). The UI helps explore a neighborhood; use CLI results and source for an auditable answer.

For observed schema and known graph limits, read [K3 architecture](../../../docs/brain/k3-code-graph.md). For the MCP tool selection policy, read [MCP tool guide](../references/mcp-tool-guide.md).
