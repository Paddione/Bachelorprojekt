---
ticket_id: null
plan_ref: null
status: active
date: 2026-09-26
---

# Design: Brain-Eval-Baseline + Node-Parität (Change 1/6)

Epic T900447, Change-Ticket T900448, ADR-009. Erster Change des Epics:
vermisst die kuratierte Retrieval-Qualität als Baseline (Absicherung für den
Kuratierungs-Verzicht) und stellt den verdrahteten Node-MCP-Server auf volle
Parität mit dem Python-Original.

## Ziele

- Versioniertes Eval-Set als SSOT-Baseline: Recall@k, MRR, Stale-Rate gemessen,
  reproduzierbar, offline, ohne Threshold-Gate.
- `tests/fixtures/brain/retrieval-eval.jsonl` von 2 auf ~12 Cases ausgebaut und
  als versioniertes Set verdrahtet (bisher ohne Consumer).
- Node-MCP (`scripts/brain-mcp-node/`) auf volle Parität mit
  `scripts/brain-index.py` + `scripts/brain-mcp-server.py`: falscher
  Signatur-Call in `server.mjs`, Slug-Key- und Tags-Case-Divergenzen in
  `index.mjs` behoben, mit Parity-Tests belegt.
- ADR-009 final landet im Repo (bisher untracked auf main).

## Nicht-Ziele

- Kein Threshold-Gate (Baseline-only, Spec verlangt explizit keins).
- Kein neuer CI-Workflow: CI läuft über die BATS-Tests (deterministische
  Fixture), kein `~/brain`-Zugriff in CI.
- Keine K1/K3-Arbeit (Changes 2/6, 3/6), kein Wiki-Prune (4/6).
- Keine Node-Features jenseits der Python-Parität.

## Entscheidungen (Brainstorming 2026-09-26)

- D1: Volle Parität in 1/6 (statt Minimal-Fix): Crash-Call + Slug-Key +
  Tags-Case + Parity-Tests. Der Node-Server ist der verdrahtete Pfad
  (`.mcp.json` → `brain-mcp-node`).
- D2: Bestehendes Set erweitern: `tests/fixtures/brain/retrieval-eval.jsonl`
  wächst auf ~12 Cases — je mind. einer pro Wiki-Gruppe
  (runbooks/adr/specs/diagrams/core-docs), dazu `as_of`- und Stale-Fälle sowie
  ein Filter-Fall (`source_kind`, `tags`).
- D3: Baseline-Lauf gegen das echte Wiki (`~/brain/wiki`) wird einmalig
  ausgeführt und als JSON-Informationsartefakt abgelegt; CI misst nur die
  Fixture (deterministisch, offline).
- D4: BATS-Konvention Output-Verifikation (Exit-Code/Stdout/Artefakte), Muster
  `tests/spec/brain-k4-brain-wiki/retrieval-eval.bats`.

## Entwurf

### Eval-Set (`tests/fixtures/brain/retrieval-eval.jsonl`)

Bestehendes JSONL-Schema des Runners (kein Schema-File): `id`, `query`,
`relevant_slugs` (Pflicht), optional `top_k`, `filters` (Keys aus
`type/tags/status/source_kind/as_of`). Neue Cases referenzieren reale Slugs des
aktuellen Wikis; Stale-Fälle nutzen `as_of` außerhalb der Gültigkeit.
Version = git (keine Dateinamen-Suffixe).

### Baseline-Artefakt

Einmaliger Runner-Lauf `--wiki-dir ~/brain/wiki --eval-set <set> --format json`
wird als `tests/fixtures/brain/retrieval-baseline.json` committed
(Dokumentation des Startpunkts, kein Gate-Input).

### Node-Parität (`scripts/brain-mcp-node/`)

- `server.mjs`: Index-Call auf echte Signatur
  `search(query, topK, filters)` korrigieren (Crash-Verifizierung per Test).
- `index.mjs`: Slug-Key auf `path.stem`-Semantik, Tags-Match auf case-sensitiv
  (Python-Verhalten) angleichen; jede weitere Divergenz im Diff begründen oder
  fixen.
- Parity-Tests: gleiche Fixture, gleiche Queries → identische Slugs/Scores aus
  Python- und Node-Index (Toleranz nur bei dokumentiertem Float-Grund).

### BATS (`tests/spec/brain-k4-brain-wiki/`)

- `retrieval-eval.bats` erweitern: versioniertes Set laden statt nur Inline-Set,
  Byte-Identität zweier Läufe, Invalid-Input → Exit 2, kein Threshold-String.
- Neue Parity-Datei für Node-vs-Python (skip-Guard falls `node` fehlt).

### ADR-Landung

`docs/adr/ADR-009-brain-3layer-architektur.md` (Status Final) wird im
Change-Branch per `git add` aufgenommen; kein Index-Update nötig (kein
adr-Index im Repo).

## Target Files (Decompose-Hinweis)

- p1-evalset: `tests/fixtures/brain/retrieval-eval.jsonl`,
  `tests/fixtures/brain/retrieval-baseline.json` (neu),
  `docs/adr/ADR-009-brain-3layer-architektur.md`
- p2-nodeparity: `scripts/brain-mcp-node/index.mjs`,
  `scripts/brain-mcp-node/server.mjs`
- p3-tests: `tests/spec/brain-k4-brain-wiki/retrieval-eval.bats`,
  `tests/spec/brain-k4-brain-wiki/node-parity.bats` (neu)

## Risiken

- R1: Node-Crash ist Code-Lesart — Plan enthält Verifikations-Step ( DIG: läuft
  `brain_search` via Node heute auf Internal error?).
- R2: Wiki-Drift: Baseline-Slugs altern; Set referenziert Stand 2026-09-26,
  Drift wird sichtbar (nicht still) — Akzeptiert, kein Gegenmittel in 1/6.
- R3: S1-Budgets: alle Touch-Dateien unter Limit, kein Baseline-Eintrag
  (verifiziert) — Plan notiert trotzdem pro Datei Budget.
