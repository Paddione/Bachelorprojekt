## ADDED Requirements

### Requirement: Leitstand Design Token Set

The SDLC build SHALL provide a central Leitstand token stylesheet at
`website/src/styles/sdlc-leitstand.css` that defines the Control-Room design language
as CSS custom properties with the prefix `--ls-`: dark surface tiers, line colors, text
tiers, the semantic signal set (`--ls-signal-green`, `--ls-signal-amber`,
`--ls-signal-red`, `--ls-signal-info`), monospace numeral typography, compact spacing
steps, and radii of 2–4 px. Glow/pulse effects SHALL be defined only for
currently-running states. A print-light appearance SHALL exist solely as a report
stylesheet (`@media print` scope), not as a second interactive theme. The stylesheet
SHALL be loaded only by SDLC-target pages, never by the prod build.

#### Scenario: Showcase renders from tokens

- **GIVEN** the SDLC build target
- **WHEN** `/sdlc/design-system` is rendered
- **THEN** the page loads `sdlc-leitstand.css` and its component previews consume
  `--ls-*` custom properties instead of ad-hoc hex values

#### Scenario: Prod build stays free of the Leitstand stylesheet

- **GIVEN** the prod build target
- **WHEN** the route manifest is produced
- **THEN** no prod-served page references `sdlc-leitstand.css`

### Requirement: API Connector Inventory

The repository SHALL provide a generated API/connector inventory at
`website/src/data/api-inventory.json`, produced by `scripts/sdlc/api-inventory.mjs`.
The scanner SHALL enumerate the SDLC API routes under `website/src/pages/sdlc/api/`
(route path, exported HTTP methods, backend classification derived from imports), and
SHALL append the MCP servers from `docs/agent-guide/registry/mcp.yaml` and the
factory-mcp tool list. Curated fields (description, tier, deprecation) SHALL be merged
from `docs/agent-guide/registry/api-overlay.yaml`; an overlay entry that references no
scanned endpoint SHALL fail the generation. The output SHALL be deterministic (stable
sort, no timestamps). A CI drift gate SHALL regenerate the inventory and fail when the
regenerated file differs from the committed one, following the existing test-inventory
pattern.

#### Scenario: Deterministic regeneration

- **GIVEN** an unchanged working tree
- **WHEN** the scanner runs twice
- **THEN** both runs produce byte-identical `api-inventory.json`

#### Scenario: Drift fails the gate

- **GIVEN** a committed inventory that does not match the current API routes
- **WHEN** the drift gate runs
- **THEN** it exits non-zero and names the inventory as stale

#### Scenario: Orphaned overlay entry fails

- **GIVEN** an `api-overlay.yaml` entry whose endpoint is not found by the scanner
- **WHEN** the scanner runs
- **THEN** generation fails with a message naming the orphaned entry
