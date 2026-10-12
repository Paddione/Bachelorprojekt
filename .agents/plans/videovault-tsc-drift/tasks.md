---
title: VideoVault type gate green after dependency drift
ticket_id: T901943
domains: [videovault]
status: staged
---
# videovault-tsc-drift — Implementation Plan

Revision: `ec0638e9a` (origin/main) · Worktree: `fix/videovault-tsc-drift`
· Spec: `.agents/plans/videovault-tsc-drift/design.md` · Ticket: T901943.

Ziel: build-videovault-Gate auf main wieder grün — 74 tsc-Fehler aus
Major-Drift (U1), drei gebrochene Player-Aliase (U2) und 16 per
JSX-Parse fehlschlagende vitest-Suiten (U3) beheben. Vorwärts-Migration
auf die installierten Majors, kein Pin-Back. Akzeptanz: tsc 0 Fehler,
pytest-Wrapper grün, test:client 48/48 Dateien grün, `npm run build`
erfolgreich.

## File Structure

Budgets per `plan-lint.sh residual_budget`; components/VideoVault liegt
außerhalb des S1-Scan-Universums (`gates.yaml` scan.code_roots), daher
ohne CI-Ratchet-Wirkung.

- `components/VideoVault/tsconfig.json` — Player-`paths` auf
  `../../packages/videovault-player` korrigieren.
- `components/VideoVault/vite.config.ts` — Ist 95, Budget 805:
  Player-Alias auf `../..` korrigieren.
- `components/VideoVault/vitest.config.ts` — Ist 178, Budget 722:
  Player-Alias korrigieren, `react()`-Plugin ergänzen.
- `components/VideoVault/client/src/components/ui/calendar.tsx` —
  Ist 68, Budget 532: day-picker-v10-classNames + `Chevron`.
- `components/VideoVault/client/src/components/filters/advanced-filters.tsx` —
  Ist 357, Budget 243: `initialFocus` → `autoFocus` (2 Stellen).
- `components/VideoVault/client/src/components/layout/main-content.tsx` —
  Ist 772, außerhalb S1-Scope (arithmetisches Restbudget negativ):
  FixedSizeList → `List` (Aliasing wegen lucide-`List`), Edit bleibt
  annähernd zeilenneutral, kein Split nötig.
- `components/VideoVault/client/src/components/virtualization/optimized-virtual-grid.tsx` —
  Ist 316, Budget 284: FixedSizeGrid → `Grid` + `useGridRef`.
- `components/VideoVault/client/src/components/ui/resizable.tsx` —
  Ist 45, Budget 555: `Group`/`Separator` (keine Aufrufer).
- `components/VideoVault/client/src/components/ui/chart.tsx` —
  Ist 327, Budget 273: `TooltipContentProps` + `DefaultLegendContentProps`.
- `components/VideoVault/client/src/pages/analytics.tsx` —
  Ist 273, Budget 327: Pie-Label-Guards.
- `components/VideoVault/client/src/services/library-metadata.ts` —
  Ist 346, Budget 554: `z.record`-Key-Schemata (3 Stellen).
- `components/VideoVault/shared/videovault/errors.ts` —
  Ist 75, Budget 825: `z.record`-Key-Schemata (2 Stellen).
- `components/VideoVault/server/middleware/errorHandler.ts` —
  Ist 59, Budget 841: `.errors` → `.issues`.
- `components/VideoVault/client/src/lib/error-handler.ts` —
  Ist 239, Budget 661: `ErrorContext`-Index-Signatur.
- `components/VideoVault/client/src/components/admin/error-dashboard.tsx` —
  Ist 353, Budget 247: Context-Render mit Guard.
- `components/VideoVault/server/routes/errors.ts` — Ist 224,
  Budget 676: Param-Normalisierung (2 Stellen).
- `components/VideoVault/server/routes/jobs.ts` — Ist 224,
  Budget 676: Param-Normalisierung (1 Stelle).
- `components/VideoVault/server/routes/persistence.ts` — Ist 405,
  Budget 495: Param-Normalisierung (6 Stellen).
- `components/VideoVault/server/routes/scan-state.ts` — Ist 269,
  Budget 631: Param-Normalisierung (3 Stellen).
- `components/VideoVault/server/routes/settings.ts` — Ist 72,
  Budget 828: Param-Normalisierung (8 Stellen).
- `components/VideoVault/server/routes/split.ts` — Ist 58,
  Budget 842: Param-Normalisierung (1 Stelle).
- `components/VideoVault/server/routes/tag-ops.ts` — Ist 157,
  Budget 743: Param-Normalisierung (3 Stellen).
- `components/VideoVault/server/routes/thumbnails-v2.ts` — Ist 196,
  Budget 704: Param-Normalisierung (6 Stellen).
