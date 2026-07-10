---
title: "t001748-e2e-page-load-fix — Implementation Plan"
ticket_id: T001748
domains: [tests, website]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t001748-e2e-page-load-fix — Implementation Plan

_Ticket: T001748_

Baut `waitForHydration()` in `tests/e2e/specs/fa-10-website.spec.ts` so um,
dass FA-10 T5/T6 nicht mehr am globalen `astro-island[ssr]`-Count hängen,
wenn die Sidekick/CookieConsent-Inseln langsamer hydratieren. Ersetzt den
globalen Wait durch einen seiten-lokalen Wait auf die Sichtbarkeit des
Kontakt-Tab-Containers und hebt den Test-Timeout für T5/T6 moderat an, um
Runner-Latenz abzufangen.

## File Structure

```
openspec/changes/t001748-e2e-page-load-fix/proposal.md   (neu, bereits authored)
openspec/changes/t001748-e2e-page-load-fix/tasks.md      (neu, dieses File)
openspec/changes/t001748-e2e-page-load-fix/.ticket       (neu, Inhalt: T001748)
tests/e2e/specs/fa-10-website.spec.ts                    (geändert) — waitForHydration-Rewrite + Timeout-Anhebung T5/T6
```

**Nicht angefasst:**
- `website/src/pages/kontakt.astro` (keine UI-Änderung)
- `website/src/layouts/Layout.astro` (keine `client:load` → `client:idle`-Umstellung)
- `website/src/components/ContactHub.svelte` (keine Komponenten-Änderung)
- `tests/e2e/specs/korczewski-home.spec.ts` (anderes Spec, eigener Wait)
- `.github/workflows/e2e-pr.yml` (keine Workflow-Änderung)

---

## Task 1 — `waitForHydration()` umbauen auf seiten-lokales Signal

**Failing-Symptom (RED):**

Im aktuellen Branch ist `waitForHydration()` weiterhin der globale Wait
auf `document.querySelectorAll('astro-island[ssr]').length === 0` mit
8 s Timeout. Reproduktion auf der Worktree-CLI gegen `web.mentolder.de`
oder via GitHub Actions PR-Run:

```bash
# RED: T5/T6 scheitern reproduzierbar an globaler Hydration-Assertion
cd /home/patrick/Bachelorprojekt
npx playwright test --project=website \
  --grep '@smoke' tests/e2e/specs/fa-10-website.spec.ts \
  -x
# expected: FAIL — 2 failed, beide mit
#   "page.waitForFunction: Test timeout of 30000ms exceeded"
#   in tests/e2e/specs/fa-10-website.spec.ts:12:14 (waitForHydration)
```

**Fix (GREEN):**

In `tests/e2e/specs/fa-10-website.spec.ts` den Helper so umbauen, dass er
auf die Sichtbarkeit des Kontakt-Tab-Containers wartet (das ist ein
Svelte-Template-only-Element, das nur nach erfolgreicher Hydration der
`ContactHub`-Insel im DOM steht):

```ts
/**
 * Wait for the /kontakt ContactHub island to finish hydration by waiting
 * for the tablist to become visible. This is page-local: the tablist is
 * rendered by the Svelte component (not the SSR markup), so its
 * visibility proves the island has mounted. We deliberately do NOT wait
 * for `astro-island[ssr]` to disappear globally, because the global
 * PortalSidekick/CookieConsent islands on this page hydrate later and
 * would race the test (T001748).
 */
async function waitForHydration(page: Page) {
  await page
    .getByRole('tablist', { name: /wie möchten sie kontakt aufnehmen/i })
    .waitFor({ state: 'visible', timeout: 15_000 });
}
```

Drei Punkte zur Begründung im Code-Kommentar:
1. **Warum nicht global `astro-island[ssr]`:** Sidekick und CookieConsent
   tragen den `ssr`-Marker erfahrungsgemäß länger als die seiten-spezifische
   Kontaktinsel (siehe CI-Lauf gh 29051222891, 2026-07-09 21:23 UTC).
