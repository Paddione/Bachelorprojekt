---
title: "devflow-mcp — Design"
ticket_id: T900985
domains: [agent-skills, dev-tooling, scripts, devflow]
status: plan_staged
---

# devflow-mcp — Design

## Ziel

Subagenten (bp-build/bp-run/bp-ship, Implementer aus dev-flow-execute, opencode/pi/llama.cpp)
sollen möglichst direkt ans Ziel kommen: in **einem** Aufruf die relevanten Pläne, Code-Symbole
und die passenden Werkzeuge bekommen, statt Shell-Skripte zu parsen und den Kontext selbst
zusammenzusuchen. Dazu Plan-Staging als ein strukturierter Schritt.

Vorgaben des Operators (2026-10-03):
- Code-Embeddings basieren auf dem **frisch erzeugten codebase-memory-Graphen**, nicht auf Datei-Chunks.
- Tool-Vorgaben ebenfalls per **bge-Rerank**.
- `plan_stage` legt Branch + Worktree an, in dem der Plan liegt.
- `ticket-mcp-node.stage_plan` wird unterdrückt (devflow `plan_stage` ist der einzige Weg).
- SCS-Index (`index-repo.ts`, `code_embeddings`) bleibt parallel, Ablösung erst nach Kalibrierung.
- Indexer läuft auf dem WSL-Host: post-merge + nightly.
- Graph-Korpus: **lokaler Cache** für die Laufzeit **und** SSOT in `knowledge.chunks`
  (Quelle `code_graph`) per Schreib-Port-Forward auf `shared-db`.

## Messung (2026-10-03, WSL-Host)

```bash
# codebase-memory 0.11.0 liegt in ~/.npm-global/bin (nicht im Login-PATH); Index vorher: 0 Projekte
~/.npm-global/bin/codebase-memory-mcp   # via scripts/toolset/lib/mcp-client.mjs: index_repository(mode=moderate)
# → 13,4 s, 56 131 Knoten, 135 693 Kanten
# query_graph: MATCH (f:Function) RETURN count(f) → 10 241 · Method 2 429 · Class 649
node scripts/toolset/probe.mjs --server bge-mcp --server mcp-postgres --dry-run
```

| Backend (Host) | Befund |
|---|---|
| bge-mcp :13005 | `bge_embed` 1024 Dim., 2 Texte 310 ms; `bge_rerank` 3 Dok. 686 ms. Reranker-Kontext n_ctx=2048 → Kandidaten vor dem Rerank kürzen |
| mcp-postgres :13001 | nur lesend, DB `website`: `specs_plans` 5009, `specs_ssot` 1635, `bug_tickets` 1294, `pr_history` 848 Chunks; `code_embeddings` 21 219 |
| PGURL / LLM_EMBED_URL | auf dem Host nicht gesetzt — Schreiben nur per Port-Forward (Muster `Taskfile.data.yml` knowledge:*) |
| codebase-memory | `query_graph` mit `format: json`, `next_cursor`, `max_output_tokens`; Felder `qualified_name`, `file_path`, `start_line`, `end_line`, `signature`, `docstring`; `CALLS`-Kanten |

## Architektur

```
scripts/devflow-mcp/
  server.mjs            stdio-JSON-RPC, Tool-Registry, Dispatch
  graph-index.mjs       CLI-Indexer: cbm → Symbole → Embeddings → Cache (+ --sync-db)
  lib/backends.mjs      bge (embed/rerank) + pg (read) — MCP-Clients, per Env überschreibbar
  lib/graph-cache.mjs   Cache lesen/schreiben, Kosinus-Top-k
  lib/symbols.mjs       Graph-Export → Chunk-Text je Symbol
  lib/tools-corpus.mjs  Tool-Dokumente aus toolset.lock + capabilities, rollen-/tier-gefiltert
  lib/plan-stage.mjs    Worktree → Plan → Lint → Commit → Push → stage-plan
  lib/run.mjs           Skript-Aufrufe mit Timeout, strukturierte Rückgabe
```

### D1 — Backends über MCP, per Env austauschbar
`bge`: Default HTTP `http://localhost:13005/mcp` mit `Bearer ${BGE_MCP_TOKEN}`; `pg`: Default
`http://localhost:13001/mcp` mit `Bearer ${MCP_POSTGRES_TOKEN}`; `cbm`: stdio, Binary aus
`DEVFLOW_CBM_BIN`, sonst `PATH`, sonst `~/.npm-global/bin/codebase-memory-mcp`. Jede Quelle ist
per `DEVFLOW_{BGE,PG,CBM}_STDIO="<cmd> <args>"` auf einen stdio-Server umlenkbar — so laufen die
Tests in CI gegen Fixture-Server ohne Cluster. Client: `scripts/toolset/lib/mcp-client.mjs`.

