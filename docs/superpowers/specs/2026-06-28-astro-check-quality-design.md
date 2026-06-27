---
title: "astro check Code Quality Gate"
ticket_id: "T001277"
plan_ref: "openspec/changes/astro-check-quality/tasks.md"
date: "2026-06-28"
status: "approved"
---

# astro check Code Quality Gate — Design Spec

## Problem

`astro check` (TypeScript-Typprüfung für Astro-Komponenten und alle `.ts`-Dateien im Website-Projekt) schlägt derzeit mit **179 Fehlern** fehl und ist nicht in CI integriert. Das führt dazu, dass Typ-Regressionen unbemerkt in `main` gelangen.

## Ist-Zustand

- `@astrojs/check` ist installiert (`devDependencies`)
- Kein `check`-Script in `website/package.json`
- Kein `astro check`-Step in `.github/workflows/ci.yml`
- 179 TypeScript-Fehler verteilt auf ~180 Dateien (1183 Dateien total geprüft)
- 230 Hints (unused imports/variables — ts(6133))

## Fehler-Taxonomie

### Gruppe 1 — Veraltete Test-Fixtures (ts(2739/2741/2322/2345)) — Hauptursache

Typ-Definitionen in `cockpit-types.ts` wurden nach Implementierung von T001092 erweitert, ohne die Test-Fixtures zu aktualisieren:

| Typ | Neue Pflichtfelder | Betroffene Test-Files |
|---|---|---|
| `RollupMetrics` | `awaitingDeploy: number` | `Cockpit.test.ts`, `CockpitTable.test.ts` |
| `FeatureNode` | `nextStep: boolean`, `discarded: boolean`, `majorFeature: boolean` | `CockpitTable.test.ts`, `FilterBar.test.ts`, etc. |
| `NavMobile.Props` | `LanguageSwitcher: any` | `Navigation.test.ts` |

### Gruppe 2 — Fehlende Imports in Source-Dateien (ts(2304))

| Datei | Fehlendes Symbol | Quelle |
|---|---|---|
| `src/lib/factory-floor-types.ts` | `ShippedItem`, `AwaitingDeployItem` | `./factory-floor-lanes` (re-export ohne lokalen import) |
| `src/lib/billing-archive.test.ts` | `vi` | `vitest` |
| `src/lib/questionnaire-display.test.ts` | `vi` | `vitest` |
| `src/lib/whisper.test.ts` | `afterEach` | `vitest` |
| `src/pages/api/admin/knowledge/collections/[id]/context7.ts` | `errorResponse` | `../../_errors` |
| `src/pages/api/admin/knowledge/collections/[id]/crawl.ts` | `errorResponse` | `../../_errors` |
| `src/pages/api/cron/notify-unread.ts` | `errorResponse` | `../../_errors` |

### Gruppe 3 — Typ-Narrowing-Fehler (ts(2339))

- `src/pages/stripe/success.astro`: `stripe.checkout.sessions.retrieve(...)` — `stripe` ist als `never` typed, weil die Stripe-SDK-Initialisierung unter einer Bedingung steht die TypeScript nicht narrowen kann. Fix: Non-null assertion (`stripe!`) oder explizite Typ-Guard.

### Gruppe 4 — Sonstige Typ-Fehler (ts(2345/2322) in Astro-Pages)

Verteilt über ~50 Admin-Pages — überwiegend `any`-basierte Laufzeit-Objekte, die an streng-typisierte Funktionen übergeben werden. Hierzu gehören Patterns wie `session.locals` ohne Typ-Annotation und API-Handler mit ungetypten Request-Bodies.

### Gruppe 5 — Hints (ts(6133)) — nicht fehlergebend

200 unused-import/variable-Warnings. Sie zählen als Hints (0 Warnungen), blockieren `astro check` nicht. Werden im selben PR aufgeräumt, um zukünftigen Hint-Anstieg zu vermeiden.

## Design

