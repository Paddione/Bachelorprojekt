## ADDED Requirements

### Requirement: Das KI-Deck führt genau eine Phase→Modell-Tabelle

Das KI-Deck zeigt die Zuordnung von Factory-Phasen zu Modellen an genau einer Stelle. Zwei
Oberflächen für dieselbe Entscheidung sind der Fehlerfall, den diese Anforderung ausschließt —
nicht nur eine Frage der Übersicht: von den beiden bisherigen Tabellen wurde nur eine je von
Runtime-Code gelesen, sodass die andere Wirkung versprach, die sie nicht hatte.

The KI deck (`decks/DeckKi.svelte`) SHALL render exactly one phase→model table, sourced from
`tickets.provider_config`. The `FactoryModelSlots` component and the `tickets.factory_model_slots`
table SHALL NOT exist. The read-only "effective resolution per phase" block previously rendered
inside `LlmProxyPanel` SHALL NOT exist as a separate block; the single table SHALL instead carry
the effective resolution as a column beside the configured assignment.

#### Scenario: The deck renders one phase table

- **GIVEN** an admin opens `/sdlc/cockpit?deck=ki`
- **WHEN** the deck has finished loading
- **THEN** exactly one component renders phase→model rows
- **AND** that table shows, per phase, both the configured assignment and what the proxy would
  currently serve

#### Scenario: The retired slot surface is gone

- **GIVEN** the repository sources
- **WHEN** they are searched for the retired slot surface
- **THEN** no component file `FactoryModelSlots.svelte` exists
- **AND** no code references the table `tickets.factory_model_slots`

#### Scenario: Configured and effective values are distinguishable

- **GIVEN** a phase whose configured model is served by no reachable backend
- **WHEN** the table renders that row
- **THEN** the configured value stays visible and is marked as not currently available
- **AND** the row does not silently display a substitute as if it were the configuration

### Requirement: Der Factory-Default ist im KI-Deck sichtbar und setzbar

Der Default, mit dem jeder Factory-Lauf sein Modell pinnt, liegt in `scripts/llm/loadouts.json`
(`factory.model`) und war im Cockpit bisher weder sichtbar noch änderbar. Er wird über den Proxy
verwaltet, nicht über die Datenbank — eine Spiegelung in die DB würde eine zweite Wahrheit neben
der Datei schaffen.

The website SHALL expose the factory default model through a route
`/sdlc/api/llm-proxy/factory` that passes `GET`/`PUT /admin/factory` through to the llm-proxy,
under the same admin guard as the other proxy routes. The route SHALL carry the proxy's `mtimeMs`
optimistic-locking value in both directions and SHALL surface the proxy's `409` for a stale write
as a distinguishable conflict rather than a generic failure. The KI deck SHALL present the factory
default as the head row of the phase table, offering the models the proxy reports as selectable.

#### Scenario: Admin changes the factory default

- **GIVEN** an admin opens the KI deck while the proxy is running
- **WHEN** they select a different factory default model
- **THEN** the change is written through to the proxy and the deck shows the new value

#### Scenario: A concurrent write is not silently overwritten

- **GIVEN** the loadouts file changed after the deck loaded its value
- **WHEN** the admin saves the factory default
- **THEN** the proxy rejects the stale write and the deck reports the conflict as such,
  naming that the value changed elsewhere

#### Scenario: An offline proxy is stated, not disguised

- **GIVEN** the llm-proxy does not answer
- **WHEN** the deck renders the factory default row
- **THEN** the row states that the proxy is unreachable and offers no write action
- **AND** it does not render as an empty or unset value

### Requirement: Die Modellauswahl kennt die Modelle des Proxy

Eine Auswahlliste, die nur die Datenbank kennt, verschweigt, was der Proxy tatsächlich anbietet;
eine, die nur den Proxy kennt, lässt eine gesetzte Zuordnung bei unerreichbarem Proxy gelöscht
aussehen. Beide Fehler schließt diese Anforderung aus.

The model choices offered in the KI deck SHALL be the union of the models discovered by the
llm-proxy (`/sdlc/api/llm-proxy/status`, `backends[].models`) and the models configured in
`tickets.provider_config`, deduplicated. An entry that is configured but served by no reachable
backend SHALL remain in the list and SHALL be marked as unavailable.

#### Scenario: A newly loaded proxy model is selectable

- **GIVEN** the proxy reports a model that no `provider_config` row mentions
- **WHEN** the deck builds its choices
- **THEN** that model is selectable

#### Scenario: A configured model outlives its backend

- **GIVEN** a `provider_config` row whose model no reachable backend serves
- **WHEN** the deck builds its choices
- **THEN** the model is still listed and marked unavailable
- **AND** the phase that references it keeps showing it as its configured value

## MODIFIED Requirements

### Requirement: Satellite Absorption Redirects

Absorbiert eine Etappe den Inhalt einer Satellitenseite in den Leitstand, stirbt die Seite und
ihr Pfad leitet auf die entsprechende Leitstand-Selektion um; Cockpit-Redirect-Ziele verwenden
ausschließlich das Leitstand-URL-Schema.

The system SHALL redirect absorbed satellite pages via the middleware redirect map:
`/sdlc/repohealth` → `/sdlc/cockpit?deck=qualitaet`, `/sdlc/prompts` →
`/sdlc/cockpit?deck=wissen`, `/sdlc/ki-konfiguration` → `/sdlc/cockpit?deck=ki`; the
corresponding `.astro` pages SHALL be removed. The PromptLibraryManager module SHALL be reachable
inside its deck. The redirect target of an absorbed page SHALL remain valid when its module is
later retired, because the target addresses the deck, not the module. Every redirect-map target
that points at `/sdlc/cockpit` SHALL use only the Leitstand URL scheme (`station`, `ticket`,
`deck`) — no `?tab=` targets remain. Navigation sources SHALL NOT keep links to removed pages.

#### Scenario: Absorbed page redirects to its deck

- **GIVEN** a request to `/sdlc/repohealth`
- **WHEN** the middleware resolves the path
- **THEN** the response is a 301 redirect to `/sdlc/cockpit?deck=qualitaet`
- **AND** no page file `pages/sdlc/repohealth.astro` exists

#### Scenario: No stale tab vocabulary

- **GIVEN** the redirect map
- **WHEN** its cockpit-targeting entries are inspected
- **THEN** none of them contains a `tab=` query parameter

#### Scenario: A retired module leaves its redirect intact

- **GIVEN** the `KiKonfiguration` module has been removed from the KI deck
- **WHEN** a request to `/sdlc/ki-konfiguration` is resolved
- **THEN** the response is still a 301 redirect to `/sdlc/cockpit?deck=ki`
- **AND** the deck renders without that module
