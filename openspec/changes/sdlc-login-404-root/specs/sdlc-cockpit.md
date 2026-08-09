## ADDED Requirements

### Requirement: SDLC pages preserve the requested target across login

SDLC pages that redirect unauthenticated visitors to the login flow SHALL pass the originally
requested path — including its query string — as a `returnTo` parameter, so the visitor returns
to that exact location after authenticating.

#### Scenario: Unauthenticated cockpit request returns to the cockpit

- **GIVEN** a visitor without an admin session
- **WHEN** they request `/sdlc/cockpit?tab=kosten` and complete the OIDC login
- **THEN** they are redirected back to `/sdlc/cockpit?tab=kosten`, not to `/`

#### Scenario: Login page forwards the returnTo parameter

- **GIVEN** a request to `/login?returnTo=/sdlc/app-catalog`
- **WHEN** the login page redirects to the auth endpoint
- **THEN** the `returnTo` value reaches `/api/auth/login` and is stored for the OIDC state

#### Scenario: A hostile returnTo still falls back safely

- **GIVEN** a `returnTo` value pointing at a foreign origin
- **WHEN** the OIDC callback resolves the redirect target
- **THEN** the existing fail-closed guard discards it and falls back to the safe default

### Requirement: The SDLC build serves a usable root path

In the SDLC build target the site root SHALL redirect to the cockpit instead of returning a
not-found response, so that any fallback redirect ends on a working page.

#### Scenario: Root redirects to the cockpit in the SDLC build

- **GIVEN** an application built with `BUILD_TARGET=sdlc`
- **WHEN** `/` is requested
- **THEN** the response is a redirect to `/sdlc/cockpit`

#### Scenario: Root is unaffected in the production build

- **GIVEN** an application built with `BUILD_TARGET=prod`
- **WHEN** `/` is requested
- **THEN** the request is handled by the regular start page, with no added redirect

### Requirement: The build target is observable at runtime

The website container image SHALL expose its build target as a runtime environment variable, so
that request-time logic can distinguish the SDLC build from the production build.

#### Scenario: The running container reports its build target

- **GIVEN** an image built with the `BUILD_TARGET=sdlc` build argument
- **WHEN** the environment of the running container is inspected
- **THEN** `BUILD_TARGET` is present and set to `sdlc`