### A. Shared Test-Fixture-Factory (`website/src/lib/tickets/__tests__/fixtures.ts`)

Neue Datei mit typsicheren Factory-Funktionen für die häufig verwendeten Cockpit-Typen:

```typescript
// Gibt ein vollständiges RollupMetrics-Objekt zurück, alle Felder overridbar
export function makeRollup(overrides?: Partial<RollupMetrics>): RollupMetrics {
  return { total: 1, done: 0, blocked: 0, inProgress: 0, awaitingDeploy: 0, open: 1, pctDone: 0, ...overrides };
}

export function makeFeature(overrides?: Partial<FeatureNode>): FeatureNode {
  return {
    id: 'f1', extId: 'F1', title: 'Feature', priority: 'mittel', health: 'green',
    rollup: makeRollup(), nextStep: false, discarded: false, majorFeature: false,
    ...overrides,
  };
}

export function makeProduct(overrides?: Partial<ProductNode>): ProductNode {
  return { id: 'p1', extId: 'P1', title: 'Product', rollup: makeRollup(), features: [], ...overrides };
}

export function makePortfolio(products?: ProductNode[]): PortfolioPayload {
  return { products: products ?? [makeProduct()] };
}
```

**Nutzen:** Zukünftige Typ-Änderungen in `cockpit-types.ts` brechen nur die Factory — ein Pflege-Punkt statt N Test-Dateien.

### B. Direkte Source-Fixes

- `factory-floor-types.ts`: `import type { ShippedItem, AwaitingDeployItem } from './factory-floor-lanes';` hinzufügen
- Fehlende `vi`/`afterEach`-Imports in 3 Test-Dateien ergänzen
- `errorResponse`-Imports in 3 API-Routen ergänzen
- `stripe/success.astro`: Stripe-Variable mit Non-null assertion typen

### C. Astro-Pages Typ-Fixes

Admin-Pages verwenden `locals` und `request`-Objekte ohne korrekten Typ-Import. Einheitliches Pattern: `import type { APIContext } from 'astro';` sicherstellt, dass `locals` typed ist. Für Fälle wo `any` unvermeidbar ist (externe API-Antworten): explizit `as unknown as ExpectedType` statt implizites any.

### D. CI-Gate (Advisory)

Neuer Job `astro-check` in `.github/workflows/ci.yml`:
```yaml
astro-check:
  name: Astro TypeScript Check
  if: github.event.action != 'edited'
  runs-on: ubuntu-latest
  timeout-minutes: 10
  steps:
    - uses: actions/checkout@...
    - uses: pnpm/action-setup@... (version: 10)
    - uses: actions/setup-node@... (node-version: '22')
    - run: pnpm install --frozen-lockfile
      working-directory: website
    - name: Type check
      run: pnpm exec astro check
      working-directory: website
```

**Advisory** (non-required in branch protection) beim ersten Merge. Wird nach 2 Wochen fehlerfrei zu **required** in branch protection promoten.

### E. `package.json` Script

```json
"check": "astro check"
```

Damit ist `pnpm check` lokal ausführbar.

## Scope-Abgrenzung

- **IN**: Alle 179 Fehler + 230 Hints, CI-Job, `package.json`-Script
- **OUT**: TypeScript-Striktheit erhöhen (weitere Compiler-Flags), ESLint-Regeln
- **OUT**: Playwright/E2E-Tests (separater Scope)
- **T001278 Koordination**: T001278 (npm Vulns) berührt `website/package.json` → Merge-Konflikt-Risiko auf PR-Ebene. Bei Review auflösen: T001278 zuerst mergen (wenn fertig), dann T001277 rebasen.

## Erfolgskriterien

1. `cd website && npx astro check` → `Result: 0 errors, 0 warnings, 0 hints`
2. Neuer CI-Job `Astro TypeScript Check` grün auf dem PR
3. `pnpm check` in `website/` ausführbar
4. Alle bestehenden Vitest-Tests weiter grün