- `components/VideoVault/server/routes/processing.ts` — Ist 82,
  Budget 818: Handler-Imports aufteilen.
- `tests/py/spec/videovault/test_type_gate_green.py` —
  Ist 38, Budget 762: pytest-Wrapper (in diesem Stage-Commit enthalten).

## Tasks

### Task 1 — RED bestätigen (expected: FAIL)

Permitted files: keine (nur lesen/ausführen). Runtime: node + pytest.

1. `bash scripts/pytest-run.sh tests/py/spec/videovault/test_type_gate_green.py` → expected: FAIL (tsc meldet 74 Fehler, Exit 2).
2. `cd components/VideoVault && npx tsc --noEmit --incremental false 2>&1 | grep -c "error TS"` → erwartet: 74.
3. `cd components/VideoVault && FAST_TESTS=1 npx vitest run 2>&1 | grep -c "FAIL "` → erwartet: 16 (JSX-Parse-Fehler, Ticket-U3).

### Task 2 — Aliase + Vitest-Runner reparieren

Permitted files:
`components/VideoVault/tsconfig.json`,
`components/VideoVault/vite.config.ts`,
`components/VideoVault/vitest.config.ts`.

1. In allen drei Dateien den Player-Pfad um eine Ebene anheben:
   tsconfig-`paths` → `../../packages/videovault-player/src` (2 Keys),
   vite/vitest-`path.resolve` → zusätzliches `'..'`-Segment. Docker-kompatibel
   (`/app` + `../..` = `/packages`), siehe Spec F2.
2. `vitest.config.ts`: `import react from '@vitejs/plugin-react'` und
   `plugins: [react()]` ergänzen (installiert: 6.0.4). `esbuild.jsx`-Block
   unverändert lassen.
3. Prüfen: `npx tsc --noEmit --incremental false` → TS2307-Fehler weg
   (72 statt 74); `FAST_TESTS=1 npx vitest run` → keine
   `Unexpected JSX expression`-Fehler mehr (Suiten sammeln).

### Task 3 — Client: day-picker v10 + react-window v2

Permitted files:
`components/VideoVault/client/src/components/ui/calendar.tsx`,
`components/VideoVault/client/src/components/filters/advanced-filters.tsx`,
`components/VideoVault/client/src/components/layout/main-content.tsx`,
`components/VideoVault/client/src/components/virtualization/optimized-virtual-grid.tsx`.

1. `calendar.tsx`: classNames nach Spec F5 mappen
   (`month_caption`, `button_previous`, `button_next`, `month_grid`,
   `weekdays`, `weekday`, `week`, `day`, `day_button`, `range_end`,
   `selected`, `today`, `outside`, `disabled`, `range_middle`, `hidden`;
   `months`/`month`/`nav`/`caption_label` unverändert),
   `components`-Prop auf `{ Chevron: ({ className, orientation, ...props }) => ... }`
   umstellen (Typen: `node_modules/react-day-picker/dist/esm/UI.d.ts`,
   `components/Chevron.d.ts`).
2. `advanced-filters.tsx`: beide `initialFocus`-Props am lokalen
   `Calendar` auf `autoFocus` umstellen.
3. `main-content.tsx`: `import { List as VirtualList } from 'react-window'`
   (lucide-`List`-Kollision!); `height`/`width` → `style`,
   `itemCount`→`rowCount`, `itemSize`→`rowHeight`, `itemKey`→`rowKey`,
   Children-Funktion → `rowComponent` (per `useCallback`, Params
   `{ index, style }`), `rowProps` mit stabilem Memo-Objekt.
4. `optimized-virtual-grid.tsx`: `import { Grid as VirtualGrid, useGridRef }`;
   `useRef<VirtualGrid>(null)` → `useGridRef()`, `ref=` → `gridRef=`;
   `itemData` → `cellProps`, cellRenderer-Param `data` → Rest-Props;
   `overscanRowCount`/`overscanColumnCount` → `overscanCount={3}`;
   `useIsScrolling` ersatzlos streichen; `height`/`width`/`rowCount`/
   `rowHeight`/`columnCount`/`columnWidth` behalten, `style` für
   Maße ergänzen; `itemKey` → `rowKey` + `columnKey` (stabile
   Video-ID pro Zelle); `handleScroll` auf DOM-Event
   (`e.currentTarget.scrollTop`) umstellen, Debounce-Logik behalten;
   `scrollToIndex` auf `scrollToRow({ index, align: 'start' })`;
   `useRef<NodeJS.Timeout>()` → `useRef<NodeJS.Timeout | undefined>(undefined)`.
5. Prüfen: betroffene tsc-Fehler weg; `npx vitest run
   src/components/layout/main-content.virtualization.test.tsx` grün.

