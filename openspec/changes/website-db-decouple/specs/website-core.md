## MODIFIED Requirements

### Requirement: Build-Time Content Bundle Resolution

The system SHALL resolve all public page content from a build-time-embedded,
Zod-validated content bundle instead of runtime database reads. This replaces the
previous three-tier priority chain (DB override > static `pageContent` > TypeScript
fallback). The `getEffective*` functions in `website/src/lib/content.ts` SHALL read
synchronously from the bundle, and the `.catch(() => …)` fallback cascade together
with the content-reader functions in `website/src/lib/website-db.ts` SHALL be removed.
Public page rendering SHALL have no runtime dependency on PostgreSQL, Keycloak, LLM,
or CalDAV.

#### Scenario: Public page renders with the database stopped

- **GIVEN** the shared PostgreSQL deployment is scaled to 0 replicas
- **WHEN** any public page (`/`, `/leistungen`, `/kontakt`, `/faq`) of either brand is requested
- **THEN** the server renders the maintained content from the build-time bundle with HTTP 200 and no error page

#### Scenario: Content resolution is synchronous

- **GIVEN** the content bundle is embedded at build time
- **WHEN** `getEffectiveHomepage()` is invoked during SSR
- **THEN** it returns the brand's homepage content from the in-memory bundle without issuing any database query

## ADDED Requirements

### Requirement: Content Bundle Validation Fails the Build

The build SHALL fail when any content JSON file under `website/content/<brand>/` is
missing, malformed, or fails its Zod schema, so that a broken or empty content set can
never be shipped. The homepage-block content SHALL reuse the shared `SCHEMA_VERSION`
gate (fail-closed on version mismatch).

#### Scenario: Invalid content file breaks the build

- **GIVEN** a domain file such as `website/content/mentolder/homepage.json` violates its Zod schema
- **WHEN** the site is built via `content-bundle.ts` loading the bundle
- **THEN** the build exits non-zero with a validation error naming the offending file and field

#### Scenario: Missing domain file breaks the build

- **GIVEN** a brand directory is missing a required domain file
- **WHEN** the bundle loader runs at build time
- **THEN** the build fails with an error naming the missing domain and brand

### Requirement: Content Publish via Bot Pull Request

Admin save endpoints SHALL validate the submitted payload with Zod and persist it by
committing the corresponding `website/content/<brand>/<domain>.json` file through the
GitHub Contents API on a branch `content/<brand>-<domain>-<timestamp>`, opening a pull
request labelled `content` with squash and auto-merge. Optimistic concurrency SHALL use
the git blob SHA of the content file; a stale SHA SHALL yield HTTP 409. Writes SHALL NOT
target `site_settings` or `homepage_block_documents`.

#### Scenario: Successful save opens a content PR

- **GIVEN** an authenticated admin submits a valid payload with the current blob SHA
- **WHEN** the save endpoint runs
- **THEN** a branch and squash-auto-merge PR are created via the GitHub Contents API and the endpoint returns the new blob SHA plus the PR reference

#### Scenario: Stale blob SHA yields a conflict

- **GIVEN** the content file on the default branch changed since the admin loaded it
- **WHEN** the admin submits a payload carrying the outdated blob SHA
- **THEN** the endpoint returns HTTP 409 with the current SHA and value, and creates no branch or PR

### Requirement: Public API Endpoints Are Fail-Soft

`GET /api/homepage` SHALL source its document from the content bundle inside a try/catch
and SHALL never emit an uncaught 500; on any internal error it SHALL return an empty-body
success (204) preserving the `X-Homepage-Version` header contract. The shared `pg.Pool`
in `website/src/lib/db-pool.ts` (retained for admin/back-office paths) SHALL set
`connectionTimeoutMillis` and a `statement_timeout` so a network blackhole cannot hang a
request. Timeline and CalDAV-slot widgets SHALL be client-side islands that hide
themselves on error or timeout instead of blocking SSR.

#### Scenario: Homepage API never 500s when the database is down

- **GIVEN** the database is unreachable
- **WHEN** `GET /api/homepage` is requested
- **THEN** the endpoint responds with 200/204 sourced from the bundle and never an uncaught 500

#### Scenario: Timeline widget hides on error

- **GIVEN** the timeline data source is unavailable or exceeds the client timeout
- **WHEN** a public page containing the timeline island loads
- **THEN** the island removes itself and the rest of the page renders unaffected

### Requirement: React Homepage Contract Preserved

`GET /api/homepage` SHALL keep its response shape (`document` body plus the
`X-Homepage-Version` header, 204 when empty) so that the React frontend
(`mentolder-web/`) continues to consume it unchanged while becoming
database-independent.

#### Scenario: React SPA loads the homepage document unchanged

- **GIVEN** the React frontend calls `GET /api/homepage`
- **WHEN** the Astro backend serves the bundle document
- **THEN** the SPA receives the same `document` + `X-Homepage-Version` shape it expected before decoupling

### Requirement: Frontend Selection via PRIMARY_FRONTEND

The active frontend for a brand's apex domain SHALL be selected by a
`PRIMARY_FRONTEND` value (`astro` or `react`) declared in `environments/<env>.yaml`,
validated by `environments/schema.yaml`/`env:validate`, and evaluated by the website
overlay so that switching frontends is a single-line config change plus deploy, fully
reversible. Both frontends SHALL consume the identical content and public-API contracts.

#### Scenario: Switching the apex frontend is a one-line change

- **GIVEN** `PRIMARY_FRONTEND: astro` serves the apex domain
- **WHEN** the value is changed to `react` and the env is deployed
- **THEN** the apex host route repoints to the React deployment with no code change, and reverting the value restores the Astro frontend

#### Scenario: Invalid PRIMARY_FRONTEND fails validation

- **GIVEN** `PRIMARY_FRONTEND` is set to a value other than `astro` or `react`
- **WHEN** `env:validate` runs
- **THEN** validation fails against the schema pattern

### Requirement: Legacy Content Tables Decommissioned

After migration the content-serving tables `homepage_block_documents`,
`homepage_block_versions`, and the content-bearing keys in `site_settings` SHALL be
retired from the write and read paths; git history SHALL be the sole source of content
version history.

#### Scenario: No runtime content write targets the retired tables

- **GIVEN** the publish pipeline is live
- **WHEN** an admin saves any content domain
- **THEN** no INSERT/UPDATE is issued against `homepage_block_documents`, `homepage_block_versions`, or the `site_settings` content keys
