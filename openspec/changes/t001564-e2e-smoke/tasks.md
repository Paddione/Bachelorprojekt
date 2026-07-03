---
title: "E2E-Smoke: Kontaktformular-Tab 'Nachricht' stabilisieren"
ticket_id: T001564
domains: [test, website]
status: active
---

# t001564-e2e-smoke — Implementation Plan

**Ticket:** T001564
**Branch:** `fix/t001564-e2e-smoke`
**Worktree:** `/home/patrick/Bachelorprojekt/tmp/wt-e2e-smoke`
**Spec:** `docs/superpowers/specs/2026-07-03-e2e-smoke-contact-form-tab-design.md`

## File Structure

**Geändert (maximal 2, je nach Diagnose):**
- `tests/e2e/specs/fa-10-website.spec.ts` — robusterer Tab-Selektor, ggf. Timeout-Erhöhung
- `website/src/components/ContactHub.svelte` — ggf. data-testid oder aria-label auf Tab-Button

**Unverändert (SSOT-Schutz):**
- `website/src/pages/kontakt.astro` — keine Änderung
- `tests/e2e/specs/korczewski-home.spec.ts` — muss kompatibel bleiben
- `tests/e2e/playwright.pr.config.ts` — kein CI-Config-Eingriff

## Vorgehen

- [ ] **Task 0: Diagnose — CI-Artifakte analysieren (RED)**
  - CI-Run-Logs/Traces aus dem letzten fehlgeschlagenen `e2e-pr.yml`-Run laden.
  - Identifiziere die exakte Playwright-Error-Message für T5/T6:
    - `locator.click: Timeout` (Element nicht gefunden/unsichtbar)?
    - `locator.click: Interception` (Element covered)?
    - `Timed out waiting for ...` in waitForHydration?
  - **Erwartung für RED-Sanity:**
    ```bash
    # Lokal reproduzieren (gegen web.mentolder.de):
    cd /home/patrick/Bachelorprojekt/tmp/wt-e2e-smoke/tests/e2e
    WEBSITE_URL=https://web.mentolder.de npx playwright test --config playwright.pr.config.ts --grep "FA-10" --project=website
    # expected: T5/T6 FAIL (Tab "Nachricht" nicht erreichbar)
    ```
  - Dokumentiere die Error-Message hier im Plan.

- [ ] **Task 1: Fix anwenden (je nach Diagnose)**
  - **Option A (Accessible Name):** Tab-Button in ContactHub.svelte mit `data-testid="tab-nachricht"` versehen. Test-Selektor auf `page.locator('[data-testid="tab-nachricht"]')` umstellen.
  - **Option B (Hydration):** In fa-10-website.spec.ts die `waitForHydration` auf das ContactHub-spezifische astro-island warten lassen: `await page.waitForSelector('astro-island[component-url*="ContactHub"][ssr]', { state: 'detached', timeout: 15000 })`.
  - **Option C (Timeout):** T5/T6 mit `test.setTimeout(60000)` versehen für langsamere CI-Runner.
  - **Option D (aria-label):** Dem role="tab"-Button in ContactHub.svelte ein explizites `aria-label` geben: `aria-label="02 – Nachricht senden"`.

- [ ] **Task 2: Failing-Test läuft grün (GREEN)**
  - Führe den FA-10-Test erneut gegen web.mentolder.de aus:
    ```bash
    cd /home/patrick/Bachelorprojekt/tmp/wt-e2e-smoke/tests/e2e
    WEBSITE_URL=https://web.mentolder.de npx playwright test --config playwright.pr.config.ts --grep "FA-10" --project=website
    # expected: all tests PASS (inkl. T5/T6)
    ```

- [ ] **Task 3: Regression — korczewski-brand bleibt kompatibel**
  - `korczewski-home.spec.ts` nutzt ebenfalls `getByRole('tab', { name: /Nachricht/i })` in T2.
  - Prüfe, ob der Fix (data-testid/aria-label) den korczewski-Test nicht bricht.
  - Führe den korczewski-Home-Test aus (gegen web.korczewski.de):
    ```bash
    cd /home/patrick/Bachelorprojekt/tmp/wt-e2e-smoke/tests/e2e
    CONTACT_EMAIL=info@korczewski.de WEBSITE_URL=https://web.korczewski.de npx playwright test --config playwright.pr.config.ts --grep "korczewski-home" --project=website
    # expected: T2 PASS (Nachricht-Tab klickbar)
    ```

- [ ] **Task 4: Verifikation — alle Quality-Gates grün (Verify-Task)**
  - `task test:changed` — fokussierte Tests für geänderte Dateien.
  - `task freshness:regenerate && task freshness:check` — generierte Artefakte aktuell.
  - `task workspace:validate` — Kustomize-Manifests valide.
  - `bash scripts/openspec.sh validate` — OpenSpec-Struktur gültig.

> **Verifikations-Resultate:**
> - Task 0 (RED-Sanity): T5 expected FAIL
> - Task 2 (GREEN): T5/T6 expected PASS
> - Task 3 (Regression): korczewski-home T2 expected PASS
> - Task 4: `task test:changed` ✓, `task freshness:check` ✓, `task workspace:validate` ✓, `openspec.sh validate` ✓
