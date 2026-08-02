# K3: Code-Graph (codebase-memory-mcp)

> Komponente des Brain-Architektur-Epics T002430.
> Stand: August 2026.

## Diagramm

```
┌──────────────────────────────────────────────────────────────────────┐
│                      CODEBASE-MEMORY-MCP                              │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │              Index (in-memory / server-side)                  │     │
│  │  • Symbole (Funktionen, Klassen, Variablen)                  │     │
│  │  • Aufrufketten (CALLS edges)                                │     │
│  │  • Datenfluss (DATA_FLOWS edges)                             │     │
│  │  • Routen (HTTP Routes + Channel Nodes)                      │     │
│  │  • ~30K Nodes, ~75K Edges pro Projekt                       │     │
│  │  • Persistenz: keiner (nicht mehr getrackt, T001717)         │     │
│  └──────────────┬──────────────────────────────────────────────┘     │
│                 │                                                     │
│    ┌────────────┼────────────────────────────────────┐               │
│    │            ▼ stdio (Kindprozess)                 │               │
│    │  /home/patrick/.local/bin/codebase-memory-mcp   │               │
│    │  (ELF 64-bit, statically linked Go binary)      │               │
│    └────────────┬────────────────────────────────────┘               │
│                 │                                                     │
└─────────────────┼─────────────────────────────────────────────────────┘
                  │
    ┌─────────────┼──────────────────────────────┐
    │             │ stdio / MCP transport         │
    │                                             │
    ▼                      ▼                      ▼
┌──────────────┐  ┌──────────────────┐  ┌──────────────┐
│ opencode     │  │ Claude Code      │  │ agy          │
│ .opencode/   │  │ mcp.json /       │  │ agy.yaml     │
│ opencode.jsonc│ │ settings.json    │  │              │
└──────┬───────┘  └────────┬─────────┘  └──────┬───────┘
       │                   │                   │
       │ 14 MCP-Tools      │                   │
       │                   │                   │
       ▼                   ▼                   ▼
  ┌─────────────────────────────────────────────────┐
  │  Verfügbare Tools (search_graph, trace_path,     │
  │  get_code_snippet, query_graph, get_architecture,│
  │  search_code, index_repository, detect_changes,  │
  │  list_projects, index_status, ingest_traces,     │
  │  manage_adr, get_graph_schema, delete_project)   │
  └─────────────────────────────────────────────────┘
```

## Schnittstellen

### Transport

| Harness | Konfiguration | Transport | Status |
|---------|--------------|-----------|--------|
| opencode | `.opencode/opencode.jsonc` | stdio (local) | aktiv |
| Claude Code | `mcp.json` / `settings.json` (via MCP Registry) | stdio | aktiv |
| agy | `agy.yaml` (via MCP Registry) | stdio | aktiv |

**MCP Registry-Eintrag** (`docs/agent-guide/registry/mcp.yaml`):
- Binary: `/home/patrick/.local/bin/codebase-memory-mcp`
- Transport: stdio
- Bridge: `http://127.0.0.1:18235/mcp/codebase-memory-mcp`

### Tools (14 verfügbar)

| Tool | Funktion |
|------|----------|
| `search_graph` | Symbole per Pattern oder Volltext finden |
| `trace_path` | Aufrufketten/Caller/Callees verfolgen |
| `get_code_snippet` | Quelltext eines Symbols lesen |
| `query_graph` | Cypher-Queries gegen den Graphen |
| `get_architecture` | High-Level-Architektur-Übersicht |
| `search_code` | Graph-gestützte grep-Suche |
| `index_repository` | Repository indizieren (manuell) |
| `detect_changes` | Code-Änderungen erkennen (git diff) |
| `list_projects` | Indizierte Projekte auflisten |
| `index_status` | Index-Status eines Projekts |
| `ingest_traces` | Runtime-Traces in Graph einspielen |
| `manage_adr` | Architecture Decision Records |
| `get_graph_schema` | Schema des Graphen abfragen |
| `delete_project` | Projekt aus Index löschen |

### Aufrufer (innerhalb der Codebase)

| Datei | Verwendung |
|-------|-----------|
| `AGENTS.md:78` | Prioritätsregel: "Use codebase-memory-mcp tools first (before grep/glob)" |
| `CLAUDE.md:22` | MCP-Server-Referenz + Schnellweg-Anleitung |
| `scripts/plan-intel.sh:165` | Intel-Bundle: `RISK_CODEBASE` = "codebase-memory not queried for this bundle" |
| `scripts/agent-tracing.mjs:1` | Subagent-Tracing via `ingest_traces` API |
| `scripts/health-goals-check.sh:389` | Health-Check: `graph.db.zst` nicht mehr getrackt (T001717) |
| `scripts/llm/ui-config-seed.mjs:25` | UI-Konfig: "Code-Graph: Symbole finden, Aufrufketten verfolgen" |
| `docs/agent-guide/maps/toolset-map.md:58` | Toolset-Map: Status `canonical` |
| `docs/superpowers/specs/2026-06-29-plan-intel-bundle-design.md` | Intel-Bundle-Design: 4 Intel-Quellen (codebase-memory, mcp-postgres, context7, LSP) |

## Speicher und Index

