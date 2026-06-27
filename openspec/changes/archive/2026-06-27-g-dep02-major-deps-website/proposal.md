# Proposal: g-dep02-major-deps-website (G-DEP02)

## Why

G-DEP02 im Repository-Health-Katalog misst veraltete **Major**-Dependencies im
`website/`-Paket — Deps, die eine volle Major-Version hinter dem aktuellen
Stable-Release liegen. Baseline (live `npx npm-check-updates`, 2026-06-27):
**9 Major-behind Deps**. Ziel: **≤ 3** (mindestens 6 aktualisieren).

Konsequenzen ungelöster Major-Drift:
- Sicherheitsfixes der neuen Major-Linie fehlen (z. B. transitive CVEs in der
  Astro/Vite-Toolchain).
- Wachsende Migrationsschuld — je länger gewartet wird, desto mehr Breaking
  Changes stapeln sich pro Sprung.
- Alpha-Pins (`rrweb`, `rrweb-player`) sind unsupported Pre-Releases ohne
  Patch-Garantie.

### Die 9 Major-behind Deps (verifiziert via ncu)

| Dep | Ist | Ziel-Major | Kopplung / Risiko |
|---|---|---|---|
| `astro` | `^6.4.8` | `7.x` | Astro-Stack-Kern (Migrationsguide 6→7) |
| `@astrojs/node` | `^10.1.1` | `11.x` | hart an Astro 7 peer-gekoppelt |
| `@astrojs/react` | `^5.0.5` | `6.x` | hart an Astro 7 peer-gekoppelt |
| `@astrojs/svelte` | `^8.1.1` | `9.x` | hart an Astro 7 peer-gekoppelt |
| `@sveltejs/vite-plugin-svelte` | `^6.2.4` | `7.x` | an die von Astro 7 gebündelte Vite-Major gekoppelt |
| `pino` | `^9.6.0` | `10.x` | Backend-Logger, einzige Nutzung `src/lib/logger.ts` |
| `signature_pad` | `^4.2.0` | `5.x` | einzige Nutzung `src/pages/portal/sign/[assignmentId].astro` |
| `rrweb` | `2.0.0-alpha.4` | `2.0.1` (stable) | Session-Replay-Recorder, breite Nutzung |
| `rrweb-player` | `1.0.0-alpha.4` | `2.0.1` (stable) | Replay-Player, API-Sprung 1-alpha → 2 |

### Nicht major-behind (Annahme im Ticket korrigiert)

Das Ticket nannte `react`, `@stripe/stripe-js`, `d3`, `pixi.js`, `@anthropic-ai/sdk`
als Kandidaten. ncu zeigt: diese sind **nicht** Major-behind — `react`/`react-dom`
sind nur einen Patch (19.2.6 → 19.2.7), `@stripe/stripe-js` (9.6 → 9.8) und
`pixi.js` (8.18 → 8.19) nur Minor, `d3` und `@anthropic-ai/sdk` sind bereits auf
der aktuellen Major. Sie sind **out of scope** für G-DEP02.

## What

1. **Failing-Gate (vitest, offline):** `website/tests/major-deps.test.ts` liest
   `website/package.json`, vergleicht die 9 getrackten Deps gegen ihre Ziel-Major
   und failt, solange > 3 dahinter liegen. Initial rot (9 > 3), grün nach den
   Updates. Läuft im bestehenden "Vitest (website)"-CI-Job — kein Registry-Netz.
2. **Low-Risk-Updates:** `pino` 9→10, `signature_pad` 4→5 (je 1 zentrale
   Nutzungsstelle, CHANGELOG-geprüft).
3. **Astro-Stack (koordinierter Bump):** `astro` 6→7 + `@astrojs/node` 11 +
   `@astrojs/react` 6 + `@astrojs/svelte` 9 (peer-gekoppelt, müssen zusammen) +
   `@sveltejs/vite-plugin-svelte` 7 (Vite-Kopplung) — gemäß Astro-6→7-Migrationsguide.
4. **High-Risk / Alpha:** `rrweb` + `rrweb-player` alpha → 2.0.1 (stable). Stabile
   Versionen existieren, also Migration **versuchen**. Falls die Player-API-Migration
   (1-alpha → 2) Session-Replay-Regressionen verursacht, die im Slice nicht lösbar
   sind, als **akzeptierte Ausnahme** dokumentieren — bleibt im ≤ 3-Budget.
5. **Verifikation:** Gate grün (≤ 3 behind), `astro check` + Build + `pnpm vitest run`,
   `task test:changed`, `task freshness:regenerate`, `task freshness:check`.

### Garantierter Floor

Astro-Kern (4 hart gekoppelte Deps) + 2 Low-Risk (`pino`, `signature_pad`) = **6
Updates** ⇒ höchstens 3 verbleibend ⇒ Gate grün, auch ohne `rrweb`/`rrweb-player`.
`@sveltejs/vite-plugin-svelte` und das `rrweb`-Paar sind die Reserve, um auf 0–2
verbleibende zu kommen.

### Drift-Prävention (bestehend)

Self-hosted Renovate (`.github/workflows/renovate.yml`, wöchentlich) hält künftige
Drift klein; dieser Change ist die einmalige Aufhol-Aktion. Das vitest-Gate
verhindert Regression unter das ≤ 3-Budget.

## Nicht im Scope

- Minor/Patch-Bumps der nicht-major-behind Deps (`react`, `@stripe/stripe-js`,
  `pixi.js`, `nanoid`, `openai`, …) — separates Routine-Update.
- `mentolder-web/` und Brett — eigenes Paket, eigenes Ticket.
- Änderungen an der Renovate-Konfiguration.

_Ticket: T001209_
