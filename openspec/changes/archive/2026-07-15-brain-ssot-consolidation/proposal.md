# Proposal: brain-ssot-consolidation

## Why

Das Brain (`Paddione/brain`, Quartz-Wiki) soll laut `openspec/specs/brain-foundation.md`
die kompilierte Single Source of Truth für Repo-Wissen sein („compile, do not move").
Vier Explorer-Audits (2026-07-15, nach Merge von PR #2851) zeigen, dass die Ambition
strukturell verfehlt wird:

1. **Manifest-Drift:** Die `ssot-specs`-Gruppe in `scripts/brain/ingest-sources.yaml`
   listet 24 statische Pfade — nur 5 existieren. Über 90 % der realen 63+ Specs unter
   `openspec/specs/` erreichen das Brain nie; `brain-ingest-worklist.sh` überspringt
   tote Einträge stillschweigend.
2. **Diagramm-Wildwuchs:** Drei konkurrierende Architektur-Diagramme (README-Mermaid,
   `docs/legacy-html/architecture.html`, verwaistes `scripts/build-graph-docs.mjs`-HTML),
   zwei Mermaid-Render-Strategien, kein Diagramm im Brain-Scope, keine
   Mermaid-Erhaltungsregel im LLM-Transform-Prompt.
3. **Health-Goals doppelt entkoppelt:** SSOT ist `.claude/lib/goals.md`, aber die
   Website rendert aus der handgepflegten Konstante `website/src/lib/goals-data.ts`
   (kein Generator, kein Freshness-Gate, Quellpfad-Drift). Das Brain kennt
   Health-Goals nicht.
4. **Automatik-Defekte:** `brain-merge-hook.yml` deklariert `docs/adr/**` als Trigger,
   verarbeitet ADRs aber nicht; `scripts/migrate-docs-style.mjs` ist tot;
   `docs/agent-guide/maps/` enthält verwaiste `.tmp`-Artefakte;
   `.claude/skills/brain-ingest/SKILL.md` beschreibt eine nie gebaute Pipeline.

## What

- **Manifest-Glob-Refresh:** `ssot-specs: openspec/specs/*.md` statt statischer Liste;
  neue Gruppen `health-goals` (`.claude/lib/goals.md`, type `decision`) und `diagrams`
  (`docs/diagrams/*.md` + `docs/db-schema-diagram.md`, type `note`).
- **Fail-loud Worklist:** stderr-Warnung bei Manifest-Gruppen mit 0 Treffern;
  `.worktrees`-Prune gegen Duplikat-Slugs.
- **Ein generiertes Architekturdiagramm:** `scripts/build-graph-docs.mjs` emittiert
  `docs/diagrams/architecture.md` (Mermaid-Markdown aus `docs/generated/graph.json` +
  `api-map.json`) statt Standalone-HTML; Aufnahme in `freshness:regenerate` +
  `freshness:check`-FILES. Docs-Site rendert automatisch, Brain ingested via Gruppe.
- **Health-Goals-Generator:** `scripts/gen-goals-data.mjs` parst `.claude/lib/goals.md`
  → `website/src/lib/goals-data.generated.json`; `goals-data.ts` behält Typen/Logik,
  verliert die RAW_GOALS-Konstante; Task `health:goals:emit`, freshness-gated.
- **Mermaid-Preservation:** Verbatim-Regel für ```mermaid-Blöcke im Transform-Prompt
  (`scripts/brain-ingest-transform.sh`).
- **Merge-Hook-Parität:** ADR-Copy-Step ergänzen; Trigger+Handler für
  `.claude/lib/goals.md`, `docs/diagrams/**`, `docs/db-schema-diagram.md`.
- **Spec-Kodifizierung:** Delta zu `brain-foundation` (Ingest-Coverage, Diagramme,
  Health-Goals, Hook-Parität, fail-loud) + neue SSOT-Spec `health-goals`
  (Archive via `--create-new`).
- **Cleanup + Doku-Sync:** `scripts/migrate-docs-style.mjs` löschen,
  `docs/agent-guide/maps/*.tmp` löschen, `brain-ingest`-SKILL.md auf reale Pipeline
  synchronisieren.

**Nicht-Ziele:** Docs-Site-Ablösung durch Brain-Export; pgvector↔Brain-Suchkonsolidierung;
Admin-Proposal-Runtime-Gap; DB-Schema-Generator-Merge; automatischer LLM-Ingest-Cron;
toter Pfad in `ci-cd.md`.

Design-Spec: `docs/superpowers/specs/2026-07-15-brain-ssot-consolidation-design.md`

_Ticket: T001884_
