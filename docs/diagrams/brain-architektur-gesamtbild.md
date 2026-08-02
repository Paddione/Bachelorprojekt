# Brain-Architektur: Gesamtbild und Defektliste (K8)

> Letztes Kind des Epics T002430. Integriert die Einzelbilder K1–K7.
> Stand: 2026-08-02. Erhebung T002438.

## Komponenten-Übersicht

| # | Komponente | Was sie hält | Dokumentation |
|---|-----------|-------------|---------------|
| K1 | Vektorspeicher (pgvector) | Drei Vektor-Tabellen: `knowledge.chunks`, `code_embeddings`, `ticket_embeddings` | `docs/diagrams/k1-vector-db.md` |
| K2 | bge-Embedding/Reranker | bge-m3 + bge-reranker-v2-m3 als K8s-Deployments | `docs/brain/k2-bge-paare.md` |
| K3 | Code-Graph (codebase-memory-mcp) | Symbol-Graph, Aufrufketten, 14 MCP-Tools | `docs/brain/k3-code-graph.md` |
| K4 | Brain-Wiki (Paddione/brain) | Externes Repo, ingest aus openspec/specs/ + docs/ | T002434 (in Arbeit) |
| K5 | OpenSpec | SSOT-Specs + Changes + Archiv, Lebenszyklus propose→apply→archive | `docs/brain/k5-openspec.md` |
| K6 | Ticket/Factory | tickets.tickets DB + factory pipeline | T002436 (in Arbeit) |
| K7 | Agenten/MCP-Harness | MCP-Server, Agenten-Rollen, llm-proxy Bridge | `docs/brain/k7-agenten-mcp.md` |

## Gesamtdiagramm

