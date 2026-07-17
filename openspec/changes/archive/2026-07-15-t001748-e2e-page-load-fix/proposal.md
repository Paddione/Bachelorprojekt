---
ticket_id: T001748
---

# Proposal: t001748-e2e-page-load-fix

## Why

Im E2E-PR-Workflow (`E2E (PR — gefiltert)`, Smoke + `@smoke` Tag gegen
`https://web.mentolder.de`) sind seit dem 2026-07-08 in mehreren Läufen die
beiden FA-10-Kontaktformular-Tests `T5: Contact form has all required fields`
und `T6: Valid form submission succeeds` flaky. Beide hängen am gemeinsamen
Helper `waitForHydration()` in `tests/e2e/specs/fa-10-website.spec.ts:11-16`,
der mit `page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0, { timeout: 8000 })`
auf den Verlust des `ssr`-Attributs auf **allen** `<astro-island>`-Elementen
der Seite wartet.

Konkret: auf `/kontakt` enthält das von `Layout.astro` gerenderte Grundgerüst
heute vier `client:load`-Inseln — `Navigation` (Layout-Z. 94), `CookieConsent`
(Layout-Z. 101), `PortalSidekick` (Layout-Z. 102) und `ContactHub`
(`kontakt.astro` Z. 71). Der Sidekick ist auf jeder Live-Seite aktiv und
hydratet erfahrungsgemäß später als die seiten-spezifische Kontaktinsel
(Sidekick öffnet zusätzliche WebSocket-/log-bus-Abhängigkeiten aus
`central logging sidekick widget`, `terminal sidekick` und
`agent-guide-harness` Patches der letzten Wochen). Im aktuellen
`feature/agent-model-slots`-PR-Lauf (gh run 29051222891, 21:23 UTC) lief
`astro-island[ssr]` auch nach 30 s Test-Timeout nicht leer, beide Retries
scheiterten mit `page.waitForFunction: Test timeout of 30000ms exceeded`,
obwohl der DOM-Snapshot zeigt, dass die Kontakt-Insel selbst längst
hydratet und interaktiv ist (Tablist "Wie möchten Sie Kontakt aufnehmen?"
sichtbar, Tabs mit Rollen `tab` gerendert, Sidekick-Dialog offen — die Seite
ist offensichtlich ready, der globale Wait ist es nicht).

Im gleichen Zeitraum sind FA-10 T5/T6 in anderen Live-Production-Läufen
(gh run 29042056229, 18:50 UTC, mentolder Job) **grün** — es ist also ein
E2E-Test-Flake, kein Regressions-Bug im Website-Code und kein dauerhafter
Build-Bruch. Der `feature/agent-model-slots`-PR selbst fasst weder die
Kontaktseite noch den FA-10-Spec an; das Playwright-Run geht gegen das
bereits ausgerollte `web.mentolder.de` und bricht am globalen
`astro-island[ssr]`-Wait.

## What

Den `waitForHydration()`-Helper so umbauen, dass er nicht mehr auf das
globale Verschwinden von `astro-island[ssr]` auf der gesamten Seite
wartet (was wegen `PortalSidekick`/`CookieConsent` race-anfällig ist),
sondern auf ein **spezifisches, sichtbar-interaktives Signal der
Kontakt-Insel** selbst — den Tabs-Container `[role="tablist"]` (oder
einen `data-testid` auf der Insel) plus ein optionales
`networkidle`-Settling. Timeout von 8 s auf 15 s anheben, um der
GitHub-Actions-Runner-Latenz Rechnung zu tragen, ohne den Test unnötig
lang zu machen. Sichtbarkeit/Hydration der Tabs garantiert, dass die
Svelte-Komponente in `ContactHub` vollständig gemountet ist (Tabs werden
ausschließlich im Svelte-Template gerendert, nicht im SSR-Markup).

Explizit **nicht** im Scope: kein Entfernen oder Deaktivieren der
betroffenen Tests, kein Umbau von `Layout.astro`/`kontakt.astro` selbst
(kein Wechsel von `client:load` auf `client:idle` o.ä. — das ist eine
eigenständige Diskussion um Sidekick-Hydration-Latenz und gehört in
ein separates Ticket), keine Anpassung am CI-Workflow
`.github/workflows/e2e-pr.yml`.

## Purpose

Der automatische E2E-Test `FA-10` (Kontaktformular) soll auf
`web.mentolder.de` und `web.korczewski.de` deterministisch in unter 10 s
grün werden, unabhängig davon, wie spät die globalen
`PortalSidekick`/`CookieConsent`-Inseln hydratieren. Konkret: die
beiden Tests `T5` (Formular-Strukturprüfung) und `T6` (POST-Submit mit
E2E-Markern) sollen in 10 aufeinanderfolgenden Läufen des E2E-PR-Workflows
kein einziges Mal mehr an `waitForHydration` scheitern, und der
gesamte FA-10-`test.describe`-Block soll im Live-Production-Lauf nicht
durch einen Hydration-Timeout rot werden.