### Physischer Speicher
- **Kein lokaler Speicher** — kein `.codebase-memory/`-Verzeichnis existiert aktuell
- Historisch: `.codebase-memory/graph.db.zst` (16.7 MB, PR #2281) — seit T001717 nicht mehr getrackt
- Server-side: in-memory Index, vom MCP-Binary verwaltet
- Persistenz: Graph geht bei Prozess-Neustart verloren und muss neu indiziert werden

### Index-Triggert
| Trigger | Mechanismus | Status |
|---------|-----------|--------|
| `index_repository` | MCP-Tool, manuell | primär |
| `detect_changes` | MCP-Tool, git diff | ergänzend |
| CI/Hook | Kein automatisierter Trigger gefunden | **fehlt** |
| Post-Commit | Siehe K1 (bge-Embeddings) — Code-Graph hat kein Äquivalent | **fehlt** |

### Indizierte Projekte

| Projekt | Nodes | Edges | Größe | Context |
|---------|-------|-------|-------|---------|
| `.worktrees/remove-codebase-memory-graph-regen` | 30,519 | 75,572 | ~85 MB | Worktree-Test |
| `/tmp/wt-t001592-website-agent-settings` | 30,465 | 75,524 | ~61 MB | Worktree-Test |

> **Achtung:** Der Haupt-Repository-Pfad (`/home/patrick/Bachelorprojekt`) ist in keinem der indizierten Projekte enthalten. Beide Einträge zeigen auf temporäre Worktrees.

## K1/K3-Verhältnis (Defekt D8)

```
┌──────────────────────────────────────────────────────────────┐
│                    K1 (Vektor-Embeddings)                     │
│  bge-m3 → embeddings.ts → pgvector                           │
│  Index: openspec/specs/, docs/, Code-Chunks                   │
│  Semantische Suche (Bedeutung, natürliche Sprache)            │
│  Trigger: post-commit Hook (automatisch)                      │
├──────────────────────────────────────────────────────────────┤
│                    K3 (Code-Graph)                            │
│  codebase-memory-mcp → search_graph, trace_path              │
│  Index: Symbole, Aufrufketten, Routen, Abhängigkeiten         │
│  Strukturelle Suche (Caller, Callee, Datenfluss)              │
│  Trigger: manuell (index_repository / detect_changes)         │
├──────────────────────────────────────────────────────────────┤
│  GETRENNT MIT GRUND:                                          │
│  ✓ Verschiedene Abfragearten (Semantik ≠ Struktur)            │
│  ✓ Verschiedene Index-Modi (Vektor ≠ Graph)                   │
│  ✓ Verschiedene Index-Läufe (Hook ≠ manuell)                  │
│                                                                │
│  RISIKEN:                                                     │
│  ✗ Keine Querverweise zwischen K1 und K3                      │
│  ✗ Divergenz unbemerkt (kein Reconciliation-Mechanismus)      │
│  ✗ Unterschiedliche Index-Alter → inkonsistente Ergebnisse    │
│  ✗ Überlappungen (docstrings) doppelt + potenziell inkonsistent│
└──────────────────────────────────────────────────────────────┘
```

### Auseinanderlauf-Stellen

| Stelle | K1 | K3 | Divergenz-Risiko |
|--------|----|----|-----------------|
| Index-Zeitpunkt | post-commit (sofort) | manuell/periodisch | K3 hinkt hinterher |
| Scope | specs, docs, Code-Chunks | Symbole, Aufrufketten | Überschneidungen (docstrings) inkonsistent |
| Code-Änderungen | sofort sichtbar | erst nach manuellem Re-Index | Alte Ergebnisse bei neuer Codebasis |
| Fehlerbehandlung | fail-closed (bge-m3) / failover (Voyage) | Index-Tool-Fehler → leere Ergebnisse | Unterschiedliche Ausfall-Semantik |

## Defekt-Referenz (T002430)

| Defekt | Betrifft K3? | Status |
|--------|-------------|--------|
| D1: Keine beschrifteten Schnittstellen | ✅ | Behohen durch dieses Dokument |
| D2: Informationsfluss undurchsichtig | ✅ | Behohen durch Diagramm |
| D3: Keine Fehlerfortpflanzung dokumentiert | ✅ | Siehe Auseinanderlauf-Stellen |
| D4: Host-SPOF | — | N/A (lokaler Prozess, kein Cluster-Dienst) |
| D5: Kein Failover | ⚠️ | Kein Mechanismus bei Index-Ausfall |
| D6: Keine Health-Metriken | ⚠️ | `health-goals-check.sh` prüft nur ob `graph.db.zst` getrackt ist (nicht mehr) |
| D7: Index-Trigger manuell | ⚠️ | Kein automatischer Re-Index (anders als K1 post-commit) |
| D8: K1/K3 auseinanderlaufend | ⚠️ | **Kern-Defekt**: getrennte Indexe, keine Reconciliation |

## Ist/Soll-Abgrenzung

| Aspekt | IST | SOLL (empfohlen) |
|--------|-----|-----------------|
| Index-Persistenz | In-memory, geht bei Neustart verloren | Persistenter Index (graph.db) |
| Index-Trigger | Manuell (index_repository) | Automatisch (post-commit Hook, CI) |
| Projekt-Index | Nur Worktrees, nicht Haupt-Repo | Haupt-Repo + alle relevanten Worktrees |
| K1/K3-Reconciliation | Keine | Querverweise oder gemeinsamer Index-Lauf |
| Health-Monitoring | Kein Check | Health-Check: Index-Alter, Projekt-Präsenz |

## Änderungshistorie

| Datum | Ticket | Änderung |
|-------|--------|----------|
| 2026-06 | T001717 | graph.db.zst nicht mehr getrackt (Persistenz entfernt) |
| 2026-06 | PR #2281 | graph.db.zst (16.7MB) ursprünglich committed |
| 2026-07 | T002433 | Dieses Dokument: Visualisierung und Schnittstellen-Dokumentation |
