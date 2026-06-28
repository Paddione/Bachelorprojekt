## Why

`astro check` schlägt derzeit mit 179 TypeScript-Fehlern fehl und ist nicht in CI integriert, sodass Typ-Regressionen unbemerkt in `main` landen. Ziel ist ein grüner Lauf und ein CI-Gate, das zukünftige Regressionen automatisch verhindert.

## What Changes

- Fix 179 TypeScript-Fehler in `website/`: veraltete Test-Fixtures (fehlende Pflichtfelder in `RollupMetrics`, `FeatureNode`, `NavMobile.Props`), fehlende Imports in Quelldateien (`ShippedItem`/`AwaitingDeployItem` in `factory-floor-types.ts`, `errorResponse` in 3 API-Routen, `vi`/`afterEach` in Test-Dateien), Stripe-Typ-Narrowing-Fehler
- Neue Fixture-Factory `website/src/lib/tickets/__tests__/fixtures.ts` für typsichere Cockpit-Test-Objekte
- Neues npm-Script `"check": "astro check"` in `website/package.json`
- Neuer CI-Job `Astro TypeScript Check` in `.github/workflows/ci.yml` (advisory, non-required initially)

## Capabilities

### New Capabilities

- `astro-type-check`: Kontinuierliche TypeScript-Typprüfung aller Astro/Svelte/TS-Dateien als CI-Gate; Fixture-Factory als Regressions-Schutz für Cockpit-Typ-Änderungen

### Modified Capabilities

- `ci-cd`: Neuer `astro-check`-Job in der GitHub-Actions-Pipeline

## Impact

- `website/src/lib/tickets/__tests__/fixtures.ts` — neu (Fixture-Factory)
- `website/src/lib/factory-floor-types.ts` — fehlender Import ergänzt
- `website/src/lib/billing-archive.test.ts`, `questionnaire-display.test.ts`, `whisper.test.ts` — fehlende `vi`/`afterEach`-Imports
- `website/src/pages/api/admin/knowledge/collections/[id]/context7.ts`, `crawl.ts`, `api/cron/notify-unread.ts` — `errorResponse`-Import
- `website/src/pages/stripe/success.astro` — Stripe-Typ-Fix
- `website/src/components/Navigation.test.ts` — `LanguageSwitcher`-Prop
- `website/src/components/admin/Cockpit.test.ts`, `CockpitTable.test.ts`, weitere Cockpit-Tests — Fixture-Factory-Migration
- `website/package.json` — `"check"` Script
- `.github/workflows/ci.yml` — neuer `astro-check` Job
