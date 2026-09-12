## ADDED Requirements

### Requirement: Repository-scoped GitHub object identity

The system SHALL represent every projected GitHub Issue, Pull Request, and
Security Advisory with an immutable local UUID, the opaque GitHub object node ID,
and an explicit object kind. Security Advisories SHALL retain their unique
provider-native `GHSA-...` reference and MAY omit repository/number coordinates.
Numbered Issues and Pull Requests SHALL store repository/number coordinates
separately using the GitHub repository node ID and SHALL retain historical
coordinates when an object is transferred or its repository is renamed.

#### Scenario: Security Advisory keeps its provider-native identity

- **GIVEN** a projected Security Advisory has a `GHSA-xxxx-xxxx-xxxx` reference
- **WHEN** the advisory object is registered without a repository/number coordinate
- **THEN** registration succeeds and the provider-native reference is retained
- **AND** another object cannot claim that provider-native reference

#### Scenario: Same number exists in another repository

- **GIVEN** two GitHub Issues both have number `12` in different repositories
- **WHEN** both objects are registered
- **THEN** both registrations succeed with different repository node IDs
- **AND** their GitHub object node IDs remain globally unique

#### Scenario: GitHub object moves to a new coordinate

- **GIVEN** an Issue already has a current repository/number coordinate
- **WHEN** reconciliation observes the same GitHub object node ID at a new repository/number coordinate
- **THEN** the previous coordinate remains as closed history
- **AND** exactly one coordinate is current

### Requirement: Canonical work-item bindings preserve invisible UUID identity

The system SHALL bind the existing `tickets.tickets.id` UUID to a GitHub Issue or
Security Advisory as its current canonical human-facing reference and SHALL allow
immutable alias bindings. During the additive compatibility period a legacy
ticket MAY have no GitHub binding. A Pull Request MUST NOT be accepted as the
canonical work item.

#### Scenario: Second canonical binding is rejected

- **GIVEN** a ticket UUID already has a current canonical GitHub Issue binding
- **WHEN** another current canonical binding is inserted without retiring the first
- **THEN** the write fails without changing either binding

#### Scenario: Pull Request cannot become canonical work item

- **GIVEN** a projected GitHub object has kind `pull_request`
- **WHEN** it is bound to a ticket UUID with role `canonical`
- **THEN** the write fails closed

### Requirement: Identity corrections are append-only and cycle-safe

The system SHALL preserve correction history through directed GitHub-object
relationships with kinds `implements`, `closes`, `duplicate_of`, `replaces`, and
`transferred_to`. Redirect-like corrections SHALL reject cycles. Changing the
canonical reference SHALL preserve the previous reference as an alias and record
the reason and timestamp atomically.

#### Scenario: Duplicate Issue redirects to canonical Issue

- **GIVEN** Issue A was mistakenly created for work already represented by Issue B
- **WHEN** A is marked `duplicate_of` B
- **THEN** A remains resolvable as an alias
- **AND** B is the current canonical reference
- **AND** the correction relationship and reason are retained

#### Scenario: Redirect cycle is rejected

- **GIVEN** Issue A already redirects to Issue B
- **WHEN** a correction attempts to redirect Issue B to Issue A
- **THEN** the transaction fails without creating the cycle

### Requirement: Typed human GitHub references have one central parser

The system SHALL provide a pure parser and formatter for default-repository
references `I#<number>` and `PR#<number>`, repository-qualified references
`owner/repo#<number>`, and branch-safe Issue tokens `I<number>`. Machine identity
resolution SHALL require repository identity and object kind rather than treating
a bare number as globally unique.

#### Scenario: Branch-safe Issue token is parsed

- **GIVEN** the token `I5588`
- **WHEN** it is parsed for branch naming
- **THEN** the result has object kind `issue` and number `5588`

#### Scenario: Unqualified number is rejected as machine identity

- **GIVEN** only the number `5588` without a configured default repository or object kind
- **WHEN** machine identity resolution is attempted
- **THEN** resolution fails with an actionable ambiguity error
