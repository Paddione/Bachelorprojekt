# Proposal: platform-cockpit-alignment

## Why

Das Platform Control Center weicht visuell vom Cockpit ab: eigener Custom-Header in der Svelte-Komponente statt `AdminPageHeader` in der Astro-Shell, rohe Tailwind-Farb-Utilities statt Admin-CSS-Design-Tokens, und die vier Grafana-Dashboards aus PR #1913 haben keinen Einstiegspunkt im Admin-UI.

## What

- `platform.astro` wird zur Shell wie `cockpit.astro`: `AdminPageHeader` (88rem max-width, Cluster-Badge im actions-Slot, `grafanaUrl` aus `PROD_DOMAIN`)
- `PlatformHub.svelte`: Custom-Header entfernt, `grafanaUrl`-Prop, Tab-Leiste auf CSS Custom Properties umgestellt, Tab "Logs" → "Observability"
- `LogsTab.svelte` + `DienstTab.svelte`: Design-Token-Migration (`bg-gray-*`, `text-green-*`, `text-yellow-*` → `var(--admin-*)`)
- Neue Komponente `CentralizedLoggingPanel.svelte`: 4 Grafana-Dashboard-Karten im 2×2-Grid mit Öffnen-Links
- Neue Komponente `ObservabilityTab.svelte`: Wrapper — CentralizedLoggingPanel oben, LogsTab darunter

_Ticket: T000000_
