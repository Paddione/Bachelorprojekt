# platform-cockpit-alignment


<!-- merged from change delta platform-cockpit-alignment.md on 2026-06-20 -->

## Purpose

### Requirement: Centralized logging dashboards are reachable from the admin UI

The admin Platform Control Center SHALL surface the four Grafana dashboards provisioned by the centralized-logging change (UIDs `log-explorer`, `api-errors`, `traefik-access`, `keycloak-audit`) through a `CentralizedLoggingPanel` component rendering a 2×2 card grid. Each card SHALL link to `{grafanaUrl}/d/{uid}` in a new tab (`target="_blank"`, `rel="noopener noreferrer"`), and the Grafana base URL SHALL be derived from `PROD_DOMAIN` (no new env var, no brand-domain literal).

#### Scenario: Operator opens a logging dashboard from the Observability tab

- **GIVEN** an admin is on `/admin/platform`
- **WHEN** they select the "Observability" tab
- **THEN** they see four dashboard cards above the live pod-log stream
- **AND** each card's link resolves to `{grafanaUrl}/d/{uid}` for its dashboard and opens in a new tab


## Requirements

### Requirement: Platform Control Center matches the Cockpit design language

The Platform Control Center SHALL be visually consistent with the Cockpit: the page header SHALL be rendered by `AdminPageHeader` in the Astro shell (`platform.astro`, 88rem max-width, cluster badge in the `actions` slot) rather than inside the Svelte component, and the `PlatformHub` tab bar plus the `LogsTab` and `DienstTab` ops panels SHALL resolve all colors through the `var(--admin-*)` design tokens instead of raw Tailwind color utilities.

#### Scenario: Header and tokens align with the Cockpit

- **GIVEN** an admin compares `/admin/platform` with `/admin/cockpit`
- **WHEN** both pages render
- **THEN** the platform header is produced by `AdminPageHeader` and is visually identical in structure to the cockpit header
- **AND** no raw `bg-gray-*`, `text-gray-*`, `text-green-*`, `text-yellow-*`, or `text-red-*` color utilities remain in `LogsTab.svelte` or `DienstTab.svelte`