## Requirements

### Requirement: Kontakt-Insel-Hydration wird seiten-lokal erkannt

The FA-10 spec SHALL NOT depend on a global `astro-island[ssr]`-count
becoming zero across the entire page. The `waitForHydration()` helper
SHALL wait for a hydration signal that is local to the `/kontakt`
ContactHub island — specifically: visibility of the ContactHub
tablist (a `[role="tablist"]` element inside the `<main>` landmark, or
the `data-testid="tab-nachricht"` element introduced in PR
`test: T001634 flaky E2E tests — use data-testid`).

#### Scenario: Tablist erscheint nach page.goto

- **GIVEN** der Browser hat `${BASE}/kontakt` geladen
- **WHEN** `waitForHydration(page)` aufgerufen wird
- **THEN** wartet der Helper maximal 15 s darauf, dass `getByRole('tablist', { name: /wie möchten sie kontakt aufnehmen/i })` sichtbar wird
- **AND** der Helper löst **nicht** früher, nur weil andere Astro-Inseln der Seite (Sidekick, CookieConsent, Navigation) noch `astro-island[ssr]` tragen

#### Scenario: Test-Timeout steigt auf 45 s für T5/T6

- **GIVEN** die Kontakt-Insel hydratet unter normaler Runner-Last in ≤8 s
- **WHEN** der CI-Runner die T5/T6-Tests unter hoher Last ausführt
- **THEN** bleibt der Test-Timeout großzügig genug (45 s pro Test), dass ein gelegentlicher 10–14 s Hydration-Peak nicht zum Test-Verlust führt
- **AND** der globale `test.describe.configure({ retries: 1 })`-Default bleibt erhalten — kein Retries=2

#### Scenario: T5 nutzt die stabile Insel-Sichtbarkeit als Vorbedingung

- **GIVEN** die Kontakt-Insel ist noch nicht hydratet (Tablist fehlt im DOM)
- **WHEN** T5 `getByTestId('tab-nachricht').click()` aufruft
- **THEN** schlägt der Klick mit `element is not visible / not found` klar diagnostizierbar fehl (nicht erst nach 30 s Timeout in `waitForHydration`)

### Requirement: T6-Submit-Pfad bleibt mit E2E-Markern deterministisch

The FA-10 T6 test SHALL continue to use the existing
`page.route('**/api/contact', …)` interceptor and the `X-E2E-Test` /
`X-Cron-Secret` headers, and SHALL NOT silently drop the
`test.skip(!cronSecret, …)` guard introduced for T001453.

#### Scenario: T6-Submit mit gesetztem CRON_SECRET

- **GIVEN** `process.env.CRON_SECRET` ist gesetzt
- **WHEN** T6 das Kontaktformular ausfüllt und "nachricht senden" klickt
- **THEN** erscheint innerhalb von 30 s ein `.cf-result.is-success`-Element mit Text `/Vielen Dank/`
- **AND** der resultierende Inbox-Datensatz ist mit `is_test_data=true` markiert

#### Scenario: T6 ohne CRON_SECRET wird sauber übersprungen

- **GIVEN** `process.env.CRON_SECRET` ist nicht gesetzt
- **WHEN** T6 läuft
- **THEN** wird der Test mit `test.skip(!cronSecret, …)` als `skipped` markiert, **nicht** als `passed` und **nicht** als `failed`

## Impact

- **Test-Datei (geändert):** `tests/e2e/specs/fa-10-website.spec.ts` — `waitForHydration()` umbauen, Test-Timeouts für T5/T6 anheben, Datenpunkt-Selektor auf `[role="tablist"]` oder `data-testid="tab-nachricht"` umstellen.
- **Keine Website-Code-Änderungen:** weder `website/src/pages/kontakt.astro` noch `website/src/layouts/Layout.astro` noch `website/src/components/ContactHub.svelte` werden angefasst — der Fix ist testseitig.
- **Beide Brands betroffen:** `mentolder` (default CI-Run, `WEBSITE_URL=https://web.mentolder.de`) und `korczewski` (Matrix-Job, `WEBSITE_URL=https://web.korczewski.de`) — die `BASE` in der Spec wechselt per `process.env.WEBSITE_URL`; der Fix wirkt für beide.
- **CI-Workflows:** keine Änderung an `.github/workflows/e2e-pr.yml` oder `.github/workflows/e2e.yml`. Falls nach dem Fix weiterhin gelegentliche Timeouts auftreten, wird das im Follow-up behandelt (Sidekick-Hydration isolieren).
- **Reproduzierbarkeit:** Beweis-CI-Lauf mit dem Fix wird als `task test:changed`-kompatibel angeführt — der `feature/agent-model-slots`-PR (gh run 29051222891) ist der Repro-Run, der die T5/T6-Doppelfailure ausgelöst hat.

_Ticket: T001748_
