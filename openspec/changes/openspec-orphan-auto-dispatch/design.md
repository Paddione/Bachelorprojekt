---
ticket_id: T900503
plan_ref: openspec/changes/openspec-orphan-auto-dispatch/tasks.md
status: active
date: 2026-09-26
---

# Design: openspec-orphan-auto-dispatch

## Ausgangslage

T900338 (#5849) lieferte Executor + Workflow + Test; p2 (Poller-Dispatch mit
DB-Done-Check) blieb ungebaut, sein Substrat ist gelöscht. Der Workflow läuft
nur manuell. Vier Changes mussten seitdem manuell archiviert werden.

## Entscheidungen (Brainstorming-Protokoll, verdichtet)

### D1 — Detection per Merged-PR-Signal statt Ticket-Status

Der alte Plan las `done` aus der Ticket-DB (lokal, da CI laut ADR-006 keine
DB sieht). Factory-frei heißt CI-seitig; dort ist die DB unerreichbar. Ersatz:
gemergter PR mit `[Tid]` im Titel, gefunden per GitHub-API. Die
Ticket-Tag-Konvention ist CI-erzwungen (PR-Gate „Conventional Commits und
Ticket-Tag"), das Signal ist daher so verlässlich wie der DB-Status für
diesen Zweck. Gesucht wird exakt: `--state merged` plus Titelmatch auf
`[Tid]` (Quoting am echten `gh` verifizieren, Klammern sind suchsyntax-
sensibel).

### D2 — Kein neuer Daemon: Scheduled Workflow

Die Erkennung läuft als nächtlicher Cron-Job im bestehenden Workflow-File
(nicht als neues File, nicht als lokaler Timer). Grace 24h statt 2h: Ohne
Mensch in der Schleife gilt lieber ein Change einen Tag länger als offen,
als ein WIP fälschlich zu archivieren. Der Executor bleibt fail-closed
(Delta-Merge, Guards) und produziert einen reviewten PR — kein Direkt-Push.

### D3 — Skript statt Inline-YAML

Die Erkennungslogik liegt in `scripts/openspec-orphan-detect.sh` (nicht inline
im Workflow), damit sie per BATS mit gestubbtem `gh` testbar ist (Muster:
Stub-Argv wie in `hermes-mcp-access.bats`). Der Workflow ruft nur auf und
reicht Slugs weiter. S4-Orphan-Regel: Erreichbarkeit über CI-Referenz ist
erfüllt.

### D4 — Manueller Pfad unangetastet

`workflow_dispatch` mit `inputs.slugs` behält Vorrang: Sind Slugs übergeben,
läuft der Executor direkt; sonst bestimmt die Detection. Kein Flag-Wirrwarr,
kein Bruch bestehender Nutzung.

## Risiken

- **Titelmatch-Fehlschüsse:** PR-Titel mit `[Tid]` ohne Fix-Bezug (selten;
  Konvention bindet Tag an Inhalt). Mitigiert durch Mindestalter, No-Open-PR-
  Check und reviewten Archiv-PR.
- **gh-Suchsyntax:** Klammer-Quoting muss am echten CLI verifiziert werden
  (Decide-implement-Verify im Partial, kein Raten).
- **Falsch-Positive bei Reverts:** Ein revertierter Fix hinterlässt einen
  gemergten PR — der Change würde archiviert, obwohl der Code zurückgerollt
  ist. Akzeptiert: Archivierung ist dokumentarisch (Delta bleibt im Archiv
  lesbar), kein Code-Verlust; dokumentiert im Partial als bekannte Grenze.

## Dateigruppen je Partial (disjunkt)

- p1: `scripts/openspec-orphan-detect.sh` (neu),
  `.github/workflows/openspec-orphan-archive.yml` (Schedule + Detect-Job).
- p-tests: `tests/spec/openspec-workflow/orphan-detect.bats` (neu).
