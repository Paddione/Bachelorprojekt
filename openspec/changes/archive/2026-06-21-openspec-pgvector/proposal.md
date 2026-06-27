---
ticket_id: T001008
status: archived
---

# Proposal: openspec-pgvector

## Why

OpenSpec-Dokumente (`proposal.md`, `tasks.md`, `specs/<slug>.md`) werden aktuell
ausschließlich grep-basiert von `plan-context.sh` gelesen. Bei wachsender Spec-Anzahl
sinkt die Retrieval-Qualität: grep findet nur exakte Strings, aber keine semantisch
ähnlichen Konzepte. Agents müssen alle Dateien lesen um Relevanz zu bestimmen.

`knowledge.collections` hat bereits eine `source='specs_plans'`-Kategorie (bisher
ungenutzt). Der bge-m3/TEI-Embedding-Stack läuft produktiv. Die Infrastruktur ist
fertig — sie wird nur noch nicht genutzt.

## What

Semantische Suche über OpenSpec-Dokumente via pgvector. Hybrid-Architektur:

**Write-Pfad (CLI):** `scripts/openspec-embed.mjs` — standalone Node.js ESM-Script,
das direkt PostgreSQL + TEI anspricht. Aufgerufen von `scripts/openspec.sh` nach
`cmd_apply` und `cmd_archive`. Idempotenter Upsert via DELETE+INSERT on
`knowledge.documents` (CASCADE auf `knowledge.chunks`). Best-effort (Exit 0 bei Fehler).

**Chunking:** `proposal.md` atomisch (ein Embedding = Intent-Anker), `tasks.md` und
`specs/<slug>.md` section-basiert an `##`-Headings (max 400 Tokens, 50-Token-Overlap).

**Read-Pfad (API):** `GET /api/openspec/search?q=<text>&limit=5&status=<filter>` in
der Website. Nutzt bestehende `embeddings.ts` + `knowledge-db.ts`. Gibt ranked Results
mit Slug, Section, Similarity zurück.

**Konsumenten:**
- `plan-context.sh --semantic <query>` — ergänzt grep, Fallback auf grep-only wenn API nicht erreichbar
- MCP-Tool `openspec_find_similar(query, limit?, status?)` im OpenSpec-MCP-Server

**Backfill:** `task openspec:embed:backfill` indexiert alle aktiven Changes
(status=`planning`|`plan_staged`) beim initialen Deploy.

## Acceptance Criteria

1. `openspec:apply <slug>` → Chunks in `knowledge.chunks` vorhanden (BATS-Test)
2. `openspec:archive <slug>` → Chunks aktualisiert (idempotent, gleiche Anzahl)
3. `GET /api/openspec/search?q=pgvector` → liefert diesen Change als Top-1
4. `plan-context.sh --semantic "embedding indexing"` → gibt semantisch ähnliche Changes aus
5. MCP-Tool `openspec_find_similar` registriert und aufrufbar
6. `openspec-embed.mjs --dry-run` schreibt keine DB-Rows
7. GPU-Host down → Script beendet mit Exit 0, `openspec.sh` läuft weiter

_Ticket: T001008_
