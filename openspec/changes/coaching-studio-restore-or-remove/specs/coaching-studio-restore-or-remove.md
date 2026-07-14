## ADDED Requirements

### Requirement: Dead coaching studio route is removed

The `/admin/coaching/studio` route SHALL be removed. The `studio.astro` page and its
regression test SHALL be deleted. The sidebar navigation link that pointed to
`/admin/coaching/studio` SHALL be rewired to `/admin/coaching/sessions`. The sessions
index page SHALL no longer render a "Sessions" tab link (it is the only view). The
`detailHref` for Questionnaire entries in `content-db-merge.ts` SHALL point to
`/admin/coaching/sessions` instead of `/admin/coaching/studio`.

#### Scenario: Studio route returns 404

- **GIVEN** the coaching studio route has been removed
- **WHEN** a user navigates to `/admin/coaching/studio`
- **THEN** the response is a 404 or redirect to `/admin/coaching/sessions`

#### Scenario: Sidebar links to sessions

- **GIVEN** the admin sidebar is rendered
- **WHEN** the coaching navigation section is displayed
- **THEN** the "Sessions" link points to `/admin/coaching/sessions`
- **AND** no link points to `/admin/coaching/studio`

#### Scenario: Content-db-merge uses sessions href

- **GIVEN** a Questionnaire entry is rendered in the content-db-merge module
- **WHEN** the `detailHref` is computed
- **THEN** it resolves to `/admin/coaching/sessions` (not `/admin/coaching/studio`)
