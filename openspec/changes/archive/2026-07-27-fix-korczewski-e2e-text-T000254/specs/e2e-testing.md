## ADDED Requirements

### Requirement: Exactly one contentinfo landmark per rendered page

A brand page SHALL render exactly one `<footer>` element at document level. Section-level
footer blocks inside `<main>` SHALL use a non-landmark element, so that
`getByRole('contentinfo')` resolves to a single node under Playwright strict mode and no
landmark is nested inside another landmark.

#### Scenario: The Kore homepage contributes no footer landmark

- **GIVEN** the korczewski homepage rendered with the Kore layout
- **WHEN** the document is queried for elements with role `contentinfo`
- **THEN** exactly one is found, and it is the layout footer

#### Scenario: The section block keeps its appearance

- **GIVEN** the former `w-foot` block now rendered as a non-landmark element
- **WHEN** the page is styled
- **THEN** the `w-foot` class rules apply unchanged, so the visual result is identical

### Requirement: The brand link carries an explicit accessible name

The navigation brand link SHALL carry an `aria-label` naming the brand and its
destination, rather than relying on its text content for its accessible name. E2E specs
SHALL address it by that label.

#### Scenario: Screen reader announces destination

- **GIVEN** the brand link in the site navigation
- **WHEN** its accessible name is computed
- **THEN** it names both the brand and that the link leads to the start page
- **AND** the decorative logo remains excluded via `aria-hidden`

### Requirement: Brand text assertions match the shipped wording

E2E assertions on brand wording SHALL match the content actually shipped: the footer
assertion SHALL be case-insensitive, because the `contentinfo` landmark spells the brand
in lowercase, and the `/ueber-mich` heading assertion SHALL match the portrait heading
introduced by the Kore redesign.

#### Scenario: Footer assertion tolerates the lowercase wordmark

- **GIVEN** a `contentinfo` landmark containing `© 2026 korczewski.de`
- **WHEN** the footer brand assertion runs
- **THEN** it passes without requiring a capitalised spelling

#### Scenario: About page heading assertion matches the portrait heading

- **GIVEN** `/ueber-mich` rendering a personal portrait heading
- **WHEN** the heading assertion runs
- **THEN** it passes against that heading
