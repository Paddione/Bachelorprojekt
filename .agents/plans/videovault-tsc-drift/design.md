# videovault-tsc-drift — Root-Cause-Spec (T901943)

Revision: `ec0638e9a` (origin/main) · Ticket: T901943 · Typ: fix.

## Symptom (Fakt)

`build-videovault.yml`-Gate auf main rot: `npm run check` (tsc) meldet
exakt 74 Fehler in 22 Dateien, `npm run test:client` (vitest) meldet
16 fehlgeschlagene Suiten bei 32 grünen (437 Einzeltests grün).
Deploy mentolder skipped. Alle Fehler liegen in Dateien, die kein
aktuelles Ticket angefasst hat.

## Ursachen (Hypothesen, belegt)

| # | Ursache | Beleg |
|---|---|---|
| U1 | Major-Bumps ohne Code-Migration (#3237, 2026-07-26): react-day-picker ^10, react-window ^2, react-resizable-panels ^4, recharts ^3, zod ^4, express ^5, vite ^8, vitest ^4 | `git show cac49c112c -- VideoVault/package.json`, installierte Versionen in `node_modules` |
| U2 | Repo-Reorg (#4659) hat `@videovault-player`-Aliase um ein `..` gekürzt: `components/VideoVault` + `../packages` löst nach `components/packages` (nicht existent) | tsconfig `paths`, vite/vitest-Alias vs. reale Lage `packages/videovault-player/src` |
| U3 | Vite-8-Rolldown-Pipeline ignoriert `esbuild.jsx`; `vitest.config.ts` bindet `@vitejs/plugin-react` nicht ein → JSX-Parse-Fehler in allen 16 `.tsx`-Suiten | Fehlermeldungen `RolldownError: Unexpected JSX expression`, `vite:import-analysis`, funktionierende App-Config mit `react()` als Positiv-Anker |

## Fix-Ansatz (Entscheidungen)

- F1: Vorwärts-Migration auf die installierten Majors, kein Pin-Back.
  Die Majors gelten repo-weit (#3237, 7 Workspaces); ein Rollback nur für
  VideoVault würde Lock-Divergenz erzeugen.
- F2: Aliase `..` → `../..` in tsconfig, vite.config, vitest.config.
  Dual-Layout-kompatibel: Repo (`components/VideoVault` + `../..` =
  Repo-Root) und Docker (`/app` + `../..` = `/`, dort liegt
  `/packages/videovault-player`). Kein Dockerfile-Umbau nötig.
- F3: `react()`-Plugin in `vitest.config.ts` ergänzen (Version 6.0.4 ist
  installiert; Verify per `test:client` + `npm run build`; Fallback bei
  Inkompatibilität: Bump auf ^7 mit Lock-Commit).
- F4: react-window v2: `List`/`Grid`, `rowComponent`/`cellComponent`,
  `rowProps`/`cellProps`, `style` statt height/width, `useGridRef`,
  `scrollToRow` statt `scrollTo`, `onScroll` als DOM-Handler mit
  bestehendem Debounce. `List`-Import aliassen (Kollision mit
  lucide-`List` in main-content). Keys: `rowKey`/`columnKey`-Paar mit
  stabiler Video-ID.
- F5: react-day-picker v10: classNames-Mapping (caption→month_caption,
  nav_button_*→button_*, table→month_grid, head_row→weekdays,
  head_cell→weekday, row→week, cell→day, day→day_button,
  day_range_end→range_end, day_selected→selected, day_today→today,
  day_outside→outside, day_disabled→disabled, day_range_middle→
  range_middle, day_hidden→hidden), `IconLeft`/`IconRight`→`Chevron`,
  `initialFocus`→`autoFocus`.
- F6: react-resizable-panels v4: `PanelGroup`→`Group`,
  `PanelResizeHandle`→`Separator`. Keine Aufrufer im Client
  (nur Definitionsdatei) → typreine Migration ohne Laufzeitrisiko.
- F7: recharts v3: Tooltip-Content auf `TooltipContentProps`,
  Legend-Pick auf `DefaultLegendContentProps`, Pie-Label mit
  Undefined-Guards.
- F8: zod v4: `z.record` Key-Schema `z.string()` ergänzen (5 Stellen),
  `ZodError.errors`→`.issues`, `ErrorContext` mit Index-Signatur für
  `StoredError.context`-Kompatibilität, Dashboard-Render mit
  Typ-Guard + `String()`.
- F9: express v5: `req.params`/`req.query` (`string | string[]`) per
  `String()`-Idiom normalisieren (Präzedenz errors.ts Query-Parsing),
  `processing.ts`-Imports auf audiobook-/ebook-handler aufteilen.

## Subsysteme / Edge-Cases

- Server-Routen: ~30 Stellen in 8 Dateien, rein typseitig (Laufzeit
  liefert weiterhin Strings) → kein Verhaltensrisiko.
- `useIsScrolling` entfällt ersatzlos (nur `willChange`-Stil +
  Dev-Overlay betroffen); Overscan 3/1 → einheitlich 3.
- `String(array)` join-kommagetrennt: Route-Params sind in der Praxis
  Einzelelement-Arrays → kein semantischer Unterschied.
- main-content.tsx (772 Zeilen) liegt außerhalb des S1-Scan-Universums
  (`gates.yaml` scan.code_roots enthält components/VideoVault nicht);
  Edits bleiben trotzdem annähernd zeilenneutral.

## Akzeptanz

`npx tsc --noEmit` 0 Fehler, pytest-Wrapper grün, `test:client`
48/48 Dateien grün, `npm run build` erfolgreich, `task test:changed` +
`freshness:regenerate` + `freshness:check` grün.
