## ADDED Requirements

Diese Delta-Spec ergänzt die SSOT `openspec/specs/e2e.md` um eine Änderung
am `waitForHydration()`-Helper im FA-10-Testspec. Die bestehende
Hydration-Wartelogik wird durch ein seiten-lokales Warten auf die
Kontakt-Insel-Sichtbarkeit ersetzt.

### Requirement: Kontakt-Insel-Hydration wird seiten-lokal erkannt

The FA-10 spec SHALL NOT depend on a global `astro-island[ssr]`-count
becoming zero across the entire page. The `waitForHydration()` helper
SHALL wait for a hydration signal that is local to the `/kontakt`
ContactHub island.

#### Scenario: Tablist erscheint nach page.goto

- **GIVEN** der Browser hat `${BASE}/kontakt` geladen
- **WHEN** `waitForHydration(page)` aufgerufen wird
- **THEN** wartet der Helper maximal 15 s darauf, dass `getByRole('tablist', { name: /wie möchten sie kontakt aufnehmen/i })` sichtbar wird
- **AND** der Helper löst nicht früher aus, weil andere Astro-Inseln noch `astro-island[ssr]` tragen

#### Scenario: Test-Timeout steigt auf 45 s für T5/T6

- **GIVEN** die Kontakt-Insel hydratet unter normaler Runner-Last in ≤8 s
- **WHEN** der CI-Runner die T5/T6-Tests unter hoher Last ausführt
- **THEN** bleibt der Test-Timeout großzügig genug (45 s pro Test), sodass ein gelegentlicher 10–14 s Hydration-Peak nicht zum Test-Verlust führt

### Requirement: T6-Submit-Pfad bleibt mit E2E-Markern deterministisch

The FA-10 T6 test SHALL continue to use the existing
`page.route('**/api/contact', …)` interceptor and the `X-E2E-Test` /
`X-Cron-Secret` headers, and SHALL NOT silently drop the
`test.skip(!cronSecret, …)` guard.

#### Scenario: T6-Submit mit gesetztem CRON_SECRET

- **GIVEN** `process.env.CRON_SECRET` ist gesetzt
- **WHEN** T6 das Kontaktformular ausfüllt und abschickt
- **THEN** erscheint innerhalb von 30 s ein `.cf-result.is-success`-Element mit Text `/Vielen Dank/`
- **AND** der resultierende Inbox-Datensatz ist mit `is_test_data=true` markiert

#### Scenario: T6 ohne CRON_SECRET wird sauber übersprungen

- **GIVEN** `process.env.CRON_SECRET` ist nicht gesetzt
- **WHEN** T6 läuft
- **THEN** wird der Test mit `test.skip(!cronSecret, …)` als `skipped` markiert, nicht als `passed` und nicht als `failed`
