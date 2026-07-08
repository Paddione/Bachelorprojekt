---
title: "brain-llm-wiki — Epic Proposal"
date: 2026-07-03
status: planning
ticket_id: T001566
tags: [brain, wiki, llm, infrastructure]
---

# Proposal: brain-llm-wiki

## Why

Dokumentation und Wissen von Patrick + Gekko sind über docs/, openspec/specs/,
Auto-Memory und Köpfe verstreut — nichts ist gegenseitig referenziert,
LLM-Sessions erarbeiten dasselbe Wissen wiederholt neu.

Ein gemeinsames LLM-Wiki nach Karpathys Pattern schafft:
- **Für LLMs**: Einheitliche, referenzierbare Wissensbasis — reduziert
  Halluzination und Wiederholung in Sessions.
- **Für Menschen**: Lesbare Quartz-Website + Obsidian-kompatibles Wiki.
- **Für beide**: Cross-Referenzen via Wikilinks, Versionierung via Git.

## What

Ein privates GitHub-Repo `Paddione/brain` mit Karpathy-Struktur:
- `wiki/` — kuratierte Notizen (human + LLM)
- `raw/` — automatisierte Ingests aus Bachelorprojekt
- `SCHEMA.md` — Verfassung
- `index.md` + `log.md` — Navigation + Changelog
- Quartz-Kompilierung → statische Website → k3s-Deployment

## Scope (Changes)

### Abgeschlossen / In Arbeit

1. **brain-foundation** (T001568) — Repo, SCHEMA, Linter, CI, Bootstrap
2. **brain-quartz-deploy** (T001569) — Quartz-Website + k3s-Deployment
3. **brain-initial-ingest** (T001570) — Erste Worklist-Ingestion

### Sprint 2 (dieser Plan)

4. **brain-merge-hook** — Automatischer Re-Ingest bei Merge auf main
   - GitHub Action im Bachelorprojekt-Repo
   - Nur geänderte Dateien re-ingesten
   - Commit + Push ins brain-Repo

5. **brain-mcp** — MCP-Server für Query-Zugriff aufs Brain
   - Werkzeug: brain-search (Wikilink/Semantic-Suche)
   - Ressource: brain://wiki/<slug>
   - Deployment als Sidecar im brain-Pod

6. **brain-gekko-inbox** — Gekko-Content-Kanal
   - Webformular oder E-Mail-Inbox → neue wiki-Seite
   - Vorlage mit Frontmatter-Guide
   - Review/Edit via PR

### Follow-up (T001567)

7. **brain-auto-memory** — Auto-Memory-Brücke
8. **brain-nightly-lint** — Nightly-Agent für Integration/Orphan-Check
9. **Weitere Ideen aus Grilling**

## Non-Goals

- Kein Obsidian-Sync (nur kompatibel)
- Keine Public-Contributions (private Repo + Collaborator)
- Kein Echtzeit-Editing (Git-basiert)

## Ticket

Parent: T001566 (dieses Epic)