### D2 — Graph-Korpus: ein Chunk je Symbol
Function/Method/Class aus `query_graph` (JSON, Cursor-Paging). Chunk-Text:
`<kind> <kurzname>` · `file: <pfad>:<start>` · `signature` · `doc` (gekürzt) · erste 25 Zeilen
des Rumpfs aus der Datei (≤ 1200 Zeichen) · `calls:` / `called by:` (je ≤ 8 Kurznamen).
`text_hash` = sha256(Chunk-Text). Inkrementell: unveränderter `text_hash` übernimmt den Vektor
aus dem alten Cache, nur Neues wird eingebettet (bge-Batch 32).

### D3 — Cache + SSOT
Cache unter `${DEVFLOW_CACHE_DIR:-~/.cache/devflow-mcp}/<cbm-projekt>/`: `meta.json`
(`commit`, `built_at`, `cbm_version`, `dims`, `count`), `symbols.jsonl`, `vectors.f32`
(Float32, zeilenweise). Atomar geschrieben (tmp + rename). `--sync-db` schreibt denselben Korpus
mit `PGURL` in `knowledge.*`: Collection „Code Graph", `source = code_graph`, ein Dokument je
Datei (`source_uri = code:<pfad>`), ein Chunk je Symbol mit Vektor; Dokumente mit unverändertem
Hash werden übersprungen, verschwundene Dateien gelöscht. Taskfile-Einstieg baut den
Port-Forward nach dem Muster von `knowledge:*` (Port 15499, Passwort aus `workspace-secrets`).

### D4 — Retrieval
`search_code`: Query einbetten → Kosinus-Top-40 im Cache → bge-Rerank (Kandidatentexte auf
gemeinsam 4500 Zeichen gekürzt) → Top-k. Pläne/Bugs/PRs: Query-Vektor → mcp-postgres
`ORDER BY embedding <=> '[…]'::vector LIMIT 40` über `knowledge.chunks` (Quellen
`specs_plans`, `bug_tickets`, `pr_history`) → Rerank → Top-k. Ein Ausfall von Rerank liefert
Vektor-Reihenfolge mit `degraded: ["rerank"]`, ein Ausfall einer Quelle leert nur diese Sektion
mit Eintrag in `degraded` — nie ein Fehler für den ganzen Aufruf.

### D5 — Tool-Empfehlung
Dokumente je Tool aus `toolset.lock.yaml` (`summary` — erste Zeile der Beschreibung, ≤ 200
Zeichen, ab diesem Change vom Probe geschrieben) plus `use_when`/`avoid_when` der Instanz.
Gefiltert wie `toolset-context.sh`: Rolle, Instanz nicht `suppressed`, Tool nicht in
`tools_suppressed`, Tier ≤ `max_tier` (Default `assisted`). Rerank gegen den Aufgabentext.
Nicht-MCP-Instanzen (skill:, cli:) gehen als je ein Dokument mit ihrem `use_when` ein.

### D6 — `tools_suppressed` (Tool-Unterdrückung)
Neues optionales Feld an `mcp:`-Instanzen (Globs). `check.mjs`: Glob ohne Treffer bei gemessenem
Server → Fehler. `toolset-context.sh` und `recommend_tools` lassen die Tools weg. `sync.mjs`
setzt sie für Claude Code als `permissions.deny` (`mcp__<server>__<tool>`); verwaltet werden nur
Einträge mit Präfix `mcp__<registry-server>__`, fremde Deny-Regeln bleiben. opencode: nicht
durchgesetzt (wie `plugin:`), `check.mjs` meldet das als advisory. Erste Anwendung:
`ticket-mcp-node.stage_plan`.

### D7 — `plan_stage`
Ein Aufruf: `worktree-create.sh --unattended --no-main-sync <branch> <wt> origin/main` →
`agent-lock.sh claim ticket` → Plan (und optional `design.md`) nach `.agents/plans/<slug>/` →
`plan-lint.sh --json` (bei FAIL Abbruch, Worktree bleibt, Befunde strukturiert zurück) →
`plan-preflight.sh pre-commit` → Commit `chore(plans): stage <slug> for execution [<id>]` →
Push → `ticket.sh stage-plan --hold`. Rückgabe: jeder Schritt mit Status. Idempotent, wenn der
Worktree schon existiert und auf dem Branch steht. Tier `assisted` (pusht).

