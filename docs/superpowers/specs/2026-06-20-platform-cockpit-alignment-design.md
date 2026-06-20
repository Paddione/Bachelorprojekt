---
title: Platform Control Center — Cockpit Visual Alignment + Centralized Logging Integration
date: 2026-06-20
slug: platform-cockpit-alignment
ticket_id: null
plan_ref: null
status: draft
domains: [website]
---

# Platform Control Center: Cockpit Visual Alignment + Centralized Logging Integration

## Problem

The Platform Control Center (`PlatformHub.svelte` / `/admin/platform`) diverges visually from the Cockpit (`/admin/cockpit`) in three ways:

1. **Header**: PlatformHub renders its own `<header>` with inline Tailwind classes inside the Svelte component; Cockpit uses `AdminPageHeader` in the `.astro` shell — the established pattern.
2. **Design tokens**: `LogsTab.svelte` and `DienstTab.svelte` use raw Tailwind color utilities (`bg-gray-700`, `text-green-400`, `text-yellow-400`, etc.) instead of `var(--admin-*)` CSS custom properties from `admin-foundation.css`.
3. **Logging infrastructure invisible**: The four Grafana dashboards shipped in PR #1913 (Log Explorer, API Error Tracker, Traefik Access Analytics, Keycloak Audit Trail) have no entry point in the admin UI.

## Goal

Make the Platform Control Center visually indistinguishable from the Cockpit in design language, and surface the centralized logging infrastructure within the existing "Logs" tab.

---

## Architecture

```
platform.astro                      ← shell (matches cockpit.astro pattern)
  AdminPageHeader                   ← title + description + cluster-badge in actions slot
  PlatformHub [cluster, grafanaUrl] ← content only (no header)
    Tab-Leiste                      ← scoped <style> CSS tokens (no inline Tailwind)
    ObservabilityTab.svelte         ← NEW: replaces direct LogsTab for 'logs' tab
      CentralizedLoggingPanel.svelte ← NEW: 4 Grafana dashboard cards
      LogsTab.svelte                ← UPDATED: design-token-migrated pod stream
    DienstTab.svelte                ← UPDATED: design-token-migrated
```

### New files
- `website/src/components/admin/ops/CentralizedLoggingPanel.svelte`
- `website/src/components/admin/ops/ObservabilityTab.svelte`

### Modified files
- `website/src/pages/admin/platform.astro`
- `website/src/components/admin/PlatformHub.svelte`
- `website/src/components/admin/ops/LogsTab.svelte`
- `website/src/components/admin/ops/DienstTab.svelte`

---

## Section 1: platform.astro → Shell Pattern

Mirrors `cockpit.astro` structure exactly:

- `max-width` extended from `72rem` → `88rem` (Cockpit standard)
- `AdminPageHeader` with:
  - `title="Platform Control Center"`
  - `description="Zentralisierte Steuerung der Multicluster-Infrastruktur"`
  - Cluster badge (`{brandId} node`) in the `actions` slot