2. **Warum Tablist:** `[role="tablist"]` ist im SSR-HTML nicht vorhanden —
   das `role`-Attribut wird erst von der Svelte-Komponente nach Hydration
   gesetzt. Sichtbarkeit ⇒ Hydration abgeschlossen.
3. **Warum 15 s:** Konservativ oberhalb des gemessenen P95 (8 s reicht
   lokal, in CI wurden bis 14 s beobachtet), aber unter dem 30 s
   Test-Default, damit der Test bei tatsächlich hängender Hydration
   weiterhin mit klarem Timeout fehlschlägt.

Verify: `waitForHydration` enthält die neue Implementierung (kein
`document.querySelectorAll('astro-island[ssr]')` mehr drin):

```bash
# Sanity: kein direkter astro-island-Query mehr im Helper
grep -n "astro-island" tests/e2e/specs/fa-10-website.spec.ts \
  || echo "OK: kein astro-island-Query mehr in der Spec"
```

## Task 2 — Test-Timeouts für T5 und T6 moderat anheben

T5 und T6 sollen einen explizit größeren Test-Timeout bekommen, damit ein
gelegentlicher 12–14 s Hydration-Peak im CI-Runner nicht zum Test-Verlust
führt, der globale `test.describe.configure({ retries: 1 })` bleibt aber
unverändert (kein Retries=2, das würde andere FA-10-Tests künstlich
aufblähen).

```ts
test('T5: Contact form has all required fields', async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto(`${BASE}/kontakt`);
  await waitForHydration(page);
  // ... rest unverändert ...
});

test('T6: Valid form submission succeeds', async ({ page }) => {
  test.setTimeout(60_000); // Submit + Roundtrip kann unter Last länger dauern
  // ... rest unverändert ...
});
```

T7 (Sidebar) bleibt beim Default-Timeout (30 s), weil dort kein
Hydration-Wait verwendet wird.

## Task 3 — Verifikation: Targeted Run + 10×-Stabilitäts-Probe

**Targeted Smoke-Run:**

```bash
cd /home/patrick/Bachelorprojekt
npx playwright test --project=website \
  --grep '@smoke' tests/e2e/specs/fa-10-website.spec.ts \
  --reporter=line
# expected: 7 passed (T1, T2, T3, T4, T5, T6, T7) — keine Timeouts in waitForHydration
```

**Stabilitäts-Probe (10 sequentielle Läufe gegen `web.mentolder.de`):**

```bash
# Vorbereitung: env vars aus .env (siehe tests/e2e/.env)
set -a; source tests/e2e/.env; set +a
for i in $(seq 1 10); do
  npx playwright test --project=website \
    --grep '@smoke' tests/e2e/specs/fa-10-website.spec.ts \
    --reporter=line 2>&1 | tail -3
done
# expected: 10/10 Runs enden mit "7 passed" — kein einziger T5/T6-Hydration-Timeout
```

Falls die 10×-Probe auch nur einmal rot wird, ist der Fix unvollständig
und die Sidekick-Hydration-Diskussion (eigenes Ticket) ist zu eröffnen.

## Task 4 — Final Verification (CI-Gates)

```bash
task test:changed
# Erwartet: alle FA-10-relevanten Vitest + Playwright-Targets grün;
#   website/src/data/test-inventory.json regeneriert (falls Touchpoints neu sind)

task freshness:regenerate
task freshness:check
# Erwartet: keine Drift; die OpenSpec-Status-Map zeigt
#   "T001748": [{ "slug": "t001748-e2e-page-load-fix", "status": "plan_staged" }]
```

Vor dem PR-Open:
```bash
git status            # nur tests/e2e/specs/fa-10-website.spec.ts + openspec/...
git diff --stat       # Diff-Übersicht
```

PR-Titel: `test(e2e): [T001748] make FA-10 T5/T6 hydration wait local to ContactHub`
