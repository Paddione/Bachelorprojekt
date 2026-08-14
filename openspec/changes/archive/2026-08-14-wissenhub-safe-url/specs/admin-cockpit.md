## ADDED Requirements

### Requirement: External URLs render only with http/https schemes

The WissenHub admin cockpit SHALL render a stored `crawl_config.startUrl` as a clickable link
only when it parses as an `http:` or `https:` URL. Any other scheme (including `javascript:`)
SHALL render as plain text or nothing at all — never as a clickable href. The persist API for
`crawl_config` SHALL enforce the same http/https restriction when saving `startUrl`, so the
unsafe value cannot be stored in the first place.

#### Scenario: non-http scheme is not rendered as a link

- **GIVEN** a collection whose `crawl_config.startUrl` is `javascript:alert(1)`
- **WHEN** the WissenHub collections list renders the collection
- **THEN** no anchor with that href is rendered (the URL is shown as text or hidden)

#### Scenario: http/https URL renders as a link

- **GIVEN** a collection whose `crawl_config.startUrl` is `https://example.com/docs`
- **WHEN** the WissenHub collections list renders the collection
- **THEN** an anchor with that href is rendered with `rel="noopener noreferrer"`

#### Scenario: persist API rejects non-http schemes

- **GIVEN** a `crawl-config` update request whose `startUrl` is `javascript:alert(1)`
- **WHEN** the API handler saves the configuration
- **THEN** it responds with a 400 error and does not persist the value
