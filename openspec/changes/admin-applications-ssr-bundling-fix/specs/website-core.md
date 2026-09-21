## ADDED Requirements

### Requirement: Standalone Applications Cockpit Route Integrity

The website SHALL provide an admin-only standalone Bewerbungs-Cockpit at `/admin/applications` bundled cleanly without SSR route collisions or DOM runtime errors.

#### Scenario: Clean SSR bundling of applications page without route collision

- **GIVEN** an authenticated admin user requesting `/admin/applications`
- **WHEN** the Astro server handles the request
- **THEN** it renders the standalone applications cockpit HTML page without throwing `ReferenceError: document is not defined` and without redirecting to `/404`.

#### Scenario: Independent admin navigation decoupled from Brett

- **GIVEN** the rendered applications cockpit page at `/admin/applications`
- **WHEN** examining the page navigation and header
- **THEN** the primary back link directs to `/admin` and no navigation elements link to Brett.

#### Scenario: Application pipeline API authorization for admin sessions

- **GIVEN** an authenticated admin session or valid internal token
- **WHEN** requesting `/api/internal/applications/list` or job detail/timeline/status endpoints
- **THEN** the request succeeds with status 200 rather than being rejected with 403.
