# K4: Brain-Wiki (externes Repo Paddione/brain)

> Komponente des Brain-Architektur-Epics T002430.
> Stand: 2026-08-02 (Erhebung live gegen `Paddione/brain` via `gh api`).

## Diagramm

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         BACHELORPROJEKT (dieses Repo)                     │
│                                                                            │
│  scripts/brain/ingest-sources.yaml — Manifest, 8 Quellgruppen             │
│  ssot-specs · runbooks · adr · gotchas-footguns · agent-guide-maps ·      │
│  core-docs · health-goals · diagrams                                     │
│                                                                            │
│         ┌──────────────────────────┬──────────────────────────┐          │
│         │ PFAD A: CI (automatisch) │ PFAD B: manuell (LLM)    │          │
│         ▼                          ▼                          │          │
│  .github/workflows/         scripts/brain-ingest.sh            │          │
│  brain-merge-hook.yml       --brain-repo <path> [--pilot N]    │          │
│  Trigger: push main,        LM_STUDIO_URL (llama-server)       │          │
│  Pfade: openspec/specs/**,  LM_MODEL=qwen3.6-14b-a3b-           │          │
│  docs/runbooks/**,          fablevibes                         │          │
│  docs/adr/**,                                                  │          │
│  .claude/lib/goals.md,      Transformiert Quelldateien →       │          │
│  docs/diagrams/**,          gelintete Wiki-Seiten (Frontmatter │          │
│  docs/db-schema-diagram.md  type/tags/status, [[Wikilinks]])   │          │
│  → scripts/brain-merge-      + index.md + MOC-Seiten            │          │
│    hook.sh (reine Kopie,                                       │          │
│    KEIN LLM)                                                   │          │
│         │                          │                            │
│         ▼                          ▼                            │
└─────────┼──────────────────────────┼────────────────────────────┘
          │                          │
          ▼                          ▼
   ┌─────────────────┐      ┌─────────────────────┐
   │ Paddione/brain   │      │ Paddione/brain       │
   │ raw/<group>/     │      │ wiki/*.md            │
   │ (Rohkopie,       │      │ (LLM-transformiert,  │
   │  5 von 8 Gruppen)│      │  262 Seiten)          │
   │ Stand: laufend,  │      │ Stand: 2026-07-19     │
   │ zuletzt 2026-08-02│     │ (14 Tage veraltet)    │
   │ 16:08 UTC         │      │                       │
   └─────────────────┘      └─────────────────────┘
                                       ▲
                                       │ per PR ausgeliefert
                              PR #2 "Initial ingest from
                              Bachelorprojekt" — CLOSED,
                              nie gemerged (mergedAt: null)
```

## Zwei getrennte Pfade — kein einheitlicher Ingest

Erhebung des Repo-Codes zeigt **zwei unabhängige Mechanismen**, keinen einzigen:

1. **CI-Pfad (`brain-merge-hook.yml`)** — läuft automatisch bei jedem Push nach `main`, der einen der 5 in den `paths:`-Filtern gelisteten Bereiche berührt. Ruft `scripts/brain-merge-hook.sh` auf, das Dateien **unverändert kopiert** (`cp`, kein LLM, kein Frontmatter, kein Wikilinking) nach `brain/raw/<group>/`. Läuft sehr häufig — Commit-Historie von `Paddione/brain` zeigt mehrfach tägliche `chore: auto-ingest from Bachelorprojekt [skip ci]`-Commits, letzter am 2026-08-02T16:08:58Z.
2. **Manueller LLM-Pfad (`scripts/brain-ingest.sh`)** — verarbeitet das volle Manifest (8 Gruppen) über einen lokalen llama-server (`LM_STUDIO_URL`, Default `:8093`, Modell `qwen3.6-14b-a3b-fablevibes`) zu gelinteten `wiki/*.md`-Seiten samt `index.md` und MOC-Hubs. Wird **nicht** von CI ausgelöst — nur manuell/lokal.

Der Ticket-Auftrag benennt explizit Defekt D3: *"Brain-Ingest läuft nur als .github-Pilot; der volle kuratierte Ingest steht seit PR #2851 offen."* Das ist live bestätigt: PR #2851 (dieses Repo, gemerged 2026-07-15) lieferte laut PR-Body eine "reale Pilot-PR" gegen `Paddione/brain` aus — verifiziert als `Paddione/brain#2` ("chore(ingest): Initial ingest from Bachelorprojekt"), **`state: CLOSED`, `mergedAt: null`**. Diese PR wurde nie gemerged.

## Quellgruppen-Erhebung (REQ-k4-02)

Erhoben per `gh api repos/Paddione/brain/contents/...` gegen den Default-Branch (nicht abgeleitet, sondern gemessen).

| Gruppe | Quelle (Manifest) | Aktuelle Dateizahl (dieses Repo) | `raw/` (CI-Pfad) | `wiki/`-Seiten (LLM-Pfad) | Wiki-Stand |
|---|---|---|---|---|---|
| ssot-specs | `openspec/specs/*.md` | 74 | 87 Dateien (inkl. Nicht-Top-Level) | 67 Seiten (`openspec-specs-*`) | veraltet — 7 aktuelle Specs fehlen |
| runbooks | `docs/runbooks/*.md` | 3 | 4 Dateien | 3 Seiten | vollständig |
| adr | `docs/adr/*.md` | 5 | 6 Dateien | 5 Seiten | vollständig |
| gotchas-footguns | `docs/superpowers/references/gotchas-footguns.md` | 1 | **kein CI-Trigger für diesen Pfad** | 1 Seite | nur aus initialem Ingest, seither nicht mehr aktualisiert |
| agent-guide-maps | `docs/agent-guide/*.md` | 5 | **kein CI-Trigger für diesen Pfad** | 14 Seiten (inkl. `maps/`, `registry/`-Unterpfade) | nur aus initialem Ingest — Wiki enthält mehr als der aktuelle Top-Level-Glob erfasst; unklar, ob das Manifest damals weiter war oder der Worklist-Bug (PR #2851) rekursiv gescannt hat |
| core-docs | `CLAUDE.md AGENTS.md` | 2 | **kein CI-Trigger für diesen Pfad** | 2 Seiten (`claude.md`, `agents.md`) | nur aus initialem Ingest, seither nicht mehr aktualisiert |
| health-goals | `.claude/lib/goals.md` | 1 | 1 Datei | 1 Seite | vollständig |
| diagrams | `docs/diagrams/*.md docs/db-schema-diagram.md` | 3 | 3 Dateien | **1 Seite** (`docs-diagrams-architecture.md`) | unvollständig — `k1-vector-db.md` und `db-schema-diagram.md` fehlen im Wiki |

**Kernbefund:** Von 8 Quellgruppen laufen nur 5 über den automatisierten CI-Pfad (`raw/`, unkuratiert). Die 3 restlichen (`gotchas-footguns`, `agent-guide-maps`, `core-docs`) haben **keinen** `paths:`-Trigger in `brain-merge-hook.yml` und werden seit dem letzten manuellen Lauf gar nicht mehr aktualisiert — weder als Rohkopie noch als kuratierte Wiki-Seite. Das kuratierte `wiki/` selbst (der eigentliche "Brain") ist über alle Gruppen hinweg **14 Tage** hinter dem letzten inhaltlichen Commit zurück (`wiki/index.md` zuletzt 2026-07-19, aktuelles Datum 2026-08-02) und enthält veraltete Fakten — z. B. verweist `wiki/claude.md` noch auf lokale Agentennamen (`qwen35-iq4` etc.) und `wiki/index.md` referenziert `LiveKit`, das laut `CLAUDE.md` seit T002184 entfernt ist.

## Lesepfad-Integration (REQ-k4-03)

Repo-weite Suche (`grep -rl "Paddione/brain"`) findet **keinen Code-Pfad**, der zur Laufzeit aus `Paddione/brain` liest — keinen MCP-Server, kein Skript, keinen Agenten-Trigger, der die Wiki-Inhalte für Antworten konsultiert. Die einzigen Treffer sind:

- `scripts/brain-ingest.sh`, `scripts/brain-bootstrap.sh` — schreibende Werkzeuge
- `.github/workflows/brain-merge-hook.yml` — schreibender CI-Job
- `.claude/skills/brain-ingest/SKILL.md` — beschreibt das Schreiben, nicht das Lesen
- diverse `docs/superpowers/specs/*brain*` Design-Dokumente und die SSOT-Spec `openspec/specs/brain-foundation.md` — dokumentieren die Ingest-Seite, keinen Lesepfad

**Befund:** K4 ist eine **dritte, unverbundene Wissensinsel**. Anders als K1 (Vektorsuche, `embeddings.ts`/`bge-router.ts`, aktiv konsumiert von `scripts/knowledge/search-similar.mjs` u. a.) und K3 (Code-Graph, `codebase-memory-mcp`, in `AGENTS.md` als Prioritätsregel verankert) hat K4 keinen bekannten programmatischen Konsumenten. Es existiert ein GitHub-Repo, das man manuell im Browser öffnen kann — kein Agent liest es automatisiert. Damit läuft der K4-Informationsfluss (Quelle → Ingest → `Paddione/brain`) **ins Nichts** im Sinne des Epic-Ziels (T002430: "Flüsse, die heute INS NICHTS laufen … sollen sichtbar werden").

## Defekt-Referenz (T002430)

| Defekt | Betrifft K4? | Status (live erhoben) |
|---|---|---|
| D3: Brain-Ingest läuft nur als .github-Pilot; voller kuratierter Ingest seit PR #2851 offen | ✅ **Kern-Defekt dieser Komponente** | Bestätigt — `Paddione/brain#2` CLOSED, nie gemerged; nur 5/8 Gruppen laufen automatisiert (roh, unkuratiert); kuratiertes `wiki/` 14 Tage veraltet |
| D8: K1 und K3 halten beide Code-Wissen ohne gemeinsamen Speicher/Index | teilweise verwandt | K4 verschärft das Muster: eine **dritte** unverbundene Wahrheit ohne Lesepfad zu K1 oder K3 |

## Ist/Soll-Abgrenzung

| Aspekt | IST | SOLL (aus Ticket-Auftrag abgeleitet) |
|---|---|---|
| Ingest-Automatisierung | Zwei getrennte, nicht koordinierte Pfade (CI-Rohkopie für 5/8 Gruppen, manueller LLM-Lauf für alle 8) | Ein Pfad, der alle 8 Gruppen automatisiert und kuratiert aktuell hält |
| Vollständiger kuratierter Ingest | Pilot-PR `Paddione/brain#2` seit 2026-07-15 offen, nie gemerged | PR gemerged oder Merge-Blocker (falls vorhanden) dokumentiert |
| Aktualität `wiki/` | 14 Tage veraltet, enthält faktisch überholte Aussagen (LiveKit, alte Agentennamen) | Regelmäßiger Re-Ingest, idealerweise an denselben Trigger wie `raw/` gekoppelt |
| Lesepfad | Kein bekannter Konsument — Wissensinsel | Mindestens eine dokumentierte Konsumentenstelle (Agent, Skill, oder bewusste Entscheidung "nur menschliche Referenz") |

## Änderungshistorie

| Datum | Ticket | Änderung |
|---|---|---|
| 2026-07-03 | T001568 | Seed des Karpathy-Wiki-Fundaments in `Paddione/brain` |
| 2026-07-15 | T001608 (PR #2851) | Worklist-Scoping-Fix + Parallelisierung; Pilot-PR `Paddione/brain#2` ausgeliefert (nicht gemerged) |
| 2026-07-19 | — | Letzter inhaltlicher `wiki/`-Commit (Homepage-Kuration, keine neuen Quelldaten) |
| 2026-08-02 | T002434 | Dieses Dokument: Ingest-Pipeline-Diagramm, Quellgruppen-Erhebung, Lesepfad-Analyse |
