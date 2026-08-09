## ADDED Requirements

### Requirement: SDLC code resides in dedicated directories

All code that exclusively serves the software development lifecycle SHALL live under
`website/src/pages/sdlc/`, `website/src/lib/sdlc/` and `website/src/components/sdlc/`.
Modules used by both the SDLC surface and the business surface SHALL remain in their current
location and SHALL NOT be duplicated.

#### Scenario: SDLC page lives under the sdlc directory

- **GIVEN** the factory floor page, previously at `website/src/pages/admin/cockpit.astro`
- **WHEN** the repository is inspected after the split
- **THEN** the file is located under `website/src/pages/sdlc/` and no SDLC-only page remains
  under `website/src/pages/admin/`

#### Scenario: Shared module stays in place

- **GIVEN** `website/src/lib/auth.ts`, which is imported by both SDLC and business pages
- **WHEN** the split is applied
- **THEN** the module remains at `website/src/lib/auth.ts` and is not copied into
  `website/src/lib/sdlc/`

---

### Requirement: SDLC-only changes do not trigger the production website build

The production website build workflow SHALL NOT run when a push to `main` changes only files
under the SDLC directories.

#### Scenario: Commit touching only SDLC files

- **GIVEN** a push to `main` whose changed-file set lies entirely under `website/src/**/sdlc/**`
- **WHEN** GitHub evaluates the `paths` filter of `.github/workflows/build-website.yml`
- **THEN** the workflow is not triggered and no production website image is built

#### Scenario: Commit touching a shared module

- **GIVEN** a push to `main` that changes `website/src/lib/auth.ts`
- **WHEN** GitHub evaluates the `paths` filter
- **THEN** the workflow IS triggered, because the module is shared by both surfaces

---

### Requirement: Build target determines which routes are compiled

The Astro build SHALL read a `BUILD_TARGET` environment variable with the values `prod` or
`sdlc` and SHALL remove the routes of the other surface from the route manifest before building,
via the `astro:routes:resolved` integration hook.

#### Scenario: Production build excludes SDLC routes

- **GIVEN** `BUILD_TARGET=prod`
- **WHEN** the Astro build resolves its routes
- **THEN** no route whose component path lies under an `sdlc/` directory is present in the
  resulting manifest

#### Scenario: SDLC build excludes business routes

- **GIVEN** `BUILD_TARGET=sdlc`
- **WHEN** the Astro build resolves its routes
- **THEN** the manifest contains the SDLC routes and the shared infrastructure routes, and no
  business-only route such as `/admin/rechnungen`

#### Scenario: Unset build target keeps every route

- **GIVEN** `BUILD_TARGET` is not set (local development)
- **WHEN** the Astro build resolves its routes
- **THEN** all routes remain in the manifest, so local development is unaffected

---

### Requirement: Legacy admin URLs redirect to their SDLC equivalent

While SDLC routes are still present in the production image, requests to the previous
`/admin/<page>` URL of a moved page SHALL be answered with a permanent redirect to
`/sdlc/<page>`.

#### Scenario: Bookmark to the old cockpit URL

- **GIVEN** a request to `/admin/cockpit`
- **WHEN** the redirect map is consulted
- **THEN** the response is a 301 to `/sdlc/cockpit`

#### Scenario: Business admin page is untouched

- **GIVEN** a request to `/admin/rechnungen`, which did not move
- **WHEN** the redirect map is consulted
- **THEN** no redirect is applied and the page is served normally
