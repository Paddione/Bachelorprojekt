## ADDED Requirements

### Requirement: Legacy admin paths redirect via a central middleware map

The system SHALL resolve every retired single-target admin path to its current destination through a
`REDIRECT_MAP` (`Record<string, string>`, request path → full destination including query string) consumed
by `src/middleware.ts`, and SHALL issue a `301` (permanent) redirect before the route is rendered. The
destination string SHALL be byte-for-byte identical to the destination the deleted stub page previously
returned, including the query string.

#### Scenario: Content section stub redirects to the Inhalte hub

- **GIVEN** a request to `/admin/startseite`
- **WHEN** the middleware resolves the path against `REDIRECT_MAP`
- **THEN** the response is a `301` redirect to `/admin/inhalte?tab=website&section=startseite`

#### Scenario: Renamed hub stub redirects with its query string preserved

- **GIVEN** a request to `/admin/dora`
- **WHEN** the middleware resolves the path against `REDIRECT_MAP`
- **THEN** the response is a `301` redirect to `/admin/pipeline?tab=analytics`

#### Scenario: Unmapped path falls through to the existing chain

- **GIVEN** a request to a path that is not a key in `REDIRECT_MAP` (e.g. `/admin/inhalte`)
- **WHEN** the middleware evaluates the path
- **THEN** no redirect is issued and the existing locale/logging middleware chain runs unchanged

### Requirement: Dynamic conditional-redirect routes are preserved

The system SHALL NOT move routes whose redirect target is computed at runtime from request data into
`REDIRECT_MAP`. The routes `admin/brett/[...path].astro`, `admin/brett/index.astro`, `admin/bugs.astro`,
and `admin/meetings/[id].astro` SHALL remain as Astro pages, because their targets are template literals
built from runtime values (Brett service domain, `Astro.url.search`, dynamic session id) rather than static
strings.

#### Scenario: Dynamic bug route keeps its runtime query passthrough

- **GIVEN** a request to `/admin/bugs?status=open`
- **WHEN** the request is handled
- **THEN** the existing `admin/bugs.astro` page issues its runtime redirect to `/admin/tickets?status=open`
  and `REDIRECT_MAP` contains no `/admin/bugs` key

#### Scenario: Dynamic meeting route resolves the session id at runtime

- **GIVEN** a request to `/admin/meetings/42`
- **WHEN** the request is handled
- **THEN** the existing `admin/meetings/[id].astro` page redirects to `/admin/live/sessions/42` and
  `REDIRECT_MAP` contains no matching key

### Requirement: Redirect resolution is a pure, unit-tested function

The system SHALL expose the redirect lookup as a pure function `resolveRedirect(pathname: string): string | null`
in a module that does not import `astro:middleware`, so it can be unit-tested without the Astro build
pipeline. The function SHALL return the mapped destination for a known path (after stripping a single
trailing slash) and `null` for any unmapped path.

#### Scenario: Pure function returns the mapped destination

- **GIVEN** the pure module is imported directly in a Vitest test
- **WHEN** `resolveRedirect('/admin/wissensquellen')` is called
- **THEN** it returns `/admin/wissen` without requiring an Astro request context

#### Scenario: Trailing slash is normalised

- **GIVEN** a request path with a single trailing slash `/admin/dora/`
- **WHEN** `resolveRedirect('/admin/dora/')` is called
- **THEN** it returns `/admin/pipeline?tab=analytics`
