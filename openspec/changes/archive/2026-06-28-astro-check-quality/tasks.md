---
title: "astro-check Code Quality Gate"
ticket_id: "T001277"
domains: [website, ci]
status: implementing
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# astro-check-quality — Implementation Plan

## File Structure

| Datei | Status | Ist-Zeilen | Wirksame Schwelle | Budget |
|-------|--------|------------|-------------------|--------|
| `website/src/lib/tickets/__tests__/fixtures.ts` | NEU | 0 | 600 (`.ts`) | 560 |
| `website/src/components/admin/Cockpit.test.ts` | ÄNDERN | 66 | 600 (`.ts`) | 534 |
| `website/src/components/admin/CockpitTable.test.ts` | ÄNDERN | 127 | 600 (`.ts`) | 473 |
| `website/src/components/admin/Cockpit/FilterBar.test.ts` | ÄNDERN | 107 | 600 (`.ts`) | 493 |
| `website/src/components/Navigation.test.ts` | ÄNDERN | 52 | 600 (`.ts`) | 548 |
| `website/src/lib/billing-archive.test.ts` | ÄNDERN | 87 | 600 (`.ts`) | 513 |
| `website/src/lib/questionnaire-display.test.ts` | ÄNDERN | 72 | 600 (`.ts`) | 528 |
| `website/src/lib/whisper.test.ts` | ÄNDERN | 86 | 600 (`.ts`) | 514 |
| `website/src/lib/factory-floor-types.ts` | PRÜFEN | 115 | 600 (`.ts`) | 485 |
| `website/src/pages/api/admin/knowledge/collections/[id]/context7.ts` | ÄNDERN | 84 | 600 (`.ts`) | 516 |
| `website/src/pages/api/admin/knowledge/collections/[id]/crawl.ts` | ÄNDERN | 82 | 600 (`.ts`) | 518 |
| `website/src/pages/api/cron/notify-unread.ts` | ÄNDERN | 128 | 600 (`.ts`) | 472 |
| `website/src/pages/stripe/success.astro` | ÄNDERN | 76 | 400 (`.astro`) | 324 |
| `website/src/pages/admin/*.astro` (Gruppe 4) | ÄNDERN | varies | 400 (`.astro`) | varies |
| `.github/workflows/ci.yml` | ÄNDERN | 341 | ungated (`.yml`) | — |
| `website/package.json` | ÄNDERN | 85 | ungated (`.json`) | — |

Alle nicht-baselineten Dateien liegen deutlich unter ihrer Extension-Schwelle. Keine Datei nähert sich 80 % des Limits — kein Split erforderlich.

---

## Task 1: Fixture-Factory anlegen

**Ziel:** Neue Datei `website/src/lib/tickets/__tests__/fixtures.ts` mit typsicheren Builder-Funktionen für `RollupMetrics`, `FeatureNode`, `ProductNode` und `PortfolioPayload` anlegen. Die Factory wird von Tasks 2 und 3 konsumiert; die Inline-Fixtures in den Tests können danach durch Factory-Aufrufe ersetzt werden.

**Betroffene Dateien:** `website/src/lib/tickets/__tests__/fixtures.ts` (NEU)

**Pre-Flight — confirming failures before the fix (expected: FAIL):**

```bash
cd website && npx astro check 2>&1 | grep -E "awaitingDeploy|nextStep|discarded|majorFeature" | head -20
# expected: FAIL — Ausgabe zeigt Typ-Fehler in Cockpit.test.ts, CockpitTable.test.ts, FilterBar.test.ts
```

**Steps:**

1. Importiere die betreffenden Typen am Dateianfang von `fixtures.ts`. Die Typen werden aus `../../tickets/cockpit` (oder dem korrekten Quell-Modul) importiert — mit `import type`, da es sich um einen reinen Hilfsmodul handelt (kein Rück-Import auf DB-/API-Schichten, S2-konform):

   ```typescript
   // website/src/lib/tickets/__tests__/fixtures.ts
   import type { RollupMetrics, FeatureNode, ProductNode } from '../cockpit';
   import type { PortfolioPayload } from '../cockpit';
   ```

   Falls `PortfolioPayload` aus einem anderen Modul kommt, den tatsächlichen Import-Pfad via `grep -r "export.*PortfolioPayload" website/src` ermitteln.

