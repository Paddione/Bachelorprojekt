## MODIFIED Requirements

### Requirement: SDLC pages preserve the requested target across login

SDLC pages that redirect unauthenticated visitors to the login flow SHALL pass the originally
requested path — including its query string — as a `returnTo` parameter, so the visitor returns
to that exact location after authenticating. The redirect SHALL go through the login page
(`/login?returnTo=…`); jumping directly to the OIDC provider without a `returnTo` hand-off is
not allowed. This applies to every SDLC page with an auth gate.

#### Scenario: Unauthenticated cockpit request returns to the cockpit

- **GIVEN** a visitor without an admin session
- **WHEN** they request `/sdlc/cockpit?tab=kosten` and complete the OIDC login
- **THEN** they are redirected back to `/sdlc/cockpit?tab=kosten`, not to `/`

#### Scenario: Every gated SDLC page redirects through the login page

- **GIVEN** an unauthenticated request to any SDLC page with an auth gate (architektur,
  ki-konfiguration, platform, prompts, repohealth, software-history, systemtest/board,
  tickets/<id>, cockpit, app-catalog)
- **WHEN** the page's auth gate answers the request
- **THEN** the emitted redirect target is `/login?returnTo=<requested path including query
  string>` rather than a direct OIDC provider URL

#### Scenario: The requested query string survives the redirect

- **GIVEN** an unauthenticated request to `/sdlc/repohealth?tab=analytics`
- **WHEN** the page's auth gate emits its redirect target
- **THEN** the `returnTo` value is `/sdlc/repohealth?tab=analytics`, query string intact

#### Scenario: Login page forwards the returnTo parameter

- **GIVEN** a request to `/login?returnTo=/sdlc/app-catalog`
- **WHEN** the login page redirects to the auth endpoint
- **THEN** the `returnTo` value reaches `/api/auth/login` and is stored for the OIDC state

#### Scenario: A hostile returnTo still falls back safely

- **GIVEN** a `returnTo` value pointing at a foreign origin
- **WHEN** the OIDC callback resolves the redirect target
- **THEN** the existing fail-closed guard discards it and falls back to the safe default
