# Tasks: platform-cockpit-alignment

> Mirror of `docs/superpowers/plans/2026-06-20-platform-cockpit-alignment.md` in OpenSpec task format.
> Ticket: T000000 (placeholder — updated when the ticket is assigned).
> Pure website-layer change: no new env vars, no manifest changes. The four Grafana
> dashboards already exist (PR #1913); this change only adds an entry point to them
> and aligns the Platform Control Center with the Cockpit design language.

## ADDED Requirements

### Requirement: CentralizedLoggingPanel surfaces the four Grafana dashboards

Task 1 — A new `website/src/components/admin/ops/CentralizedLoggingPanel.svelte` SHALL render a 2×2 grid of cards (one per provisioned Grafana dashboard: `log-explorer`, `api-errors`, `traefik-access`, `keycloak-audit`), each linking to `{grafanaUrl}/d/{uid}` in a new tab. Colors SHALL resolve through `var(--admin-*)` tokens. TDD: write `CentralizedLoggingPanel.test.ts` first.

#### Scenario: Each card links to the correct dashboard in a new tab

- **GIVEN** the panel is rendered with `grafanaUrl="http://grafana.test"`
- **WHEN** the four dashboard cards are inspected
- **THEN** their `href` values are `http://grafana.test/d/log-explorer`, `/d/api-errors`, `/d/traefik-access`, and `/d/keycloak-audit`
- **AND** every card anchor has `target="_blank"` and `rel="noopener noreferrer"`
- **AND** `pnpm vitest run src/components/admin/ops/CentralizedLoggingPanel.test.ts` passes

### Requirement: ObservabilityTab composes the logging panel above the pod stream

Task 2 — A new `website/src/components/admin/ops/ObservabilityTab.svelte` SHALL accept `cluster: string` and `grafanaUrl: string` and stack `CentralizedLoggingPanel` above an `admin-card`-wrapped `LogsTab`. It SHALL contain no business logic.

#### Scenario: Wrapper forwards both props without logic

- **GIVEN** `ObservabilityTab` is rendered with `cluster` and `grafanaUrl`
- **WHEN** it mounts
- **THEN** `CentralizedLoggingPanel` receives `grafanaUrl` and `LogsTab` receives `cluster`
- **AND** `pnpm astro check` reports no new type errors

## MODIFIED Requirements

### Requirement: platform.astro owns the page header and derives grafanaUrl

Task 3 — `website/src/pages/admin/platform.astro` SHALL match the `cockpit.astro` shell pattern: 88rem max-width, `AdminPageHeader` (title "Platform Control Center", description, cluster badge in the `actions` slot), and a server-derived `grafanaUrl`. It SHALL pass `cluster` and `grafanaUrl` to `PlatformHub`. No brand-domain literal SHALL appear (S3).

#### Scenario: grafanaUrl is derived from PROD_DOMAIN without a brand literal

- **GIVEN** `PROD_DOMAIN` is set in the environment
- **WHEN** `platform.astro` renders
- **THEN** `grafanaUrl` is `https://grafana.${PROD_DOMAIN}` (prod) or `http://grafana.localhost` (dev fallback)
- **AND** `grep -E 'mentolder\.de|korczewski\.de' website/src/pages/admin/platform.astro` returns nothing

### Requirement: PlatformHub renders content only with token-driven tabs

Task 4 — `website/src/components/admin/PlatformHub.svelte` SHALL drop its in-component `<header>` (now owned by the shell), accept a `grafanaUrl: string` prop, render the tab bar via a scoped `<style>` using `var(--admin-*)` tokens, rename the "Logs" tab to "Observability", and render `ObservabilityTab {cluster} {grafanaUrl}` for that tab.

#### Scenario: Observability tab renders the wrapper and the header is gone

- **GIVEN** `PlatformHub` is mounted with `cluster` and `grafanaUrl`
- **WHEN** the "Observability" tab is active
- **THEN** `ObservabilityTab` is rendered with both props and no `<h1>`/`<header>` exists inside the component
- **AND** `pnpm astro check` reports no new type errors

### Requirement: LogsTab and DienstTab use admin CSS tokens for all colors

Tasks 5 & 6 — `website/src/components/admin/ops/LogsTab.svelte` and `website/src/components/admin/ops/DienstTab.svelte` SHALL resolve every color through `var(--admin-*)` in scoped `<style>` blocks. No raw `bg-gray-*`, `text-gray-*`, `text-green-*`, `text-yellow-*`, `text-red-*`, `bg-blue-*`, `text-blue-*`, `border-gray-*` Tailwind utilities SHALL remain (the intentional `bg-black/60` modal scrim is exempt). Layout/spacing utilities are unchanged.

#### Scenario: No raw color utilities remain after migration

- **GIVEN** both components have been migrated
- **WHEN** `grep -E 'bg-gray-|text-gray-|text-green-|text-yellow-|text-red-|bg-red-|bg-green-|bg-blue-|text-blue-|border-gray-'` runs over each file
- **THEN** it returns no matches
- **AND** `task test:changed` and `task freshness:check` pass

#### Scenario: Final verification gates pass (PFLICHT)

- **GIVEN** all six files are implemented
- **WHEN** Task 7 runs `task test:changed`, `task freshness:regenerate`, and `task freshness:check`
- **THEN** all three succeed
- **AND** `bash scripts/openspec.sh validate` reports the change tree as OK