2. Erstelle die vier Factory-Funktionen:

   ```typescript
   export function makeRollup(overrides?: Partial<RollupMetrics>): RollupMetrics {
     return {
       total: 1, done: 0, blocked: 0, inProgress: 0,
       awaitingDeploy: 0, open: 1, pctDone: 0,
       ...overrides,
     };
   }

   export function makeFeature(overrides?: Partial<FeatureNode>): FeatureNode {
     return {
       id: 'f1', extId: 'F1', title: 'Feature',
       priority: 'mittel', health: 'green',
       rollup: makeRollup(),
       nextStep: false, discarded: false, majorFeature: false,
       ...overrides,
     };
   }

   export function makeProduct(overrides?: Partial<ProductNode>): ProductNode {
     return {
       id: 'p1', extId: 'P1', title: 'Product',
       rollup: makeRollup(), features: [],
       ...overrides,
     };
   }

   export function makePortfolio(products?: ProductNode[]): PortfolioPayload {
     return { products: products ?? [makeProduct()] };
   }
   ```

3. Datei hat nach der Erstellung ~40 Zeilen — weit unter dem Limit von 600.

**Acceptance-Kriterien:**
- `website/src/lib/tickets/__tests__/fixtures.ts` existiert und kompiliert ohne Fehler (`tsc --noEmit` in `website/`)
- Alle vier Factory-Funktionen sind exportiert und typsicher

---

## Task 2: Cockpit-Tests auf Fixture-Factory migrieren (Gruppe 1 — RollupMetrics / FeatureNode)

**Ziel:** Inline-Fixture-Objekte in `Cockpit.test.ts`, `CockpitTable.test.ts` und `FilterBar.test.ts` durch Factory-Aufrufe ersetzen, sodass alle Pflichtfelder (`awaitingDeploy`, `nextStep`, `discarded`, `majorFeature`) automatisch gesetzt sind.

**Betroffene Dateien:**
- `website/src/components/admin/Cockpit.test.ts`
- `website/src/components/admin/CockpitTable.test.ts`
- `website/src/components/admin/Cockpit/FilterBar.test.ts`

**Steps:**

### Cockpit.test.ts

1. Import der Factory am Dateianfang ergänzen:
   ```typescript
   import { makeRollup, makeFeature, makeProduct, makePortfolio } from '../../../lib/tickets/__tests__/fixtures';
   ```

2. Das `portfolioWithFeature`-Inline-Objekt am Anfang der Datei ersetzen:
   ```typescript
   const portfolioWithFeature = makePortfolio([
     makeProduct({ features: [makeFeature({ health: 'amber' })] }),
   ]);
   ```
   Das `rollup`-Objekt enthält durch `makeRollup()` nun `awaitingDeploy: 0`; `makeFeature` setzt `nextStep`, `discarded`, `majorFeature`.

### CockpitTable.test.ts

1. Import der Factory ergänzen:
   ```typescript
   import { makeRollup, makeFeature } from '../../lib/tickets/__tests__/fixtures';
   ```

2. Das `feature`-Inline-Objekt durch einen Factory-Aufruf ersetzen:
   ```typescript
   const feature = makeFeature({ health: 'amber', rollup: makeRollup({ total: 2, open: 2 }) });
   ```
   Damit entfallen die fehlenden Felder `nextStep`, `discarded`, `majorFeature` und das rollup bekommt `awaitingDeploy: 0`.

### FilterBar.test.ts

1. Datei auf vorhandene Inline-FeatureNode-Objekte prüfen — alle Vorkommen von `rollup:` oder `{ id:` mit Feature-Shape durch Factory-Aufrufe ersetzen:
   ```typescript
   import { makeFeature, makeRollup } from '../../../../lib/tickets/__tests__/fixtures';
   ```
   Relativer Pfad von `admin/Cockpit/` zu `lib/tickets/__tests__/` ist `../../../../lib/tickets/__tests__/fixtures`.

2. Jedes Inline-Feature-Objekt durch `makeFeature({ ... })` ersetzen, wobei nur die Tests-relevanten Felder als Override übergeben werden.

