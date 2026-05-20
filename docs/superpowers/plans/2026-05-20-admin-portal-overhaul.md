---
ticket_id: T000056
slug: admin-portal-overhaul
status: staged
domains: [website]
brands: [mentolder, korczewski]
---

# Admin Portal Visual Overhaul — Implementation Plan

This plan implements the visual overhaul of the admin portal, consolidating the navigation and introducing the "Multicluster Control Center" with FluxCD integration.

## 1. Design System & Theming
- [ ] Create `website/src/styles/admin-premium.css` with CSS variables for glassmorphism and the premium color palette.
- [ ] Update `website/src/layouts/AdminLayout.astro` to import the new styles.
- [ ] Implement the "Premium" sidebar with smooth transitions and improved icons (Lucide-Svelte).

## 2. Navigation Consolidation
- [ ] Refactor `navGroups` in `AdminLayout.astro` to match the 7-hub structure.
- [ ] Ensure all pages formerly in the sidebar are reachable via tabs or links in the remaining pages (as per `2026-05-19-admin-menu-cleanup-design.md`).
- [ ] Run `task test:menu-gate` to verify compliance with the 10 Rules.

## 3. Multicluster Control Center (Backend)
- [ ] Create `website/src/pages/api/admin/platform/status.ts`:
    - Logic to fetch FluxCD `Kustomization` and `ImagePolicy` status.
    - Logic to fetch basic cluster health (nodes, pods).
- [ ] Create `website/src/pages/api/admin/platform/sync.ts` to trigger Flux reconciliation.
- [ ] Remove legacy ArgoCD API endpoints.

## 4. Multicluster Control Center (Frontend)
- [ ] Create `website/src/components/admin/PlatformHub.svelte` as the main dashboard for the "Plattform" group.
- [ ] Create `website/src/components/admin/platform/FluxCDTab.svelte` for GitOps visibility.
- [ ] Create `website/src/components/admin/platform/HealthTab.svelte` for multicluster health.
- [ ] Update `/admin/monitoring.astro` and `/admin/ops.astro` to use the new unified components.

## 5. Cleanup & Verification
- [ ] Remove legacy `ArgoCDOpsTab.svelte` and other deprecated components.
- [ ] Run `task website:redeploy:all-prods` to verify deployment.
- [ ] Run Playwright E2E tests to ensure navigation works correctly.

## Verification Checklist
- [ ] `task test:menu-gate` passes.
- [ ] Admin sidebar shows 7 groups, each ≤ 6 items.
- [ ] FluxCD status for both `mentolder` and `korczewski` is visible in the Platform Hub.
- [ ] Design matches the "Premium" glassmorphism aesthetic.
- [ ] No orphans remain in `/admin/*`.
