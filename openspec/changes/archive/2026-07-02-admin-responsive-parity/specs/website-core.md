## ADDED Requirements

### Requirement: Admin suite responsive parity

The admin suite SHALL be usable on a narrow mobile viewport and lay out sensibly on a
wide desktop viewport, driven by a single stylesheet `website/src/styles/admin-responsive.css`
imported once in `AdminLayout.astro`. Content tables SHALL become horizontally scrollable
on mobile, opt-in tables MAY collapse into label/value cards, and opt-in forms SHALL widen
on desktop — without any behaviour or API change, and without touching the Cockpit view,
which owns its own mobile layout.

#### Scenario: Wide content table stays usable on a phone

- **GIVEN** an admin view rendering a wide `<table>` inside `#admin-main`
- **WHEN** it is viewed on a viewport of 375px width (≤ 767px)
- **THEN** the table becomes horizontally scrollable (`overflow-x: auto`) and the page
  body does not scroll horizontally
- **AND** the Cockpit view (`[data-container="cockpit"]`) is excluded from this rule and
  keeps its own container-query layout

#### Scenario: Opt-in table collapses into cards on a narrow container

- **GIVEN** a table tagged with `.admin-table-collapse` whose `<td>` cells carry
  `data-label` attributes
- **WHEN** the `admin-content` container is narrower than 480px
- **THEN** the table header is hidden and each row renders as a card with each cell shown
  as a `data-label` / value pair

#### Scenario: Budget-0 pages stay line-neutral

- **GIVEN** the S1-baselined pages `rechnungen.astro` (592 lines) and `projekte.astro`
  (408 lines)
- **WHEN** the responsive collapse is applied to their tables
- **THEN** only classes and `data-label` attributes are appended to existing lines and
  the files remain exactly 592 and 408 lines respectively

#### Scenario: Opt-in form widens on desktop

- **GIVEN** an `einstellungen/*` form container tagged with `.admin-form-wide`
- **WHEN** it is viewed on a viewport of at least 1024px width
- **THEN** the container gains a bounded `max-width` and its field groups lay out in two
  columns instead of a single full-width column