### D8 — Wrapper statt Neubau
`plan_lint` → `plan-lint.sh --json`; `lock` → `agent-lock.sh` (SID: Parameter, sonst
Harness-Env des Servers — `CLAUDE_CODE_SESSION_ID` u. a. erbt der Server vom Harness);
`collision_check` → `agent-collision.sh check --branch` im Worktree; `ci_status` → ein
`gh pr view/checks --json`-Schnappschuss (kein Polling); `task_oracle` → `vda.sh oracle --json`.

### D9 — Automatik
`.githooks/post-merge`: auf `main` im Haupt-Checkout `graph-index.mjs` im Hintergrund
(nohup, Log unter dem Cache, Single-Flight per Lock-Datei). `scripts/nightly-update.sh`: neuer
Schritt Vollauf mit `--sync-db`. Ohne erreichbare Backends endet der Indexer mit Exit 0 und
einer Meldung — ein Hook darf Git nie blockieren.

### D10 — Registrierung
`mcp.yaml`: Client `devflow-mcp` (stdio, `node scripts/devflow-mcp/server.mjs`, alle Harnesses).
`capabilities.yaml`: Fähigkeit `devflow-kontext` → `mcp:devflow-mcp`, Rollen bp-build/bp-run/
bp-ship/orchestrator, Tier `caution`, `tool_tiers`: `plan_stage` assisted, Lesetools safe.
Skills: Implementer-Handoff ruft `context_for_task` vor dem Spawn; dev-flow-plan nennt
`plan_stage` als Weg für Schritt 5.

## Nachträge aus der Umsetzung (gemessen gegen die echten Backends, 2026-10-03)

```bash
# bge-Durchsatz je Textlänge (Batch 8, über bge-mcp :13005)
node <scratch>/bge-tput2.mjs   # 150 Z.: 353 ms/Text · 300 Z.: 651 · 600 Z.: 1415 · 1200 Z.: ~2400
# Batch 16 mit 1200 Zeichen: Upstream-Timeout nach 30 s
node scripts/devflow-mcp/graph-index.mjs --repo /home/patrick/Bachelorprojekt --max-minutes 40
```

- **N1 — Eingebettet wird nur der Anfang (D2 präzisiert).** bge bettet seriell ein, ~2,2 ms je
  Zeichen. Embedding-Text = erste `DEVFLOW_EMBED_CHARS` (500) Zeichen des Chunks; der volle Text
  bleibt für Ausschnitt und Rerank. `text_hash` hängt am eingebetteten Teil.
- **N2 — Erstlauf in Etappen.** ~13 300 Symbole × ~1,1 s ≈ 4 h. Checkpoint alle 25 Batches,
  `--max-minutes` als Zeitbudget (Hook 20, Nightly 240), `meta.partial`/`meta.pending`;
  der nächste Lauf setzt fort. Produktivcode vor Tests. Batch 4 (statt 8), damit interaktive
  Anfragen nicht lange hinter einem Index-Batch warten; bei Timeout eine Wiederholung mit halber
  Batchgröße.
- **N3 — Tokens aus server.env.** Ohne Login-Shell fehlt `BGE_MCP_TOKEN` (gemessen: HTTP 401).
  `withTokens` liest wie `scripts/mcp-sync.sh` erst die Umgebung, dann
  `~/.config/{bge-mcp,mcp-postgres}/server.env`.
- **N4 — Ein Embedding je `context_for_task`.** Code und Wissen teilen den Anfragevektor.
- **N5 — Werkzeuge ohne Rerank lexikalisch.** Ohne Vektor-Reihenfolge wäre der Fallback die
  Registry-Reihenfolge (gemessen: `gh-axi` vorn für „Pod-Logs lesen").
- **N6 — Latenz unter Last.** Während ein Indexlauf bge belegt, braucht `context_for_task`
  20–35 s und der Rerank kann ausfallen (`degraded`). Ohne parallelen Indexlauf: Embedding
  ~0,35 s, Rerank ~0,7 s.
- **N7 — post-merge-Hook reparierte nebenbei den Graph-Refresh.** Der bisherige Aufruf zeigte auf
  `~/.local/bin/codebase-memory-mcp` (existiert nicht) — der codebase-memory-Index wurde nach
  Merges nie aktualisiert; das Linux-Binary hatte 0 Projekte.

## Nicht in diesem Change
- Ablösung des SCS-Index (Folgeticket nach Kalibrierung mit `kalibrierung-retrieval.mjs`).
- PATH-Fix für `codebase-memory-mcp` in den WSL-Harnesses (Host-Konfiguration, kein Repo-Inhalt);
  der Indexer löst das Binary selbst auf.
- opencode-seitige Durchsetzung von `tools_suppressed`.
