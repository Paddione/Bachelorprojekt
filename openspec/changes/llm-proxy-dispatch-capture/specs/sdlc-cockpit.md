## ADDED Requirements

### Requirement: Dispatch recordings are visible as a live cockpit panel

The cockpit SHALL carry a panel listing the dispatch recordings from
`tickets.llm_proxy_request_log`, newest first, growing by database notification over the existing
SSE hub rather than by polling. Selecting a row SHALL open a detail view carrying the full request
and response bodies.

The list request SHALL NOT select the body columns; bodies SHALL be fetched only when a detail
view is opened. The panel SHALL reach both endpoints through the data adapter, not through its own
`fetch()`.

#### Scenario: A new dispatch appears without a page reload

- **GIVEN** an admin has the cockpit open with the dispatch panel visible
- **WHEN** a dispatch is recorded
- **THEN** a row for it appears in the panel without the page being reloaded and without the panel
  polling for it

#### Scenario: The list carries no bodies

- **GIVEN** recorded dispatches with large request and response bodies
- **WHEN** the panel loads its list
- **THEN** the response carries the header data only, and neither body column is present in it

#### Scenario: The detail view carries the full bodies

- **GIVEN** a recorded dispatch
- **WHEN** an admin opens its detail view
- **THEN** the full request body and full response body are returned

### Requirement: The panel marks incomplete and truncated recordings

A row whose recording was truncated or whose stream ended early SHALL be shown as such. Missing
correlation values SHALL be rendered as an explicit absence marker, never as a blank that reads
like a value and never as an inferred one.

#### Scenario: A truncated recording is distinguishable from a complete one

- **GIVEN** a recording carrying `truncated = true`
- **WHEN** it is displayed
- **THEN** the display states that the stored body is shortened and reports the original size

#### Scenario: A dispatch without correlation shows an absence marker

- **GIVEN** a recording whose ticket and partial columns are `NULL`
- **WHEN** it is displayed
- **THEN** those cells show an explicit absence marker rather than an empty cell or a guess
