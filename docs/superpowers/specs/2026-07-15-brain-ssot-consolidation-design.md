---
ticket_id: T001884
plan_ref: openspec/changes/brain-ssot-consolidation/tasks.md
status: active
date: 2026-07-15
---

# brain-ssot-consolidation — Design

**Datum:** 2026-07-15 · **Modus:** autonome Goal-Session · **Board:** `.lavish/brain-ssot-consolidation-brainstorm.html`

## Kontext & Problem

Das Brain (`Paddione/brain`, Quartz-Wiki, Prinzip „compile, do not move" aus
`openspec/specs/brain-foundation.md`) soll die kuratierte Single Source of Truth für
Repo-Wissen sein. Sprint 1 (brain-llm-wiki-Epic, PR #2847/#2848/#2851) hat Seed,
LLM-Ingest-Pipeline und kuratiertes Manifest geliefert — aber vier Explorer-Audits
(2026-07-15) zeigen, dass die SSOT-Ambition strukturell nicht erreicht wird:

1. **Manifest-Drift (kritisch):** `scripts/brain/ingest-sources.yaml` listet in der
   Gruppe `ssot-specs` 24 statische Pfade, von denen nur 5 existieren.
   `openspec/specs/` enthält real 63+ Specs — über 90 % des SSOT-Bestands erreichen
   das Brain nie. `brain-ingest-worklist.sh` überspringt tote Manifest-Einträge
   **stillschweigend**.
2. **Diagramm-Wildwuchs:** Drei konkurrierende Architektur-Diagramme (handgepflegtes
   README-Mermaid, handgepflegtes `docs/legacy-html/architecture.html`, verwaistes
   `scripts/build-graph-docs.mjs`-HTML, das von keinem Flow aufgerufen und von jedem
   `docs:build` weggewischt würde). Zwei DB-Schema-Generatoren. Zwei
   Mermaid-Render-Strategien (serverseitig `mmdc`-Snapshots vs. clientseitig CDN).
   Kein einziges Diagramm ist im Brain-Scope; der LLM-Transform-Prompt hat keine
   Regel zum Erhalt von Mermaid-Blöcken.
3. **Health-Goals doppelt entkoppelt:** SSOT ist `.claude/lib/goals.md` (+ Messung
   `scripts/health-goals-check.sh`), aber die Website (Homepage `#health` +
   `/admin/repohealth`) rendert aus `website/src/lib/goals-data.ts` — einer
   handgepflegten Konstante ohne Generator, ohne Freshness-Gate, mit
   Quellpfad-Drift (`.agents/lib/goals.md`). Das Brain kennt Health-Goals gar nicht
   (der Manifest-Eintrag `openspec/specs/health-goals.md` ist eine tote Altlast).
4. **Automatik-Lücken:** `.github/workflows/brain-merge-hook.yml` deklariert
   `docs/adr/**` als Trigger, verarbeitet ADRs im Body aber nicht.
   `scripts/migrate-docs-style.mjs` ist tot (Zielmarkup existiert nicht mehr);
   `docs/agent-guide/maps/` enthält 3 verwaiste `.tmp`-Artefakte.
5. **Doku-Drift:** `.claude/skills/brain-ingest/SKILL.md` beschreibt einen nie
   gebauten Quartz-CLI-Workflow („57 Specs"); die SSOT-Spec `brain-foundation.md`
   kodifiziert nur das Seed-Skelett, nicht Ingest/Manifest/Coverage.

## Ziel

Alle Docs- und Diagramm-Generierungsquellen so konsolidieren, dass das Brain sie
vollständig und dauerhaft (drift-erkennend) kompilieren kann; Health-Goals und
OpenSpec-Specs werden aus je genau einer Quelle in alle Konsumenten (Brain, Website,
Docs-Site) abgeleitet.

## Entscheidungen (WARUM + WAS)

### E1 — Manifest wird glob-basiert statt statisch

`ssot-specs:` wird zu `openspec/specs/*.md` (das bestehende
`openspec/specs/archive/`-Exclude greift weiter). Neue Gruppen:

| Gruppe | Quelle | type | tags |
|---|---|---|---|
| `health-goals` | `.claude/lib/goals.md` | `decision` | `[health, goals]` |
| `diagrams` | `docs/diagrams/*.md` + `docs/db-schema-diagram.md` | `note` | `[diagram, architecture]` |

Der tote `health-goals.md`-Override und die 24er-Liste entfallen. **Warum:** Eine
statische Liste driftet zwangsläufig (bewiesen: 78 % tot nach wenigen Wochen);
Globs folgen dem Bestand. Die Kuratierung bleibt erhalten — sie liegt in der
Gruppenauswahl, nicht in Einzeldateien.

### E2 — Fail-loud Worklist + `.worktrees`-Prune

`scripts/brain-ingest-worklist.sh` warnt auf stderr, wenn eine Manifest-Gruppe
0 Dateien matcht (Drift-Detektor; Exit bleibt 0, damit Teilmengen-Ingests nicht
brechen). Zusätzlich wird `.worktrees` in die Prune-Liste aufgenommen, damit
Worktree-Kopien keine Duplikat-Slugs erzeugen. **Warum:** Der aktuelle stille
Skip hat die 78-%-Drift monatelang unsichtbar gemacht.

### E3 — Ein generiertes Architekturdiagramm, Brain- und Docs-Site-tauglich

`scripts/build-graph-docs.mjs` emittiert künftig `docs/diagrams/architecture.md`
(Mermaid-Markdown aus `docs/generated/graph.json` + `api-map.json`) statt eines
Standalone-HTML mit CDN-Mermaid. Das Artefakt ist deterministisch aus committeten
JSONs ableitbar und wird in `freshness:regenerate` + `freshness:check`-FILES
aufgenommen. **Warum:** (a) Der Docs-Site-Walker entdeckt `docs/**`-Markdown
automatisch und pre-rendert Mermaid via Snapshots — das verwaiste HTML-Target und
die zweite Render-Strategie entfallen ersatzlos; (b) die Brain-Gruppe `diagrams`
ingested dieselbe Datei; (c) Freshness-CI erkennt Diagramm-Staleness erstmals.
`docs/db-schema-diagram.md` bleibt am Ort (Live-DB-abhängig, nicht CI-fähig,
gepinnter docs-gen-Slug) und kommt nur zusätzlich in den Brain-Scope.

### E4 — Health-Goals-Generator nach dem openspec-status-Vorbild

Neues `scripts/gen-goals-data.mjs` parst `.claude/lib/goals.md` gegen dessen
dokumentierte Konventionen (H2-Zeile `## G-XXX — Titel …`, Meta-Zeile
`> **<Prio> · Baseline:** … · **Target:** … ·`, ```bash-Messblock) und emittiert
`website/src/lib/goals-data.generated.json` (Shape = bisherige `RAW_GOALS`).
`website/src/lib/goals-data.ts` behält Typen, `computeStatus` und `healthPercent`,
importiert die Rohdaten aber aus dem JSON — die ~245-Zeilen-Konstante entfällt
(S1-Gewinn). Neues Task-Target (`health:goals:emit`) wird Teil von
`freshness:regenerate`; das JSON kommt in die `freshness:check`-FILES.
Unparsbare Goals ⇒ harter Generator-Fehler (fail-loud). **Warum:**
`openspec-status.json` beweist das Muster „Definition → Generator →
freshness-gated Artefakt → UI"; Health-Goals bekommen exakt dieselbe Mechanik.
Eine YAML-Migration von goals.md wurde verworfen (bräche Editier-Konvention und
`health-goals-update.sh`).

### E5 — Mermaid-Preservation im LLM-Transform

`scripts/brain-ingest-transform.sh` erhält die Prompt-Regel, ```mermaid-Blöcke
verbatim zu übernehmen (Quartz rendert nativ). **Warum:** Ohne die Regel
destilliert das Modell Diagramme zu Prosa — Diagramm-Ingest wäre wirkungslos.

### E6 — Merge-Hook-Pfad-Parität

`.github/workflows/brain-merge-hook.yml`: fehlender ADR-Copy-Step wird ergänzt;
Trigger + Handler zusätzlich für `.claude/lib/goals.md`, `docs/diagrams/**` und
`docs/db-schema-diagram.md`. `scripts/brain-merge-hook.sh` akzeptiert weiterhin
SRC/DEST-Paare (Einzeldatei-Quelle wird unterstützt). **Warum:** Der Hook ist der
einzige automatische Brain-Pfad; deklarierte-aber-unverarbeitete Trigger sind ein
stiller Defekt.

### E7 — Spec-Kodifizierung + Doku-Sync

Delta zu `brain-foundation` (Purpose ergänzen; Requirements: Glob-Coverage,
fail-loud Drift-Warnung, Diagramm-Gruppe inkl. Mermaid-Erhalt,
Health-Goals-Gruppe, Hook-Pfad-Parität). Neue SSOT-Spec `health-goals`
(goals.md als SSOT, Generator, Freshness-Gate, Dashboard-Konsum) — beim Archive
via `--create-new`. `.claude/skills/brain-ingest/SKILL.md` wird auf die reale
Pipeline synchronisiert. Cleanup: `scripts/migrate-docs-style.mjs` (tot) und
`docs/agent-guide/maps/*.tmp` (Waisen) werden gelöscht.

## Nicht-Ziele (Follow-ups)

- Ablösung der Docs-Site (Pipeline `build-docs.mjs`) durch einen Brain-Export.
- Konsolidierung pgvector-Suche (`openspec-embed.mjs`/`knowledge.chunks`) mit Brain.
- Admin-Proposal-Read/Write-Runtime-Gap (`openspec/` fehlt im Website-Image).
- Merge der zwei DB-Schema-Generatoren (`db-schema-diagram.py` vs. `datamodel/`).
- Automatischer/geplanter LLM-Ingest (GPU-Host-gebunden, bleibt manuell).
- Toter Quellpfad `k3d/docs-content/*.md` in `openspec/specs/ci-cd.md`.

## Risiken

- **goals.md-Parsing:** Freitext-Anteile (Meta-Zeilen-Varianten wie `Baseline: 6 → 7 🔴`)
  brauchen tolerante, aber fail-loude Regex-Regeln; Absicherung über BATS-Fixtures
  aus dem realen goals.md.
- **Ingest-Volumen:** Glob-basierte ssot-specs heben die Worklist von 21 auf ~80
  Seiten — betrifft nur die manuelle Ingest-Laufzeit (parallelisiert, MAX_PARALLEL=6),
  keine CI.
- **Unkommittiertes WIP im Haupt-Checkout:** `scripts/brain-ingest-worklist.sh` trägt
  dort lokale, nicht committete Prune-Erweiterungen — dieser Change implementiert
  den `.worktrees`-Prune clean-room vom committeten Stand; das WIP wird dadurch
  teilweise superseded (im PR vermerken).
