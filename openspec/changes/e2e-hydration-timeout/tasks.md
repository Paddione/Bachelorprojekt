---
title: "E2E T5/T6 fa-10-website: hydration wait times out against web.mentolder.de"
ticket_id: T001785
domains: [website, tests]
status: active
file_locks: [tests/e2e/specs/fa-10-website.spec.ts, website/src/layouts/Layout.astro]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: [t001748-e2e-page-load-fix]
---

# e2e-hydration-timeout — Implementation Plan

**Ticket:** T001785  
**Branch:** `fix/t001785-e2e-hydration-timeout`  
**Vorgänger:** T001748 (#2715) — testseitiger Fix war unzureichend, Root-Cause liegt im Live-Site-JS

## File Structure

```
openspec/changes/e2e-hydration-timeout/proposal.md   (neu)
openspec/changes/e2e-hydration-timeout/tasks.md      (neu, dieses File)
tests/e2e/specs/fa-10-website.spec.ts                (geändert) — resilienterer Wait + Console-Capture
website/src/layouts/Layout.astro                     (möglicherweise) — abhängig von Diagnose
website/src/components/PortalSidekick.svelte          (möglicherweise) — abhängig von Diagnose
```

---

## Task 1 — Diagnose: Welche Astro-Insel scheitert an der Hydration?

**expected: FAIL** — im aktuellen Zustand schlägt `waitForHydration()` fehl, weil
`astro-island[ssr]` auf der Live-Seite nie verschwindet.

**Diagnose-Schritt 1a: Playwright-Konsolen-Capture-Diagnose**

Baue einen temporären Diagnose-Test, der auf `web.mentolder.de/kontakt` navigiert,
`page.on('console')` und `page.on('pageerror')` aufzeichnet und nach 20 s ein
Screenshot + Console-Dump ausgibt — OHNE auf Hydration zu warten:

```ts
test('DIAG: Kontaktseite Console-Errors erfassen', async ({ page }) => {
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
    if (msg.type() === 'warning') warnings.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(`${BASE}/kontakt`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(20_000);
  console.log('=== CONSOLE ERRORS ===');
  errors.forEach((e) => console.log(`  ERROR: ${e}`));
  console.log('=== CONSOLE WARNINGS ===');
  warnings.forEach((w) => console.log(`  WARN: ${w}`));
  // SSR-Inseln zählen, die noch nicht hydratet sind
  const unhydrated = await page.evaluate(() =>
    document.querySelectorAll('astro-island[ssr]').length
  );
  console.log(`=== UNHYDRATED ISLANDS: ${unhydrated} ===`);
  // Namen der unhydrated Inseln (component-name Attribut)
  const names = await page.evaluate(() =>
    Array.from(document.querySelectorAll('astro-island[ssr]'))
      .map((el) => el.getAttribute('component-name') || el.getAttribute('component-export') || '(unknown)')
  );
  console.log(`Unhydrated components: ${names.join(', ')}`);
  await page.screenshot({ path: 'diag-kontakt.png', fullPage: true });
});
```

**Lokaler Run:**
```bash
cd /home/patrick/Bachelorprojekt
WEBSITE_URL=https://web.mentolder.de npx playwright test \
  --project=website -g "DIAG: Kontaktseite Console-Errors erfassen" \
  tests/e2e/specs/fa-10-website.spec.ts \
  --reporter=list
```

Das Ergebnis zeigt:
1. Welche Komponenten noch `astro-island[ssr]` tragen
2. Welche JS-Fehler in der Console auftauchen (Missing Chunk? TypeError? CSP-Block?)
3. Welche Network-Requests fehlschlagen (Chunk 404?)

**Diagnose-Schritt 1b: Network-Tab-Capture (nur Chunk-Fehler)**

Erweitere den DIAG-Test um Network-Response-Capture für fehlgeschlagene JS-Chunks:

```ts
page.on('response', (resp) => {
  if (!resp.ok() && resp.url().includes('/_astro/')) {
    console.log(`FAILED CHUNK: ${resp.status()} ${resp.url()}`);
  }
});
```

**Erwartete Diagnose-Ergebnisse (Hypothese):**

Basierend auf dem Befund aus T001785 und T001748:
- **Hypothese A:** Ein JS-Chunk fehlt (404) im prod-Build von `web.mentolder.de` —
  z.B. ein dynamischer Import aus `agent-guide-harness`, den der Build nicht
  mitkompiliert hat.
- **Hypothese B:** Ein Runtime-Error in einer shared Dependency (PortalSidekick,
  central-logging) crasht die gesamte Hydration-Kette — Astro bricht ab und
  markiert die Insel nicht als hydratet.
- **Hypothese C:** Die Seite lädt ein veraltetes Service-Worker-Cache-Bundle,
  das gegen den neuen Build inkonsistent ist.
- **Hypothese D:** CSP-Header auf `web.mentolder.de` blockieren ein benötigtes
  Inline-Script oder einen dynamischen Import.

**Entscheidungsmatrix nach Diagnose:**

| Befund | Fix |
|--------|-----|
| Chunk 404 | Task 2a — Astro-Build / Rollup-Config prüfen |
| Runtime-Error in Sidekick | Task 2b — Fehler isolieren + Error-Boundary |
| CSP-Block | Task 2c — CSP-Header anpassen |
| Alle Inseln hydraten (Test-Stabilität) | Task 2d — Playwright-Wait robuster machen |

---

## Task 2 — Fix abhängig von Diagnose-Ergebnis

Nur EINER der folgenden Subtasks wird aktiv — je nachdem, was Task 1 ergibt:

### Task 2a — Fehlenden JS-Chunk fixen (Hypothese A)

**Wenn:** Ein `/_astro/*.js`-Chunk 404 liefert (`response.ok() === false`).

Dann:
1. Prüfen, ob der fehlende Chunk in `website/dist/` existiert (lokal `task website:build`).
2. Prüfen, ob `website/astro.config.mjs` ein `rollupOptions.external` oder
   `vite.ssr.noExternal` den Import ausschließt.
3. Fix: `astro.config.mjs` ergänzen — entweder `vite.ssr.noExternal` um das
   fehlende Package erweitern, oder `rollupOptions.output.inlineDynamicImports`
   für kleine Bundles setzen.
4. Build-Test: `task website:build` + Check `dist/_astro/` auf den Chunk.
5. Nach Deploy: erneuter DIAG-Test-Lauf → erwartet: alle Inseln hydratet,
   keine Chunk-404.

```
website/astro.config.mjs                    (geändert)
```

**Datei-Länge Check:**
```bash
wc -l website/astro.config.mjs
# Baseline prüfen:
jq -r '."S1:website/astro.config.mjs".metric // "nicht-baselined"' docs/code-quality/baseline.json
```

### Task 2b — Runtime-Error in Komponente isolieren + fixen (Hypothese B)

**Wenn:** Ein `pageerror` oder console.error zeigt einen TypeError/ReferenceError
in `PortalSidekick.svelte`, `central-logging`, `agent-guide-harness` oder einer
anderen gebündelten Dependency.

Dann:
1. Root-Cause im Quellcode der betroffenen Komponente identifizieren.
2. Fix anwenden (Type-Guard, Null-Check, fehlenden Import ergänzen).
3. **Error-Boundary:** Erwäge `client:load`-Inseln mit einem Error-Boundary-Wrapper
   zu versehen, damit ein Crash in einer Insel die anderen nicht blockiert.
   Astro unterstützt kein natives Error-Boundary — stattdessen einen Svelte
   `<ErrorBoundary>` um die Insel-Komponente legen.
4. Lokal testen: `task website:build && task website:dev` + Debug-Konsole prüfen.

```
website/src/components/PortalSidekick.svelte    (möglicherweise)
website/src/components/ErrorBoundary.svelte     (neu — falls Error-Boundary-Ansatz)
```

### Task 2c — CSP-Header anpassen (Hypothese D)

**Wenn:** Console zeigt CSP-Verletzungen (`Refused to load the script` für
einen `/_astro/`-Chunk).

Dann: CSP-Header im Deployment-Manifest oder in der Traefik-Middleware anpassen,
sodass `script-src` (oder `worker-src`) den Chunk-Pfad erlaubt.

```
k3d/configmap-domains.yaml                     (möglicherweise)
k3d/middleware-csp.yaml                         (möglicherweise)
prod-fleet/mentolder/middleware-csp.yaml        (möglicherweise)
```

### Task 2d — Playwright-Wait robuster machen (Hypothese A+B+D ausgeschlossen)

**Wenn:** Die Diagnose ergibt, dass ALLE Inseln hydraten, aber der Playwright-Wait
trotzdem sporadisch timeoutet. Dann:

1. `waitForHydration()` in `tests/e2e/specs/fa-10-website.spec.ts` gegen einen
   hybriden Ansatz austauschen: warte auf Tablist ODER warte max 20 s auf
   `astro-island[ssr]`-Verschwinden — je nachdem, was zuerst eintritt.
2. Zusätzlich `page.waitForLoadState('networkidle')` vor dem Hydration-Wait
   einfügen, damit lazy-chunked Dependencies nicht die Hydration blockieren.

```ts
async function waitForHydration(page: Page) {
  await page.waitForLoadState('networkidle');
  await Promise.race([
    page.getByRole('tablist', { name: /wie möchten sie kontakt aufnehmen/i })
      .waitFor({ state: 'visible', timeout: 20_000 }),
    page.waitForFunction(
      () => document.querySelectorAll('astro-island[ssr]').length === 0,
      { timeout: 20_000 }
    ),
  ]);
}
```

3. Timeout für T5/T6 von 45 s auf 60 s erhöhen, um der verlängerten
   `networkidle`-Phase Rechnung zu tragen.

```
tests/e2e/specs/fa-10-website.spec.ts           (geändert)
```

---

## Task 3 — 10×-Stabilitätsprobe gegen `web.mentolder.de`

Nach dem Fix (welcher Task 2-Pfad auch immer aktiv war):

```bash
cd /home/patrick/Bachelorprojekt
set -a; source tests/e2e/.env; set +a
for i in $(seq 1 10); do
  echo "=== Run $i ==="
  WEBSITE_URL=https://web.mentolder.de npx playwright test \
    --project=website tests/e2e/specs/fa-10-website.spec.ts \
    --reporter=line 2>&1 | tail -5
done
```

**expected:** 10/10 Runs enden mit "7 passed" — kein T5/T6-Hydration-Timeout.
Ein einzelner Failure ist akzeptabel (Runner-Latenz), zwei oder mehr bedeuten:
der Fix ist unzureichend, zurücksetzen und Diagnose vertiefen.

---

## Task 4 — Final Verification (CI-Gates)

```bash
task test:changed
# Erwartet: alle FA-10-relevanten Tests grün

task freshness:regenerate
task freshness:check
# Erwartet: keine Drift

task workspace:validate
# Erwartet: kustomize dry-run grün (falls Manifeste geändert)
```

Vor dem PR-Open:
```bash
git status
git diff --stat
```

PR-Titel: `fix(e2e): [T001785] resolve hydration timeout on web.mentolder.de/kontakt`
