# Proposal: openspec-orphan-auto-dispatch

## Why

Der OpenSpec-Orphan-Executor (Skript, CI-Workflow, Test, #5849) existiert, läuft
aber nur mit manuell übergebenen Slugs. Die automatische Erkennung plus Dispatch
(p2 aus T900338) wurde nie gebaut, und ihr geplantes Substrat (lokaler
Factory-Poller mit DB-Zugriff) ist mit der Factory-Stilllegung (#5933)
gelöscht. Das Symptom ist seither viermal aufgetreten: gemergte Changes
(factory-decommission, brain-eval-baseline, autodocs-removal, mcp-hygiene)
lagen tagelang unarchiviert herum, bis Sessions sie von Hand archivierten.

_Ticket: T900503_

## What Changes

1. **Detection-Skript (p1):** Neues `scripts/openspec-orphan-detect.sh`, das
   verwaiste Changes ohne DB-Zugriff erkennt: Change-Verzeichnis auf `main`
   plus `.ticket`-Datei plus gemergter PR mit `[Tid]` im Titel (CI-erzwungene
   Konvention) plus Mindestalter plus kein offener PR mit dem Slug im Titel.
   Optionen `--dry-run`, `--min-age-hours` (Default 24), Ausgabe ein Slug pro
   Zeile, jeder Skip mit Grund auf stderr.
2. **Scheduled Dispatch (p1):** `.github/workflows/openspec-orphan-archive.yml`
   bekommt einen `schedule`-Trigger (nächtlich) plus Detect-Job: Erkennung
   laufen lassen, bei Treffern den bestehenden Executor-Job mit den Slugs
   füttern. Der manuelle `workflow_dispatch`-Pfad bleibt unverändert nutzbar.
3. **Tests (p-tests):** Neue `tests/spec/openspec-workflow/orphan-detect.bats`
   mit gestubbtem `gh` (Fixture-Antworten): Treffer-, Skip- und
   Dry-Run-Fälle; der RED-Nachweis läuft gegen das noch fehlende Skript.

## Non-Goals

- Kein neuer lokaler Poller, Timer oder Daemon (Factory-Muster bleibt tot).
- Keine Änderung am Executor (`openspec-orphan-archive.sh`), seinem Test oder
  dem manuellen Dispatch-Pfad.
- Kein DB-Zugriff aus CI (ADR-006 bleibt bestehen); das Merged-Signal kommt
  aus der GitHub-API.
- Die Archivierung des alten Changes `openspec-orphan-auto-archive`
  (T900338, mit Trim des nie umgesetzten Poller-Deltas) läuft separat.

## Impact

- **CI:** Ein nächtlicher Workflow-Run; bei Treffern ein Archiv-PR wie bisher
  (menschlich reviewt, Auto-Merge nur bei grün).
- **Agents:** Keine Toolset-Änderung; Sessions müssen verwaiste Changes nicht
  mehr von Hand entdecken.
- **Docs:** Keine Registry-Derivate betroffen (keine Registry-Änderung).