**Acceptance-Kriterien:**
- `cd website && npx vitest run --reporter=verbose` läuft grün für alle drei Dateien
- Kein inline `rollup: { total: ... }` mehr ohne `awaitingDeploy`-Feld in den drei Dateien

---

## Task 3: NavMobile Props-Fix (Gruppe 1 — LanguageSwitcher)

**Ziel:** `Navigation.test.ts` übergibt beim Rendern von `NavMobile` kein `LanguageSwitcher`-Prop. `NavMobile.svelte` erwartet `LanguageSwitcher: any` als Pflichtprop (Dependency Injection, um eager Svelte-Import zu vermeiden). Den Test anpassen, damit das Prop übergeben wird.

**Betroffene Dateien:** `website/src/components/Navigation.test.ts`

**Steps:**

1. In `baseProps` das `LanguageSwitcher`-Prop ergänzen:
   ```typescript
   const baseProps = {
     open: true,
     links: [ ... ],   // unveränderter Bestand
     locale: 'de' as const,
     pathname: '/',
     user: null,
     authChecked: false,
     streamLive: false,
     LanguageSwitcher: null,   // <- hinzufügen: null ist im Test ausreichend (kein Rendering des Switchers getestet)
   };
   ```
   `null` ist zulässig, da `NavMobile.svelte` `LanguageSwitcher` nur bedingt rendert (`{#if LanguageSwitcher}`).

2. Datei bleibt bei 52 Zeilen — Netto-Zuwachs 1 Zeile.

**Acceptance-Kriterien:**
- `cd website && npx vitest run src/components/Navigation.test.ts` läuft ohne Typ-Fehler durch
- `npx astro check` meldet für `Navigation.test.ts` keine TS-Fehler mehr

---

## Task 4: Source-Level Import-Fixes (Gruppe 2 — 7 Dateien)

**Ziel:** Fehlende Vitest-Utilities und `errorResponse`-Importe in sieben Quelldateien ergänzen.

**Betroffene Dateien:**
- `website/src/lib/billing-archive.test.ts`
- `website/src/lib/questionnaire-display.test.ts`
- `website/src/lib/whisper.test.ts`
- `website/src/pages/api/admin/knowledge/collections/[id]/context7.ts`
- `website/src/pages/api/admin/knowledge/collections/[id]/crawl.ts`
- `website/src/pages/api/cron/notify-unread.ts`
- `website/src/lib/factory-floor-types.ts` (nur prüfen — möglicherweise bereits korrekt)

**Steps:**

### billing-archive.test.ts

Die Datei verwendet `vi.mock` und `vi.fn` ohne `vi` zu importieren. Zeile 1 anpassen:

```typescript
// vorher:
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
// nachher:
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
```

### questionnaire-display.test.ts

Die Datei verwendet `vi.mock` und `afterEach` ohne diese zu importieren. Zeile 1 anpassen:

```typescript
// vorher:
import { describe, it, expect } from 'vitest';
// nachher:
import { describe, it, expect, vi, afterEach } from 'vitest';
```

### whisper.test.ts

Die Datei verwendet `afterEach` ohne Import. Zeile 1 anpassen:

```typescript
// vorher:
import { describe, it, expect } from 'vitest';
// nachher:
import { describe, it, expect, afterEach } from 'vitest';
```

### context7.ts

Die Datei ruft `errorResponse(...)` auf, ohne es zu importieren. `_errors.ts` liegt vier Ebenen höher im Pfad:

```typescript
// Importzeile oben in der Datei ergänzen:
import { errorResponse } from '../../../../_errors';
```

Relativer Pfad von `api/admin/knowledge/collections/[id]/` zu `api/_errors.ts`: vier `../` notwendig.

### crawl.ts

Gleiche Situation wie `context7.ts`, gleicher relativer Pfad:

```typescript
import { errorResponse } from '../../../../_errors';
```

### notify-unread.ts

Die Datei ruft `errorResponse(...)` auf Zeile 126 auf, ohne es zu importieren. `_errors.ts` liegt eine Ebene höher:

```typescript
import { errorResponse } from '../_errors';
```

Relativer Pfad von `api/cron/` zu `api/_errors.ts`: ein `../`.

### factory-floor-types.ts

Vor Beginn der Implementierung prüfen: `grep -n "ShippedItem\|AwaitingDeployItem" website/src/lib/factory-floor-types.ts`

