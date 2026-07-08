---
title: "brain-llm-wiki — Architecture & Design"
date: 2026-07-03
status: draft
ticket_id: T001566
plan_ref: feature/t001566-brain-llm-wiki
tags: [brain, wiki, llm, knowledge]
---

# brain-llm-wiki — Architecture & Design

## Intent

Gemeinsames LLM-gepflegtes Wissens-Repo nach Karpathys LLM-Wiki-Pattern für
Patrick + Gekko. Alle Specs, Runbooks, ADRs und Operating-Knowledge sind
für LLM-Sessions (Claude Code, opencode) und Menschen gleichermaßen
zugänglich — als Obsidian-artiges Wiki (raw/) und als öffentliche Quartz-Website.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 Paddione/brain (GitHub)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │  wiki/   │  │   raw/   │  │  SCHEMA  │  │ scripts │ │
│  │ (notes)  │  │(ingested)│  │   .md    │  │  (lint) │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
│        │              │                                    │
│        ▼              ▼                                    │
│  ┌─────────────────────────────────────┐                  │
│  │      Quartz Compiler (GitHub CI)     │                  │
│  │  wiki/ + raw/ → static HTML          │                  │
│  └──────────────┬──────────────────────┘                  │
└─────────────────┼────────────────────────────────────────┘
                  │ docker push ghcr.io/paddione/brain-site
                  ▼
┌─────────────────────────────────────┐
│     k3s Cluster (workspace ns)       │
│  ┌──────────┐  ┌──────────────────┐ │
│  │  brain   │  │ brain.mentolder   │ │
│  │ (nginx)  │  │  .de (Ingress)    │ │
│  └──────────┘  └──────────────────┘ │
└─────────────────────────────────────┘
```

## Data Flow

1. **Ingest-Pipeline**: Markdown aus openspec/specs/, docs/runbooks, CLAUDE.md etc.
   wird via `brain-ingest-worklist.sh` → `brain-worklist.txt` → Brain Repo `raw/` geschrieben.
2. **Quartz-Kompilierung**: GitHub Action (brain-Repo) kompiliert `wiki/` + `raw/`
   zu statischem HTML → docker image → ghcr.io/paddione/brain-site:latest.
3. **Deploy**: Cluster zieht neues Image → brain Deployment wird aktualisiert.
4. **Merge-Hook**: Bei jedem Merge auf main (Bachelorprojekt) → automatischer
   Re-Ingest der geänderten Specs/Dokumente.

## Content Model

### Wiki-Seiten (wiki/)

Manuell gepflegte Notizen mit Frontmatter:
```yaml
---
type: note|moc|entity|decision|runbook
tags: [keyword, ...]
status: draft|active|archived
source:: <origin-url> (type)
---
```

### Rohmaterial (raw/)

Automatisch aus Bachelorprojekt ingested:
- `raw/openspec/specs/*.md` — SSOT-Spezifikationen
- `raw/docs/runbooks/*.md` — Runbooks
- `raw/docs/adr/*.md` — Architecture Decision Records
- `raw/core/*.md` — CLAUDE.md, AGENTS.md

### Wikilinks

`[[slug]]`-Syntax für Cross-Referenzen. Beide Linter (frontmatter + wikilinks)
laufen in CI (brain-Repo).

## Components / Changes

| # | Change | Ticket | Status |
|---|--------|--------|--------|
| 1 | brain-foundation: Repo, SCHEMA, Linter, CI, Bootstrap | T001568 | ✅ in_progress |
| 2 | brain-quartz-deploy: Quartz-Kompilierung + k3s-Deploy | T001569 | ✅ main |
| 3 | brain-initial-ingest: Erste Worklist-Ingestion | T001570 | ✅ main |
| 4 | brain-merge-hook: Auto-Ingest bei Merge auf main | — | 🔲 |
| 5 | brain-mcp: MCP-Server für Brain-Query | — | 🔲 |
| 6 | brain-gekko-inbox: Gekko-Content-Kanal | — | 🔲 |
| 7 | brain-auto-memory: Auto-Memory-Brücke | — | 🔲 |
| 8 | brain-nightly-lint: Nightly-Lint-Agent | — | 🔲 |
| 9 | brain-ideas: Weitere Ideen aus Grilling | T001567 | 🔲 triage |

## Decisions

**D1** SSOT-Regel „kompilieren, nicht verschieben": Quellen bleiben im Bachelorprojekt-Repo.
**D2** Sprache: DE-Prosa, EN-Fachbegriffe.
**D3** Frontmatter-Pflichtfelder: type, tags, status.
**D4** brain-Repo ist SSOT für seinen Inhalt (Templates sind Einmal-Seeder).
**D5** Quartz-Deployment via GitHub Container Registry (ghcr.io).
**D6** CI-Gate: immer beide Linter + Secret-Scan.
**D7** Keine Secrets, keine Personendaten Dritter im Wiki.
