## ADDED Requirements

### Requirement: The SDLC redirect map contains only live destinations

The middleware redirect map SHALL map each legacy `/admin/*` SDLC route to a destination that exists in the current SDLC build. Dead-end chains SHALL be removed: a route whose target is itself only a redirect SHALL NOT appear in the map (the middleware does not forward query strings, so a pure back-redirect loses them). The map SHALL be guarded by a test that asserts every map value resolves to an existing route and that no map entry chains through another redirect.

#### Scenario: The ticket list points at the cockpit, not the tickets page

- **GIVEN** the legacy route `/admin/tickets` and the current SDLC cockpit (`/sdlc/cockpit`) that hosts the ticket list since T000752
- **WHEN** the redirect map is evaluated
- **THEN** `/admin/tickets` maps to `/sdlc/cockpit`
- **AND** the removed `/admin/pipeline` entry does not reappear, because `/sdlc/pipeline` no longer exists in the production build

#### Scenario: In-page legacy links point at live destinations

- **GIVEN** SDLC cockpit pages (FactoryFloor, KiRoutingPanel, tickets/[id]) that previously linked `/admin/tickets...`
- **WHEN** the pages render
- **THEN** the links point to `/sdlc/cockpit` and `/sdlc/tickets/...` respectively
- **AND** a navigation guard test fails if any link targets a non-existent route