### Task 4 — Client: resizable v4 + recharts v3

Permitted files:
`components/VideoVault/client/src/components/ui/resizable.tsx`,
`components/VideoVault/client/src/components/ui/chart.tsx`,
`components/VideoVault/client/src/pages/analytics.tsx`.

1. `resizable.tsx`: `PanelGroup` → `Group`, `PanelResizeHandle` →
   `Separator` (Werte + `ComponentProps`-Typen). Klassen unverändert
   (keine Aufrufer im Client).
2. `chart.tsx`: `ChartTooltipContent`-Props auf
   `RechartsPrimitive.TooltipContentProps` (+ div-Props + Custom-Props)
   umstellen; `ChartLegendContent`-Pick auf
   `Pick<RechartsPrimitive.DefaultLegendContentProps, 'payload' | 'verticalAlign'>`;
   `getPayloadConfigFromPayload`-Item-Parameter mit
   `TooltipPayloadEntry`/`LegendPayload` typisieren.
3. `analytics.tsx`: Pie-`label`-Callback params typisieren und
   `percent` per `?? 0` absichern.
4. Prüfen: betroffene tsc-Fehler weg.

### Task 5 — Client/Shared: zod v4 + Error-Typen

Permitted files:
`components/VideoVault/client/src/services/library-metadata.ts`,
`components/VideoVault/shared/videovault/errors.ts`,
`components/VideoVault/server/middleware/errorHandler.ts`,
`components/VideoVault/client/src/lib/error-handler.ts`,
`components/VideoVault/client/src/components/admin/error-dashboard.tsx`.

1. `z.record`-Stellen (library-metadata 3, shared/errors 2) auf
   Zwei-Argument-Form `z.record(z.string(), <value>)` umstellen.
2. `errorHandler.ts`: `err.errors.map` → `err.issues.map`
   (Issue-Form `{ path, message }` unverändert).
3. `error-handler.ts`: `ErrorContext` um Index-Signatur
   `[key: string]: unknown` ergänzen (verträglich mit
   `StoredError.context: Record<…, unknown>`).
4. `error-dashboard.tsx`: `error.context.component`-Render per
   `typeof`-Guard + `String()` absichern.
5. Prüfen: betroffene tsc-Fehler weg (Kaskaden aus der
   Record-Inferenz — `directories`, `WatchStatesByRoot` — lösen sich
   mit Schritt 1; Reststellen explizit typisieren).

### Task 6 — Server: express v5 + Handler-Imports

Permitted files:
`components/VideoVault/server/routes/errors.ts`,
`components/VideoVault/server/routes/jobs.ts`,
`components/VideoVault/server/routes/persistence.ts`,
`components/VideoVault/server/routes/scan-state.ts`,
`components/VideoVault/server/routes/settings.ts`,
`components/VideoVault/server/routes/split.ts`,
`components/VideoVault/server/routes/tag-ops.ts`,
`components/VideoVault/server/routes/thumbnails-v2.ts`,
`components/VideoVault/server/routes/processing.ts`.

1. Alle `req.params`- (und fehlenden `req.query`-)Lesestellen per
   `String(...)`-Idiom normalisieren (Präzedenz errors.ts:106-111):
   settings 8, thumbnails-v2 6, persistence 6, scan-state 3, tag-ops 3,
   errors 2, jobs 1 (`req.params`-Herkunft je Stelle prüfen), split 1.
   Optionale Werte zuvor auf nullish prüfen.
2. `processing.ts`: `handleAudiobookProcessing` aus
   `../handlers/audiobook-handler`, `handleEbookProcessing` aus
   `../handlers/ebook-handler` importieren (statt movie-handler);
   Aufrufsignaturen gegen die Exporte prüfen.
3. Prüfen: `npx tsc --noEmit --incremental false` → 0 Fehler.

### Task 7 — Verify (Integration)

1. `bash scripts/pytest-run.sh tests/py/spec/videovault/test_type_gate_green.py` → grün.
2. `cd components/VideoVault && npm run check` → fehlerfrei (Exit 0).
3. `cd components/VideoVault && npm run test:client` → 48/48 Dateien grün.
4. `cd components/VideoVault && npm run build` → erfolgreich
   (plugin-react/vite-8-Verträglichkeit; bei Fehlschlag `@vitejs/plugin-react`
   auf ^7 anheben inkl. Lock-Commit, dann erneut prüfen).
5. `task test:changed`
6. `task freshness:regenerate`
7. `task freshness:check`
8. Falls `components/website/src/data/test-inventory.json` durch die neuen
   Tests dirty wird: `task test:inventory` und Datei mitcommitten (erwartet:
   keine Änderung, Inventar ist website-bezogen).
9. Erwartet: alles grün.
