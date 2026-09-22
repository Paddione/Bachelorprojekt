# Change: Cockpit UI Fixes

**Ticket:** T900303
**Date:** 2026-09-22

## Problem

Das Bewerbungs-Cockpit hat drei Bugs:

1. `rejected`-Jobs verschwinden von der Kanban-Board (nur 5/7 Status angezeigt)
2. `raw_text` und `requirements` werden im Detailpanel nicht gerendert (dead code, Daten werden bereits geholt)
3. Auto-Render-Pfad in `[id]/index.ts:58` bricht in Deployment-Umgebungen (`process.cwd().split('components')[0]`)

## Lösung

| # | Fix | Datei | Aufwand |
|---|-----|-------|---------|
| 1 | `rejected` zu `STATUSES[]` in `list.ts` + CSS border-color für rejected-Kolonne | `list.ts`, `applications.css` | 2 min |
| 2 | `raw_text`/`requirements` Sektionen in `showDetailPanel()` nach dem Header | `applications.ts` | 5 min |
| 3 | Env-var `APP_PIPELINE_SCRIPT_DIR` mit Pfad-Fallback, kein `split('components')` mehr | `[id]/index.ts` | 3 min |

**Insgesamt:** drei unabhängige, isolierte Changes an drei Dateien, < 30 LOC.

## Risiko

- **Fix 1**: Keine Regression — ein weiterer Status, mehr Daten, kein Verhalten geändert
- **Fix 2**: Nur UI-Addition — zwei neue Abschnitte im Detailpanel, keine bestehenden Änderungen
- **Fix 3**: Env-var ist optional, Fallback berechnet relativen Pfad. Keine Breaking Change

## Tests

- `tests/spec/application-pipeline/` — BATS tests untouched (nur Website-Änderungen)
- `components/website/src/pages/api/internal/applications/list.test.ts` — existing tests still pass (added `rejected` to bucket mapping)
- `components/website/src/pages/api/internal/applications/[id]/index.test.ts` — existing tests still pass (auto-render path, env var is optional)
