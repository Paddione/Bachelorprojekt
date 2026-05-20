---
slug: admin-portal-overhaul-design
status: draft
domains: [website]
brands: [mentolder, korczewski]
---

# Admin Portal Visual Overhaul — Design Spec

**Date:** 2026-05-20  
**Status:** Draft  
**Scope:** `website/src/layouts/AdminLayout.astro`, `website/src/components/admin/*`, `website/src/styles/admin-premium.css`

## 1. Vision & Goals

The goal is to transform the existing admin portal into a "premium" experience that feels modern, fast, and high-end. It should also consolidate the fragmented navigation into a logical, task-oriented structure.

### Core Principles:
- **Consolidation**: Reduce cognitive load by grouping 37+ files/menus into 7 logical hubs.
- **Premium Aesthetics**: Glassmorphism, deep space blue/black backgrounds, vibrant gradients (brass for Mentolder, cyan for KORE), and smooth transitions.
- **Multicluster First**: A unified view for `mentolder` and `korczewski` clusters, specifically focusing on FluxCD state.
- **Action-Oriented**: Replacing legacy ArgoCD logic with modern FluxCD GitOps visibility.

## 2. Navigation Structure (Refined)

Based on the 10 Rules defined in `2026-05-18-admin-menu-rules-design.md`, the new menu structure is:

| Group | Items | Description |
|---|---|---|
| **Home** | Dashboard | Central hub with KPIs and alerts. |
| **Plattform** | Monitoring, Cluster-Steuerung, Einstellungen | **The Control Center.** Unified multicluster view + FluxCD. |
| **Tagesgeschäft** | Termine, Tickets, Inbox, Live, Nachrichten, Räume | Daily communication and operations. |
| **Klienten** | Klienten, Projekte, Followups | CRM and project tracking. |
| **Coaching** | Sessions, Brett | Core service delivery tools. |
| **Wissen & Inhalte** | Website-Inhalte, Drafts, Quellen, Vorlagen | Content management and AI knowledge base. |
| **Geld** | Rechnungen, Buchhaltung | Financials and billing. |

## 3. Visual Design System

### Colors & Effects
- **Background**: Deep space charcoal (`#0a0a0c`) with subtle mesh gradients.
- **Panels**: Glassmorphism (`backdrop-filter: blur(12px); background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08);`).
- **Accents**: 
  - Mentolder: Brass/Gold (`#e8c870`).
  - KORE: Electric Cyan/Pink.
- **Typography**: Geist (Sans) for UI, Newsreader (Serif) for headings.
- **Icons**: Transition to Lucid-style icons (consistent 1.5px stroke).

### Animations
- **Spring Transitions**: Smooth movement when switching tabs.
- **Hover Glows**: Subtle radial gradients behind active/hovered items.
- **Loading States**: Shimmer effects instead of generic spinners.

## 4. Multicluster Control Center

The new "Plattform" Hub replaces the fragmented Monitoring and Ops pages with a unified dashboard.

### Features:
- **FluxCD Overview**: 
  - Status of `workspace` and `website` kustomizations on both clusters.
  - Current image tags (SHAs) and sync history.
  - "Sync Now" button (triggers `flux reconcile`).
- **Cluster Health**:
  - Node count, Pod health, and Resource usage (CPU/RAM) for both clusters side-by-side.
- **Quick Logs**: 
  - Integrated log viewer that can toggle between `mentolder` and `korczewski` namespaces.
- **System Verification**: 
  - Integrated results from `task workspace:verify:all-prods`.

## 5. Technical Implementation

### Frontend Stack:
- **Astro**: Pages and Layouts.
- **Svelte**: High-interactivity components (PlatformHub, FluxCDTab).
- **Vanilla CSS**: CSS Variables for the premium design system.
- **Lucide-Svelte**: For premium icons.

### API Changes:
- **New API**: `/api/admin/platform/status`
  - Aggregates data from both Kubernetes clusters (via K8s API).
  - Returns FluxCD CRD status (`Kustomization`, `ImagePolicy`).
- **Deletions**: `/api/admin/cluster/argocd-apps` and `/api/admin/ops/argocd/sync`.

## 6. Migration Path

1. **Theming**: Create `admin-premium.css` and apply to `AdminLayout.astro`.
2. **Navigation**: Implement the new `navGroups` and ensure all rules (R1-R10) pass.
3. **Platform Hub**: Build the unified Svelte dashboard and backend API.
4. **Cleanup**: Move missing pages into tabs/links as per `2026-05-19-admin-menu-cleanup-design.md`.

---
*Brainstorming Session: 2026-05-20*
