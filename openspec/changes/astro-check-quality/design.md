## Context

`astro check` prüft alle TypeScript/Astro/Svelte-Dateien im `website/`-Projekt statisch auf Typ-Korrektheit. Es ist seit Jahren installiert (`@astrojs/check`), aber nie als CI-Gate eingebunden. Nach T001092 (awaiting_deploy-Entfernung aus Happy-Path) wurden `RollupMetrics` und `FeatureNode` um Pflichtfelder erweitert — Test-Fixtures wurden nicht mitgezogen. Ergebnis: 179 Fehler, keine CI-Sicherheit.

## Goals / Non-Goals

**Goals:**
- Alle 179 `astro check`-Fehler beheben (0 errors, 0 warnings, 0 hints)
- Fixture-Factory für Cockpit-Typen einführen (verhindert Drift bei zukünftigen Typ-Änderungen)
- `astro check` als advisory CI-Gate integrieren

**Non-Goals:**
- TypeScript strict-mode verschärfen (keine neuen Compiler-Flags)
- ESLint-Regeln ändern
- Vitest-Coverage erhöhen
- Playwright/E2E-Tests berühren

## Decisions

### D1: Fixture-Factory für Cockpit-Typen (statt direkter Fixture-Updates)

`makeRollup()`, `makeFeature()`, `makeProduct()`, `makePortfolio()` in `website/src/lib/tickets/__tests__/fixtures.ts` — alle mit sinnvollen Defaults, alle Felder via `Partial<T>` überridbar. Cockpit-Tests importieren daraus.

**Rationale:** `RollupMetrics` und `FeatureNode` werden häufig erweitert (T001092 ist nicht die letzte Änderung). Eine einzige Factory verhindert, dass jede neue Typ-Erweiterung N Test-Dateien bricht.

### D2: Source-Fixes sind direkte Import-Ergänzungen (kein Refactoring)

`factory-floor-types.ts` fehlt `import type { ShippedItem, AwaitingDeployItem } from './factory-floor-lanes'` — die Datei re-exportiert die Typen, aber nutzt sie intern ohne lokalen Import. Fix: `import type` ergänzen. Kein strukturelles Refactoring nötig.

### D3: `errorResponse`-Imports in 3 API-Routen

`src/pages/api/_errors.ts` exportiert `errorResponse()`. Drei Dateien (`context7.ts`, `crawl.ts`, `notify-unread.ts`) nutzen die Funktion ohne Import. Fix: jeweiligen relativen Import ergänzen.

### D4: Advisory CI-Gate initial, Promotion nach 2 Wochen

Der neue `astro-check`-Job ist **nicht** in `branch_protection_rules required_status_checks`. Er erscheint in der PR-Statusliste, blockt aber nicht den Auto-Merge. Nach 2 grünen Wochen in Production wird er zum required check (via `task gh:branch-protection:*` oder GitHub UI).

**Rationale:** Vermeidet Lock-out falls ein zukünftiger Merge kurzzeitig Typ-Fehler einführt, bevor die Entwickler die Prüfung gewohnt sind.

### D5: Stripe-Fix via Non-null Assertion

`stripe/success.astro` initialisiert die Stripe-Instanz konditional — TypeScript narrowt die Variable danach auf `never`. Fix: nach dem Konditionscheck `stripe!` (Non-null assertion) oder expliziter `as Stripe`-Cast auf der bereits geprüften Variable.

## Risks / Trade-offs

| Risiko | Wahrscheinlichkeit | Mitigation |
|---|---|---|
| T001278 (npm vulns) verursacht Merge-Konflikt auf `website/package.json` | mittel | T001278 zuerst mergen, dann T001277 rebasen |
| Advisory Gate wird dauerhaft ignoriert | niedrig | Fixe 2-Wochen-Frist im Plan; Promotion ist ein separater Chore-PR |
| Neue Typ-Fehler während Fix-Entwicklung durch parallele Merges | niedrig | `astro check`-Lauf im Verify-Task erkennt das sofort |
