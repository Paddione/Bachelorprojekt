---
title: "brain-initial-ingest — Architecture & Design"
date: 2026-07-15
status: active
ticket_id: T001861
tags: [brain, ingest, llm, pipeline]
---

# brain-initial-ingest — Architecture & Design

## Why

Das brain-Wiki (Paddione/brain) hat aktuell 8 manuell kuratierte Seiten. Das
Bachelorprojekt-Repo enthält ~190 relevantes Wissen (SSOT-Specs, Runbooks, ADRs,
Gotchas, Agent-Guides, Core-Docs), das im brain-Wiki nutzbar gemacht werden soll.

Die bestehende `brain-ingest-worklist.sh` generiert eine TAB-separated Liste der
Kandidaten, aber es fehlt die eigentliche Transformations- und Auslieferungspipeline.

## What

Ein Bash-Orchestrator (`scripts/brain-ingest.sh`) + LLM-Helper (`scripts/brain-ingest-transform.sh`),
der:
1. Alle Quelldateien aus dem Manifest liest
2. Jede Datei via LLM (Qwen3-14b auf LM Studio) in eine brain-kompatible Wiki-Seite transformiert
3. Sub-MOCs pro Gruppe generiert
4. Qualitäts-Gates (Frontmatter-Lint, Wikilink-Lint, Secret-Scan) durchführt
5. Ergebnis als PR ins brain-Repo liefert

## Architecture

```
scripts/brain-ingest.sh (orchestrator)
├── Phase 1: Preparation
│   ├── Read ingest-sources.yaml (groups + type_map + tag_defaults)
│   ├── Run brain-ingest-worklist.sh → source file list
│   ├── Clone/update brain repo checkout
│   ├── Compute full slug inventory (all target page names)
│   └── Load state file (skip already-processed pages)
│
├── Phase 2: LLM Transformation
│   ├── For each source file:
│   │   ├── Read source content
│   │   ├── Determine type (group default → path override)
│   │   ├── Generate LLM prompt with SCHEMA + slug inventory
│   │   ├── Call LM Studio API (qwen3-14b)
│   │   ├── Validate output (frontmatter structure)
│   │   ├── Write to brain repo wiki/<slug>.md
│   │   └── Update state file
│
├── Phase 2b: MOC Generation
│   ├── Generate sub-MOCs per group (type: moc)
│   ├── Regenerate index-moc.md with all sub-MOCs
│   └── Ensure max 2 MOC-hops from index.md (G-BRAIN08)
│
├── Phase 3: Quality Gates
│   ├── Run frontmatter linter
│   ├── Run wikilink linter
│   ├── Run gitleaks secret scan
│   └── Fix dead wikilinks (sed-based removal)
│
└── Phase 4: Delivery
    ├── Create branch in brain repo
    ├── Commit all pages (chore(ingest): convention)
    ├── Push branch
    └── Create PR via gh
```

## Data Flow

```
Bachelorprojekt Repo
├── openspec/specs/*.md ──────┐
├── docs/runbooks/*.md ───────┤
├── docs/architecture/*.md ───┤
├── docs/gotchas/*.md ────────┼──→ brain-ingest-worklist.sh
├── docs/agent-guide/*.md ────┤         │
├── CLAUDE.md ────────────────┤         ▼
└── AGENTS.md ────────────────┘   worklist.txt
                                       │
                                       ▼
                              brain-ingest.sh
                                       │
                         ┌─────────────┼─────────────┐
                         ▼             ▼             ▼
                    LM Studio    State File    Brain Repo
                    (qwen3-14b)  (idempotency)  wiki/*.md
                         │                         │
                         ▼                         ▼
                    Transformed              Quality Gates
                    Markdown                 (lint + scan)
                                                 │
                                                 ▼
                                            PR to GitHub
```

## LLM Prompt Template

```
Du bist ein technischer Dokumentations-Editor. Transformiere die folgende
Quelldatei in eine brain-Wiki-Seite.

## Konventionen (SCHEMA.md)
- Frontmatter: type (TYPE), tags (LISTE), status: active
- Sprache: Deutsch-Prosa, englische Fachbegriffe
- Wikilinks: [[slug]] Format zu verwandten Seiten
- source:: Rückverweis auf die Quelldatei
- Max. 2000 Wörter, keine Volltext-Kopie

## Tags
Generiere 2-5 relevante Tags. Grund-Tags: [DEFAULTS].

## Verfügbare Slugs (für Wikilinks)
[JSON array of all slugs]

## Quelldatei: SOURCE_PATH
---
[SOURCE_CONTENT]
---

Gib NUR das fertige Markdown aus.
```

## State File Schema

```json
{
  "openspec/specs/ci-cd.md": {
    "slug": "ci-cd",
    "type": "note",
    "hash": "abc123...",
    "transformed_at": "2026-07-15T12:00:00Z"
  }
}
```

## Type Mapping

| Group | Default Type | Overrides |
|-------|-------------|-----------|
| ssot-specs | note | security*.md → decision |
| runbooks | runbook | — |
| adr | decision | — |
| gotchas-footguns | note | — |
| agent-guide-maps | moc | surface-*.md → moc |
| core-docs | moc | CLAUDE.md → moc, AGENTS.md → moc |

## MOC Strategy

Mit ~190 Seiten erzeugen wir Sub-MOCs pro Gruppe:

```
index-moc.md (main hub)
├── ssot-specs-moc.md (~25 pages)
├── runbooks-moc.md (~5 pages)
├── adr-moc.md (~5 pages)
├── gotchas-moc.md (~5 pages)
├── agent-guide-maps-moc.md (~15 pages)
├── core-docs-moc.md (~5 pages)
└── [existing pages: usage, cheatsheet, first-aid, ...]
```

Dies gewährleistet max. 2 MOC-Hops von index.md (G-BRAIN08).

## Error Handling

| Error | Handling |
|-------|----------|
| LLM API failure | Skip page, log warning, continue |
| Invalid frontmatter | Skip page, log warning |
| Dead wikilinks | sed-based removal, re-lint |
| Secret detected | Abort, report |
| Large source file (>50KB) | LLM handles summarization |
| State file corrupt | Rebuild from scratch |

## Decisions

**D1** LLM-Backend: Lokal (LM Studio, Qwen3-14b) — kostenlos, datenschutzkonform.
**D2** Output: wiki/ (volle Qualitäts-Gates, kein raw/).
**D3** State-Tracking: JSON-Datei für Idempotenz.
**D4** Commit-Convention: `chore(ingest):` im brain-Repo.
**D5** Pilot: 20 Seiten zuerst, dann Full-Run.
**D6** Tags: LLM-generiert + Gruppen-Defaults.
