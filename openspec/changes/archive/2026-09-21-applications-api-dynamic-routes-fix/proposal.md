# Proposal: applications-api-dynamic-routes-fix

## Why
Die Astro-Endpunkte für Job-Details, Status-Updates, Timeline und Dossiers unter `src/pages/api/internal/applications/` lasen `params.id`, lagen jedoch auf der Root-Ebene (`detail.ts`, `status.ts`, `timeline_list.ts`, `dossiers.ts`). Dadurch matchte Astro dynamische IDs nicht:
Aufrufe wie `/api/internal/applications/68/detail` lieferten HTTP 404 Not Found, und bei direktem Aufruf war `params.id` `undefined`.

## What
- Verschieben der Endpunkte in das dynamische Astro-Verzeichnis `src/pages/api/internal/applications/[id]/`:
  - `status.ts` -> `[id]/index.ts` (PUT `/api/internal/applications/:id`)
  - `detail.ts` -> `[id]/detail.ts` (GET `/api/internal/applications/:id/detail`)
  - `timeline_list.ts` -> `[id]/timeline.ts` (GET `/api/internal/applications/:id/timeline`)
  - `dossiers.ts` -> `[id]/dossiers.ts` (GET `/api/internal/applications/:id/dossiers`)
  - Analog die dazugehörigen Vitest-Dateien in `[id]/`.
- Beibehalten von `list.ts` (GET `/api/internal/applications/list`) und `timeline.ts` (POST `/api/internal/applications/timeline`) auf Root-Ebene.
- BATS-Test zur Verifikation der dynamischen API-Routen.

_Ticket: T900302_