Falls die Export-Zeile `export type { ShippedItem, AwaitingDeployItem } from './factory-floor-lanes';` auf Zeile 15 bereits vorhanden ist und `astro check` für diese Datei keinen Fehler meldet, ist keine Änderung erforderlich. Falls die Zeile fehlt, ergänzen.

**Acceptance-Kriterien:**
- `cd website && npx vitest run src/lib/billing-archive.test.ts src/lib/questionnaire-display.test.ts src/lib/whisper.test.ts` grün
- `npx astro check` meldet keine `Cannot find name 'vi'`- oder `errorResponse`-Fehler mehr für diese Dateien

---

## Task 5: Stripe Non-null assertion (Gruppe 3)

**Ziel:** `website/src/pages/stripe/success.astro` verwendet die `stripe`-Variable, die TypeScript als potenziell `undefined` typisiert, da die Initialisierung (z. B. aus einer `if`-Bedingung oder einem optionalen Config-Wert) den Typ auf `never` reduziert. Non-null assertion einsetzen.

**Betroffene Dateien:** `website/src/pages/stripe/success.astro`

**Steps:**

1. Datei lesen und die konkrete Zeile mit `stripe.checkout.sessions.retrieve(...)` oder dem ersten `stripe`-Aufruf identifizieren.

2. Den Aufruf mit Non-null assertion stabilisieren. Typisches Muster auf Zeile 14:
   ```typescript
   // vorher:
   const session = await stripe.checkout.sessions.retrieve(sessionId, { ... });
   // nachher:
   const session = await stripe!.checkout.sessions.retrieve(sessionId, { ... });
   ```
   `stripe!` teilt TypeScript mit, dass die Variable an dieser Stelle garantiert nicht `null`/`undefined` ist. Der Runtime-Guard oben im Frontmatter (z. B. `if (!stripeKey) return Astro.redirect(...)`) stellt das sicher.

3. Falls der Fehler auf einer anderen Zeile liegt, denselben `!`-Operator an der betroffenen Stelle einsetzen.

4. Datei bleibt bei 76 Zeilen — Budget 324 gegenüber dem 400-Zeilen-Limit.

**Acceptance-Kriterien:**
- `npx astro check` meldet keinen `Object is possibly 'undefined'`- oder `never`-Fehler für `success.astro`

---

## Task 6: Astro-Pages Typ-Fixes + Hints aufräumen (Gruppe 4 + 5)

**Ziel:** Verbleibende ~150 TypeScript-Fehler und ~230 ts(6133)-Hints in Admin-Astro-Pages und verwandten `.ts`-Dateien beheben. Zwei Haupt-Muster decken den Großteil ab.

**Betroffene Dateien:** Admin-Pages in `website/src/pages/admin/` und `website/src/pages/api/` — vollständige Liste via `astro check` ermitteln:

```bash
cd website && npx astro check 2>&1 | grep -E "^.*\.astro\(|^.*\.ts\(" | cut -d'(' -f1 | sort -u
```

**Steps:**

### Muster A — `session.locals` ohne Typ

Admin-Pages greifen auf `Astro.locals.requestId`, `Astro.locals.user` etc. zu, ohne den Locals-Typ zu deklarieren. In jeder betroffenen `.astro`-Datei:

```typescript
// Im Frontmatter, direkt nach den bestehenden Imports:
import type { APIContext } from 'astro';
// Dann locals destrukturieren mit explizitem Cast:
const { user, requestId } = Astro.locals as App.Locals;
```

Falls `App.Locals` noch nicht global definiert ist, prüfen ob `website/src/env.d.ts` das Interface enthält:

```typescript
// website/src/env.d.ts — ergänzen falls fehlend:
interface Locals {
  user: import('./lib/auth').SessionUser | null;
  requestId: string;
  authChecked: boolean;
}
```

### Muster B — Ungetypte API-Antworten

API-Handler, die `fetch`-Antworten direkt als spezifischen Typ verwenden:

```typescript
// vorher (TypeScript kann den Response-Body-Typ nicht ableiten):
const data = await res.json();
// nachher (expliziter Cast über unknown):
const data = await res.json() as unknown as ExpectedResponseType;
```

