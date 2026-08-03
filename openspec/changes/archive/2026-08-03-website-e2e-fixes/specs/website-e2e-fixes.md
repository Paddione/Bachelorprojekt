## ADDED Requirements

### Requirement: E2E-Tests vermeiden networkidle-Waits

The system SHALL not rely on `waitForLoadState('networkidle')` in the website E2E tests,
because Astro/Svelte apps maintain WebSocket connections and background polling that prevent
`networkidle` from settling. Tests SHALL use element-specific visibility assertions or
`domcontentloaded` waits instead.

#### Scenario: networkidle ist durch element-spezifische Waits ersetzt

- **GIVEN** ein betroffener E2E-Test nutzt `waitForLoadState('networkidle')`
- **WHEN** der Test geprüft wird
- **THEN** ist der Wait durch eine Sichtbarkeits-Assertion oder `domcontentloaded` ersetzt
- **AND** es bleibt kein `networkidle`-Aufruf in den betroffenen Dateien

### Requirement: Inbox-UI-Tests warten auf Hydration und korrekte Selektoren

The system SHALL wait for the inbox Svelte island to hydrate before querying its children, and
SHALL use selectors that exist in `InboxApp.svelte`. The missing `inbox-search` selector SHALL
be removed or replaced.

#### Scenario: Test wartet auf Hydration des Inbox-Islands

- **GIVEN** ein Inbox-UI-Test wird ausgeführt
- **WHEN** er Kind-Elemente abfragt
- **THEN** wartet er auf `[data-testid="inbox-app"]` sichtbar
- **AND** fragt erst danach die Kinder ab

#### Scenario: Fehlender inbox-search-Selektor ist entfernt oder ersetzt

- **GIVEN** ein Test zielt auf `data-testid="inbox-search"`
- **WHEN** der Selektor geprüft wird
- **THEN** ist er entfernt oder durch einen existierenden ersetzt
- **AND** er referenziert keinen nicht existierenden Test-ID

### Requirement: API-Tests erben die Session aus dem Browser-Kontext

The system SHALL use `page.request` instead of the standalone `request` APIRequestContext in
the M3-onboarding API tests, so that the tests carry the session established by
`loginAsGekko(page)`.

#### Scenario: M3-onboarding-Tests nutzen page.request

- **GIVEN** ein M3-onboarding-Test führt API-Aufrufe aus
- **WHEN** der Request-Kontext geprüft wird
- **THEN** nutzt er `page.request`
- **AND** erbt er die Session aus `loginAsGekko(page)`
