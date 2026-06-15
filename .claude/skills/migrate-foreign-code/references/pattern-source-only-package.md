# Pattern: Source-only Package (geteilter Code via Alias)

Wie Code zwischen Apps geteilt wird, ohne einen eigenen Build-/Publish-Schritt.

## Muster (generisch)

Geteilter Code (z.B. eine extrahierte UI-Komponente) wird als **source-only Package** abgelegt —
**kein** Build-Schritt, reiner Alias-Mechanismus:

- `package.json`: `"main"` und `"types"` zeigen direkt auf `src/index.ts`.
- Konsumenten binden es per `resolve.alias` (Vite/Vitest) + `paths` (tsconfig) ein.
- Tests laufen direkt im Package (eigenes Vitest), keine Vorab-Kompilierung nötig.

So bleibt das Package eine reine Quell-Einheit; Konsumenten kompilieren es als Teil ihres eigenen
Builds. Das ist der Hebel, der in der Entkopplungs-Phase (Phase 1) das spätere Backend-Tauschen
ermöglicht (siehe [pattern-hybrid-backend](pattern-hybrid-backend.md)).

## VideoVault-Beispiel

`@videovault-player` ist als source-only Package eingebunden. Die Widget-App nutzt zusätzlich ein
**Dual-Build-Pattern**: `vite.config.ts` prüft `mode === 'lib'` → `build.lib`-Eintrag mit
`external: ['react','react-dom', …]`; sonst Standard-App-Dev-Server. Der Alias ist in **beiden**
Modi gesetzt.

FFmpeg-Assets: `toBlobURL('/ffmpeg/ffmpeg-core.js', 'text/javascript')` aus `@ffmpeg/util` statt
`new URL('@ffmpeg/core/dist/umd/…', import.meta.url)` — ab `@ffmpeg/core` v0.12 wird der
`dist/umd`-Specifier nicht mehr exportiert (`Missing "./dist/umd/…"`). Core-Dateien per Copy-Script
nach `public/ffmpeg/` kopieren; `@ffmpeg/ffmpeg` + `@ffmpeg/core` in `optimizeDeps.exclude`.

## Stolpersteine

- **Duplicate React instances** beim Import über node_modules-Grenzen hinweg → `resolve.alias` für
  `react` **und** `react-dom` in der Vitest/Vite-Config des Konsumenten.
- **Hook-Reihenfolge:** alle Hooks **vor** einem frühen `return null` platzieren — ein
  `useCallback` nach dem Guard löst „Rendered more hooks than during the previous render" aus.