- `grafanaUrl` derived server-side (no new env var):
  ```ts
  const grafanaUrl = process.env.PROD_DOMAIN
    ? `https://grafana.${process.env.PROD_DOMAIN}`
    : 'http://grafana.localhost';
  ```
- `PlatformHub` receives both `cluster={brandId}` and `{grafanaUrl}` as props

## Section 2: PlatformHub.svelte → Header removal + token migration

- Remove the entire `<header>` block (title, subtitle, cluster badge)
- Add `grafanaUrl: string` prop (passed down to ObservabilityTab)
- Replace inline Tailwind tab classes with scoped `<style>` CSS using admin design tokens:
  - Active tab: `background: var(--admin-primary); color: var(--admin-bg)`
  - Inactive tab: `color: var(--admin-text-mute)`
  - Tab container: `background: var(--admin-sidebar-bg); border: 1px solid var(--admin-border)`
- Rename tab label "Logs" → "Observability"
- Replace `<LogsTab>` with `<ObservabilityTab {cluster} {grafanaUrl} />` for the `logs` tab

## Section 3: Design Token Migration

### Token mapping (applied to LogsTab + DienstTab)

| Tailwind class | CSS custom property |
|---|---|
| `bg-gray-700`, `bg-gray-800` | `var(--admin-sidebar-bg)` |
| `bg-gray-950` | `var(--admin-bg)` |
| `border-gray-600`, `border-gray-700` | `var(--admin-border)` |
| `border-gray-600` (bright) | `var(--admin-border-bright)` |
| `text-gray-200`, `text-gray-300`, `text-white` | `var(--admin-text)` |
| `text-gray-400`, `text-gray-500`, `text-gray-600` | `var(--admin-text-mute)` |
| `text-green-300`, `text-green-400` | `var(--admin-success)` |
| `text-yellow-400` | `var(--admin-warning)` |
| `text-red-400` | `var(--admin-danger)` |
| `bg-blue-700`, `hover:bg-blue-600` | `var(--admin-accent)` |
| `bg-gray-600`, `hover:bg-gray-500` | `var(--admin-surface-hover)` |

All migrations use scoped `<style>` blocks with CSS class selectors. No functional changes.

## Section 4: CentralizedLoggingPanel.svelte

A 2×2 card grid linking to the four Grafana dashboards from PR #1913.

**Props:** `grafanaUrl: string`

**Cards:**

| Dashboard | Grafana UID | Description shown in card |
|---|---|---|
| Log Explorer | `log-explorer` | Live-Logs aller Pods — nach App, Namespace und Level filtern |
| API Error Tracker | `api-errors` | Top-10 fehlschlagende Endpunkte + Request-ID-Suche |
| Traefik Access Analytics | `traefik-access` | HTTP-Status-Verteilung, langsame Endpunkte, 4xx/5xx-Rate |
| Keycloak Audit Trail | `keycloak-audit` | Login-Events und fehlgeschlagene Authentifizierungen |

Each card:
- Uses `admin-card` class + admin design tokens
- Inline SVG icon (appropriate for each dashboard category)
- Title (`font-bold`, `var(--admin-text)`)
- Short description (`var(--admin-text-mute)`)
- `"Öffnen →"` link → `{grafanaUrl}/d/{uid}` (opens in new tab, `rel="noopener"`)

Section heading: `"Grafana Dashboards"` with subtitle `"Zentrale Observability-Infrastruktur"`.

## Section 5: ObservabilityTab.svelte

Thin wrapper (~25 lines):

```svelte
<script lang="ts">
  import CentralizedLoggingPanel from './CentralizedLoggingPanel.svelte';
  import LogsTab from './LogsTab.svelte';
  export let cluster: string;
  export let grafanaUrl: string;
</script>

<div class="space-y-8">
  <CentralizedLoggingPanel {grafanaUrl} />
  <div class="admin-card">
    <h3 class="section-heading">Pod-Logs</h3>
    <LogsTab {cluster} />
  </div>
</div>
```

No business logic — purely compositional.

---

## Constraints

- **No new env vars**: `PROD_DOMAIN` already exists; `schema.yaml` is at its S1 limit.
- **No iframe embedding**: Grafana opens in a new tab (`target="_blank"`). OAuth2-proxy headers make reliable same-origin iframe embedding complex; links are simpler and have no auth friction.
- **S1 budgets** (none of these files are baselined → limit 600 each):
  - `PlatformHub.svelte`: 98 → target ≤ 90 (header removed, style block replaces inline classes)
  - `LogsTab.svelte`: 140 → target ≤ 145 (style block additions, class removals roughly neutral)
  - `DienstTab.svelte`: 132 → target ≤ 137 (same pattern)
  - `CentralizedLoggingPanel.svelte`: NEW → target ≤ 120
  - `ObservabilityTab.svelte`: NEW → target ≤ 30
  - `platform.astro`: 19 → target ≤ 35

---

## Success Criteria

1. `/admin/platform` header is rendered by `AdminPageHeader` — visually identical to `/admin/cockpit`.
2. No raw `bg-gray-*`, `text-green-*`, `text-yellow-*`, `text-red-*` Tailwind classes remain in `LogsTab.svelte` or `DienstTab.svelte`.
3. "Observability" tab shows 4 Grafana dashboard cards above the pod log stream.
4. Each card's "Öffnen →" link resolves to the correct Grafana dashboard URL.
5. `task test:changed` passes. `task freshness:check` passes.