Kanten-Legende:
- `══►` trägt heute (gemessen/bestätigt)
- `──►` trägt, aber ungeprüft oder best-effort
- `- ->` deklariert, trägt heute NICHT
- `···►` fehlt ganz (sollte existieren)
- `(F)` Format · `(T)` Transport · `(A)` Auslöser

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         K5 — OpenSpec (SSOT)                                  │
│  openspec/specs/  (74 Dateien)  +  changes/  (176 unarchiviert)              │
│                                                                               │
│  ══► K1 (post-commit Hook)    (F) plaintext→bge-m3→1024d-Vektor              │
│       (T) HTTP via bge-router  (A) git commit                                │
│       Ziel: knowledge.chunks (pgvector)                                       │
│                                                                               │
│  ──► K4 (Brain-Ingest)        (F) Markdown                                   │
│       (T) Git (brain-ingest.sh liest openspec/specs/*.md)                    │
│       (A) manuell/CI (task brain:ingest:run)                                  │
│       ⚠ Nur archivierte SSOT — 134 gemergte, unarchivierte Changes fehlen    │
│                                                                               │
│  ══► K6 (Ticket-Link)         (F) .ticket-Datei → tickets.tickets DB        │
│       (T) Dateisystem→PostgreSQL (ticket.sh)                                 │
│       (A) openspec.sh propose                                                │
└──────────┬──────────────────────────────────────┬──────────────────────────────┘
           │                                       │
           ▼                                       ▼
┌──────────────────────────┐          ┌──────────────────────────────────────────┐
│    K1 — Vektorspeicher    │          │        K2 — bge-Embedding/Reranker       │
│  shared-db (pgvector)     │          │  k3d/llm-gpu.yaml (K8s, CPU-only)       │
│  knowledge.chunks (18k)   │◄═════════│  bge-embed :8081 + bge-rerank :8081      │
│  code_embeddings (18k)    │  HTTP    │  bge-mcp-Shim :13005 (MCP-Tool)          │
│  ticket_embeddings (0) 🔴 │          │                                          │
│                           │          │  ══► K3 (via MCP)                        │
│  ▲ Aufrufer (Leser):      │          │      bge_embed / bge_rerank Tools        │
│  │ codesearch-db.ts       │          │      (T) stdio→HTTP Bridge :18235        │
│  │ knowledge-db.ts        │          │                                          │
│  │ coaching-db.ts         │          │  ══► K7 (via llm-proxy)                  │
│  │ openspec_find_similar  │          │      (T) HTTP POST /v1/embeddings        │
│  │ tickets-embed.ts 🔴    │          │      (T) HTTP POST /v1/rerank            │
│  └────────────────────────┘          └──────────────────────────────────────────┘
│                                                │
│  K1 ← K2: bge-m3 schreibt Vektoren             │ K2 ← K3: bge-MCP-Tools
│  K1 ← K5: post-commit-embed                    │   rufen codebase-memory NICHT
│  K1 ← K6: ticket_embeddings (leer)             │   auf (verschiedene Abfragearten)
│                                                │
│  K1 → knowledge-db.ts (Retrieval)              │
│  K1 → factory-mcp (openspec_find_similar)      │
└────────────────────────────────────────────────┘
                                                │
┌───────────────────────────────────────────────┼──────────────────────────────────┐
│                  K3 — Code-Graph (codebase-memory-mcp)                            │
│  Symbol-Graph, Aufrufketten, 14 Tools, stdio→HTTP Bridge :18235                  │
│                                                                                   │
│  ══► K7 (via llm-proxy)   (T) stdio-Prozess, Bridge :18235/mcp/codebase-memory  │
│       (A) MCP-Tool-Aufruf durch Agent                                            │
│                                                                                   │
│  ···► K1 FEHLT            K3 hält Code-Struktur, K1 hält Code-Vektoren.         │
│       Beide indizieren dieselbe Codebasis, aber teilen weder Indexlauf noch       │
│       Speicher. Keine Querverweise zwischen Graph-Knoten und Vektor-Einträgen.   │
│                                                                                   │
│  ···► K5 FEHLT            Keine Kante: OpenSpec-Specs sind nicht im Code-Graph   │
│       indiziert (nur Code-Symbole). Ein Spec-Requirement kann nicht zu der        │
│       Funktion verlinken, die es implementiert.                                   │
└───────────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────────┐
│                     K4 — Brain-Wiki (Paddione/brain)                                │
│  Externes Git-Repo, ingest via scripts/brain-ingest.sh                             │
│  Quellen: openspec/specs/*.md (SSOT), docs/**/*.md, docs/agent-guide/              │
│                                                                                     │
│  ◄── K5 (ingest)    (F) Markdown  (T) Git (brain-ingest.sh)                       │
│       (A) task brain:ingest:run / CI                                               │
│                                                                                     │
│  ◄── K2 (bge)       Indirekt: Brain-Ingest nutzt embeddings.ts für Chunking        │
│                                                                                     │
│  ···► K1 FEHLT      Wiki hat keine Vektorsuche. Brain-Ingest schreibt nicht in     │
│       knowledge.chunks zurück. Wiki-Inhalte sind nur per Volltext durchsuchbar.     │
│                                                                                     │
│  ···► K3 FEHLT      Kein Code-Graph-Index des Brain-Repos.                         │
└───────────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────────┐
│                     K6 — Ticket/Factory (tickets.tickets + factory pipeline)        │
│  PostgreSQL-Tabellen, factory-mcp HTTP-Server :13003, ticket-mcp stdio              │
│                                                                                     │
│  ══► K5 (Ticket-Link)    (F) external_id  (T) PostgreSQL JOIN                     │
│       (A) openspec.sh propose (schreibt .ticket)                                    │
│                                                                                     │
│  ══► K7 (MCP-Tools)      ticket-mcp (26 Tools), factory-mcp (HTTP :13003)         │
│       (T) stdio→Bridge (ticket-mcp), HTTP direkt (factory-mcp)                     │
│                                                                                     │
│  - -> K1 (ticket_embeddings)  Tabelle existiert, tickets-embed.ts implementiert,   │
│       aber 0 Zeilen — kein Aufrufer, keine Hook, kein Cron. Toter Code.            │
│                                                                                     │
│  ···► K3 FEHLT            Factory-Pipeline trifft Entscheidungen über Tickets,     │
│       aber ohne Code-Graph-Kontext. Eine Ticket-Beschreibung die „ändere X" sagt,   │
│       kann nicht automatisch prüfen, ob X im Code-Graph existiert.                  │
└───────────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────────┐
│                     K7 — Agenten/MCP-Harness                                         │
│  llm-proxy :18235, mcp-bridge, systemd-Units, Browser-WebUI                        │
│                                                                                     │
│  ══► K2 (bge-mcp)        (T) HTTP :13005  (A) MCP-Tool-Aufruf                     │
│  ══► K3 (codebase-memory) (T) stdio→Bridge  (A) MCP-Tool-Aufruf                   │
│  ══► K6 (ticket/factory)  (T) stdio→Bridge + HTTP :13003                           │
│                                                                                     │
│  Alle stdio-MCP-Server laufen als Kindprozesse des llm-proxy.                       │
│  Die Bridge macht 93 Tools aus 4 Servern per HTTP erreichbar.                       │
│  Cluster-Tools (mcp-kubernetes, mcp-postgres) via kubectl port-forward.             │
│                                                                                     │
│  ···► K1 FEHLT            Kein MCP-Tool für Vektorsuche. pgvector ist nur über     │
│       website/src/lib/knowledge-db.ts erreichbar, nicht als MCP-Ressource.          │
│                                                                                     │
│  ···► K5 FEHLT            Kein MCP-Tool zum Lesen/Schreiben von OpenSpec-Specs.    │
│       Der Agent muss Dateien manuell lesen (Read-Tool).                             │
└───────────────────────────────────────────────────────────────────────────────────┘
```

## Kanten-Matrix (vollständig)

| Von | Nach | Richtung | Format | Transport | Auslöser | Status |
|-----|------|----------|--------|-----------|----------|--------|
| K5 | K1 | K5→K1 | plaintext→Vektor | HTTP (bge-router) | post-commit Hook | **trägt** |
| K5 | K4 | K5→K4 | Markdown | Git (brain-ingest.sh) | task brain:ingest:run | **trägt teilweise** (nur SSOT, nicht Changes) |
| K5 | K6 | K5→K6 | .ticket-Datei | Dateisystem→SQL | openspec.sh propose | **trägt** |
| K2 | K1 | K2→K1 | Vektor (1024d) | HTTP POST | embedQuery/embedBatch | **trägt** |
| K2 | K3 | K2→K3 | JSON-RPC | HTTP (bge-mcp) | MCP-Tool-Aufruf | **trägt** |
| K2 | K7 | K2→K7 | JSON-RPC | HTTP :13005 | MCP-Tool-Aufruf | **trägt** |
| K1 | K5 | K1→K5 | SQL-Query | pgvector | openspec_find_similar | **trägt** |
| K3 | K7 | K3→K7 | JSON-RPC | stdio→Bridge :18235 | MCP-Tool-Aufruf | **trägt** |
| K6 | K7 | K6→K7 | JSON-RPC / HTTP | stdio→Bridge / :13003 | MCP-Tool-Aufruf | **trägt** |
| K6 | K1 | K6→K1 | Vektor (1024d) | HTTP (geplant) | — | **läuft ins Nichts** (0 Zeilen) |
| K1 | K7 | K1→K7 | Vektor-Suche | — | — | **fehlt ganz** (kein MCP-Tool) |
| K1 | K3 | K1↔K3 | — | — | — | **fehlt ganz** (getrennte Indexe) |
| K3 | K5 | K3→K5 | — | — | — | **fehlt ganz** (Spec-zu-Code-Links) |
| K4 | K1 | K4→K1 | Vektor | — | — | **fehlt ganz** (Wiki-Vektorsuche) |
| K4 | K3 | K4→K3 | — | — | — | **fehlt ganz** (Brain-Repo-Graph) |
| K6 | K3 | K6→K3 | — | — | — | **fehlt ganz** (Ticket↔Code-Kontext) |
| K7 | K5 | K7→K5 | — | — | — | **fehlt ganz** (kein MCP-Tool) |
| K7 | K1 | K7→K1 | — | — | — | **fehlt ganz** (kein MCP-Tool) |

## Defektliste

### D1 — Tracking-Pipeline ins Nichts (Vorerhebung)
**Betroffene Kante:** K6 → (Monitoring)  
**Auswirkung:** Factory-Phasen-Events werden geschrieben, aber nicht aggregiert ausgewertet.  
**Typ:** Fehlfunktion (Daten produziert, nicht konsumiert).

### D2 — ticket_plans leer (Vorerhebung)
**Betroffene Kante:** K6 → K5  
**Auswirkung:** Ticket-Pläne existieren als Dateien in `openspec/changes/`, nicht als DB-Zeilen in `ticket_plans`.  
**Typ:** Inkompatibilität (zwei Wahrheiten über denselben Plan).

### D3 — Brain-Ingest nur Pilot (Vorerhebung)
**Betroffene Kante:** K5 → K4  
**Auswirkung:** Brain-Wiki-Ingest läuft nicht automatisch. 134 gemergte, unarchivierte Changes fehlen im Wiki.  
**Typ:** Fehlfunktion (Prozess existiert, läuft nicht).

### D4 — Browser-lokale MCP-Server (Vorerhebung)
**Betroffene Kante:** K7 → (Browser)  
**Auswirkung:** War: 4 Ad-hoc-MCP-Einträge in llama-WebUI. **Behoben** durch T002549/T002550 (ui-config-seed.mjs).  
**Restrisiko:** ui-config.json liegt außerhalb des Repos, kein Drift-Check.  
**Typ:** Inkompatibilität (behoben mit Rest).

### D5 — mcp-postgres/mcp-kubernetes ohne Listener (Vorerhebung)
**Betroffene Kante:** K7 → (Cluster)  
**Auswirkung:** War: Registry deklariert, kein Prozess. **Behoben** durch mcp-gateway.service (kubectl port-forward).  
**Restrisiko:** Ein Port-Forward-Prozess für beide — Einzelpunktausfall.  
**Typ:** Fehlfunktion (behoben mit Rest).

### D6 — llm-proxy degraded (Vorerhebung)
**Betroffene Kante:** K7 → (LLM-Provider)  
**Auswirkung:** Remote-Provider (deepseek, opencode-zen) antworten nicht. Primärpfad (gemma26) trägt.  
**Typ:** Fehlfunktion (partiell).

### D7 — :8098 Loadout-Divergenz (Vorerhebung)
**Betroffene Kante:** K7 → (llama-server)  
**Auswirkung:** gptoss-mcp auf :8098 mit 40 Tools lief an loadouts.json vorbei. **Eingetreten** — :8098 hat heute keinen Listener.  
**Typ:** Fehlfunktion (Symptom erledigt, Ursache offen).

### D8 — K1/K3 getrennte Indexe (Vorerhebung + K3-Erhebung)
**Betroffene Kante:** K1 ↔ K3 (fehlt)  
**Auswirkung:** K1 (Vektoren) und K3 (Code-Graph) indizieren dieselbe Codebasis getrennt. Unterschiedliche Aktualität, keine Querverweise.  
**Zusätzlich (K3):** Haupt-Repo nicht indiziert (nur temporäre Worktrees). Kein automatischer Index-Trigger.  
**Typ:** Inkompatibilität (zwei Wahrheiten über dieselbe Codebasis).

### D9 — MCP-Richtungsproblem (Vorerhebung)
**Betroffene Kante:** K7 → llama-server (serverseitig)  
**Auswirkung:** llama.cpp kann HTTP-MCPs nicht serverseitig laden. **Umgegangen** durch mcp-bridge.mjs (T002429).  
**Heute:** Browser ist Konsument, nicht llama-server.  
**Typ:** Inkompatibilität (umgeangen, nicht aufgelöst).

### D10 — Archivierungs-Rückstau (K5-Erhebung)
**Betroffene Kante:** K5 → K4  
**Auswirkung:** 134 von 176 unarchivierten Changes sind ticket-seitig `done`, aber nie archiviert. SSOT und Realität laufen auseinander.  
**Typ:** Fehlfunktion (Vollzugs-Rückstau).

### D11 — ticket_embeddings toter Code (K1-Erhebung)
**Betroffene Kante:** K6 → K1 (fehlt)  
**Auswirkung:** `tickets.ticket_embeddings` hat 0 Zeilen. `tickets-embed.ts` ist vollständig implementiert, aber kein Aufrufer.  
**Typ:** Fehlfunktion (Code existiert, ungenutzt).

### D12 — Spec↔Code-Lücke (diese Erhebung)
**Betroffene Kante:** K3 → K5 (fehlt)  
**Auswirkung:** Ein OpenSpec-Requirement kann nicht automatisch zur implementierenden Funktion verlinken. Manuelles Tracing nötig.  
**Typ:** Fehlende Kante.

### D13 — Kein MCP-Tool für Vektorsuche (diese Erhebung)
**Betroffene Kante:** K7 → K1 (fehlt)  
**Auswirkung:** Agenten können pgvector nicht direkt abfragen. Müssen über website-API-Routen gehen.  
**Typ:** Fehlende Kante.

### D14 — Kein MCP-Tool für OpenSpec (diese Erhebung)
**Betroffene Kante:** K7 → K5 (fehlt)  
**Auswirkung:** Agenten lesen Specs via Read-Tool (Dateisystem) statt über strukturierte MCP-API.  
**Typ:** Fehlende Kante.

## Fehlende Kanten (die es geben müsste)

| # | Von | Nach | Begründung | Priorität |
|---|-----|------|-----------|-----------|
| E1 | K1 | K3 | Gemeinsamer Index oder Querverweise zwischen Vektor- und Graph-Sicht auf dieselbe Codebasis | **hoch** (D8) |
| E2 | K6 | K3 | Factory soll Code-Kontext für automatisierte Entscheidungen nutzen können | mittel |
| E3 | K7 | K1 | MCP-Tool für Vektorsuche — Agenten direkten pgvector-Zugriff geben | mittel |
| E4 | K7 | K5 | MCP-Tool zum Lesen/Schreiben von OpenSpec-Specs | mittel |
| E5 | K4 | K1 | Brain-Wiki-Inhalte vektorisieren für semantische Suche | niedrig |
| E6 | K3 | K5 | Requirements→Code-Links (welche Funktion implementiert welches Requirement) | niedrig |
| E7 | K4 | K3 | Code-Graph des externen Brain-Repos | niedrig |
| E8 | K6 | K1 | ticket_embeddings aktivieren (Hook/Cron zum Befüllen) | **hoch** (D11) |
| E9 | K5 | K5 | Automatischer Archivierungs-Trigger nach Merge (Rückstau D10 beheben) | **hoch** (D10) |

## Fazit

**Trägt heute:**
- K5→K1 (Embedding-Hook) — aktiv, redundant, fail-soft
- K2→K1 (Embedding-Produktion) — aktiv, bge-m3 + Voyage-Fallback
- K2→K7 (bge-mcp) — aktiv, Bearer-geschützt
- K3→K7 (codebase-memory via Bridge) — aktiv, 14 Tools
- K6→K7 (ticket-mcp + factory-mcp) — aktiv, 26+7 Tools
- K7 (llm-proxy + Bridge) — aktiv, 93 Tools aggregiert

**Trägt teilweise oder degradiert:**
- K5→K4 (Brain-Ingest) — nur SSOT, 134 Changes unsichtbar
- K6→K1 (ticket_embeddings) — 0 Zeilen, toter Code

**Fehlt (strukturelle Lücken):**
- K1↔K3 (D8) — getrennte Indexe, keine Reconciliation
- K7→K1 — kein MCP-Tool für Vektorsuche
- K7→K5 — kein MCP-Tool für OpenSpec
- K6→K3 — kein Ticket↔Code-Kontext
- K4↔K1 — Wiki ohne Vektorsuche

**Unklar (mangels K4/K6-Dokumentation):**
- K4↔K6 (Verlinkung Wiki↔Tickets)
- K4↔K7 (MCP-Zugriff auf Wiki)
- K6 interne Datenflüsse (Factory-Pipeline-Details)

## Änderungshistorie

| Datum | Ticket | Änderung |
|-------|--------|----------|
| 2026-07-28 | T002430 | Epic Vorerhebung: D1–D9, Kanten skizziert |
| 2026-08-02 | T002438 | Dieses Dokument: Gesamtdiagramm, Defektliste D1–D14, fehlende Kanten E1–E9 |