Den korrekten Typ `ExpectedResponseType` aus dem jeweiligen Modul importieren oder lokal definieren.

### Muster C — ts(6133) Hints (unused imports/variables)

In denselben Dateien, die für Muster A/B angepasst werden, alle `ts(6133)`-Hints mitbeheben:

- Unbenutzte Imports entfernen
- Unbenutzte lokale Variablen entfernen oder mit `void`-Cast kennzeichnen, falls absichtlich unbenutzt (`void unusedVar;`)

Für jede Datei in der `astro check`-Ausgabe mit `6133`-Hints die entsprechende Zeile bereinigen.

**Skalierung:** Bei mehr als 20 betroffenen `.astro`-Dateien die Fixes in Batches à 5 Dateien committen, damit diffs reviewbar bleiben.

**Acceptance-Kriterien:**
- `cd website && npx astro check` meldet 0 Fehler (keine Warnings mehr für Gruppe 4+5)
- `cd website && npx vitest run` zeigt keine Regressionen

---

## Task 7: CI-Job + package.json Script

**Ziel:** `astro check` als advisorisches CI-Gate integrieren. Initial nicht in required checks — Promotion nach zwei Wochen grüner Laufzeit.

**Betroffene Dateien:**
- `website/package.json`
- `.github/workflows/ci.yml`

**Steps:**

### website/package.json — Script ergänzen

In den `"scripts"`-Block eine neue Zeile einfügen:

```json
"astro:check": "astro check"
```

Das Script erlaubt lokale Ausführung via `pnpm run astro:check` ohne globales `npx`.

### .github/workflows/ci.yml — Neuer Job

Nach dem bestehenden `vitest`-Job einen neuen Job ergänzen. Der Job läuft im selben Node-Setup wie die anderen Frontend-Jobs. Einzufügen nach dem letzten `website-*`-Job und vor dem `security-scan`-Job:

```yaml
  astro-check:
    name: Astro TypeScript Check (advisory)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: website
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version-file: website/.nvmrc
          cache: pnpm
          cache-dependency-path: website/pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - name: Run astro check
        run: pnpm run astro:check
        continue-on-error: false
```

Der Job ist absichtlich **nicht** in der `needs:`-Liste anderer Jobs — er läuft parallel und blockiert keinen Auto-Merge. Nach zwei Wochen grüner Laufzeit via `task gh:branch-protection:status` prüfen und ggf. in required checks aufnehmen.

**Acceptance-Kriterien:**
- `cd website && pnpm run astro:check` läuft lokal durch
- `.github/workflows/ci.yml` ist valides YAML: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"`
- Der neue `astro-check`-Job erscheint in der CI-Ausgabe bei einem PR, blockiert aber nicht den Auto-Merge

---

## Task 8: Verify

**Ziel:** Vollständige Grün-Verifikation vor dem PR.

**Steps:**

```bash
# 1. Alle Vitest-Tests ausführen (gezielte Domain-Selection via test:changed)
task test:changed

# 2. Generierte Artefakte aktualisieren (test-inventory, repo-index, …)
task freshness:regenerate

# 3. CI-Äquivalent: Freshness + quality:check (S1–S4 Ratchet) + Baseline-Assertion
task freshness:check

# 4. Astro-Check als Haupt-Gate — muss 0 Errors ausgeben
cd website && npx astro check
# Erwartetes Ergebnis: "Found 0 errors."

# 5. CI-YAML validieren
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"

# 6. Manifest-Struktur prüfen (kein neues k8s-Manifest in dieser PR, daher optional)
# task workspace:validate
```

**Acceptance-Kriterien — alle müssen erfüllt sein:**
- `task test:changed` grün (kein Vitest/BATS-Fehler)
- `task freshness:check` grün (keine gewachsenen Baseline-Keys, kein S1/S2/S3/S4-Verstoß)
- `cd website && npx astro check` gibt `Found 0 errors.` aus
- `website/src/data/test-inventory.json` ist aktuell (von `task freshness:regenerate` aktualisiert und committet)
- Die neue Datei `website/src/lib/tickets/__tests__/fixtures.ts` hat ≤ 560 Zeilen (Budget eingehalten)
- Keine Datei aus der File-Structure-Tabelle hat die wirksame Schwelle überschritten
