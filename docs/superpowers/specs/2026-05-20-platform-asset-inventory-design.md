# Platform Asset Inventory — Design Spec

**Date:** 2026-05-20  
**Branch:** feature/platform-asset-inventory  
**Status:** Approved

---

## Overview

Add a software + hardware asset inventory to the Platform Control Center (`/admin/platform`). Each platform component (Website, Keycloak, Nextcloud, …) is a software asset; each cluster node (Hetzner VMs, home workers, RPis) is a hardware asset. Assets are displayed as cards with live Kubernetes status overlay and link to their related tickets via the existing `component` field.

---

## 1. Database Schema

New schema `platform` — separate from `assets` (media files) and `bachelorprojekt` (thesis tracking).

### `platform.software_assets`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `slug` | TEXT UNIQUE NOT NULL | Matches `tickets.tickets.component` (e.g. `website`, `keycloak`) |
| `name` | TEXT NOT NULL | Display name (e.g. "Website", "Keycloak") |
| `description` | TEXT | Short description |
| `category` | TEXT NOT NULL | Enum-like: `frontend`, `auth`, `storage`, `messaging`, `ai`, `media`, `monitoring`, `security`, `dev`, `other` |
| `emoji` | TEXT NOT NULL DEFAULT `📦` | Card icon |
| `clusters` | TEXT[] NOT NULL DEFAULT `{}` | `['mentolder','korczewski']` or subset |
| `namespace` | TEXT | k8s namespace for live status lookup |
| `deployment_name` | TEXT | k8s Deployment name for `readyReplicas` check |
| `image_tag` | TEXT | e.g. `:latest`, `:22.0` |
| `url` | TEXT | Optional direct link |
| `base_status` | TEXT NOT NULL DEFAULT `live` | Static baseline: `live`, `optional`, `deprecated`. Live k8s check overrides to `live`/`degraded`/`unknown` at runtime; if deployment not found, falls back to this value. Use `optional` for services that are not always deployed (Whisper, LiveKit Egress). |
| `sort_order` | INT DEFAULT 0 | UI ordering |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ DEFAULT now() | |

CRUD: full create/edit/delete via admin UI.

### `platform.hardware_assets`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `slug` | TEXT UNIQUE NOT NULL | Matches `tickets.tickets.component` (e.g. `gekko-hetzner-2`) |
| `name` | TEXT NOT NULL | Display name |
| `description` | TEXT | Optional notes |
| `role` | TEXT NOT NULL | `control-plane` or `worker` |
| `cluster` | TEXT NOT NULL | `mentolder` or `korczewski` |
| `location` | TEXT | `Hetzner Helsinki`, `Home LAN`, `Home LAN RPi` |
| `ip` | TEXT | Primary IP |
| `os` | TEXT | e.g. `Ubuntu 24.04 LTS`, `Debian 13 (trixie)` |
| `k8s_node_name` | TEXT NOT NULL | Exact node name for `kubectl get node` lookup |
| `sort_order` | INT DEFAULT 0 | UI ordering |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

Migration-only — no CRUD endpoints, no `updated_at`.

### Ticket linking

No schema change to `tickets.tickets`. Tickets are fetched per asset via:

```sql
SELECT * FROM tickets.tickets
WHERE component = $slug
  AND status NOT IN ('done', 'archived')
ORDER BY created_at DESC;
```

The `slug` on each asset must match whatever value mishap-tracker writes to `tickets.component`.

### Migration file

`website/src/db/migrations/20260521_create_platform_assets.sql`

Creates schema, both tables, grants (`USAGE` + `ALL PRIVILEGES` to `website` role), then seeds:
- **20 software assets** (see seed list below)
- **12 hardware assets** (9 mentolder nodes + 3 korczewski nodes)

#### Software seed

| slug | name | category | clusters | namespace | deployment_name |
|---|---|---|---|---|---|
| `website` | Website | frontend | both | website / website-korczewski | website |
| `keycloak` | Keycloak | auth | both | workspace | keycloak |
| `nextcloud` | Nextcloud | storage | both | workspace | nextcloud |
| `collabora` | Collabora | storage | both | workspace | collabora |
| `vaultwarden` | Vaultwarden | security | both | workspace | vaultwarden |
| `nextcloud-talk-hpb` | Talk HPB | messaging | both | workspace | talk-hpb |
| `brett` | Brett | dev | both | workspace | brett |
| `mailpit` | Mailpit | dev | both | workspace | mailpit |
| `docuseal` | DocuSeal | other | both | workspace | docuseal |
| `tracking` | Tracking | monitoring | both | workspace | tracking |
| `docs` | Docs | other | both | workspace | docs |
| `whiteboard` | Whiteboard | other | both | workspace | nextcloud-whiteboard |
| `livekit` | LiveKit Server | media | mentolder | workspace | livekit-server |
| `livekit-ingress` | LiveKit Ingress | media | mentolder | workspace | livekit-ingress |
| `livekit-egress` | LiveKit Egress | media | mentolder | workspace | livekit-egress |
| `arena-server` | Arena Server | dev | korczewski | workspace-korczewski | arena-server |
| `whisper` | Whisper | ai | mentolder | workspace | whisper |
| `talk-transcriber` | Talk Transcriber | ai | mentolder | workspace | talk-transcriber |
| `mcp` | MCP Monolith | ai | mentolder | workspace | mcp-monolith |
| `brainstorm` | Brainstorm Sish | dev | mentolder | workspace | brainstorm-sish |

#### Hardware seed

**mentolder cluster:**

| slug | role | location | ip | os | k8s_node_name |
|---|---|---|---|---|---|
| `gekko-hetzner-2` | control-plane | Hetzner Helsinki | 178.104.169.206 | Ubuntu 24.04 LTS | gekko-hetzner-2 |
| `gekko-hetzner-3` | control-plane | Hetzner Helsinki | 46.225.125.59 | Ubuntu 24.04 LTS | gekko-hetzner-3 |
| `gekko-hetzner-4` | control-plane | Hetzner Helsinki | 178.104.159.79 | Ubuntu 24.04 LTS | gekko-hetzner-4 |
| `k3s-1` | worker | Home LAN | 192.168.100.20 | Ubuntu 24.04 LTS | k3s-1 |
| `k3s-2` | worker | Home LAN | 192.168.100.21 | Ubuntu 24.04 LTS | k3s-2 |
| `k3s-3` | worker | Home LAN | 192.168.100.22 | Ubuntu 24.04 LTS | k3s-3 |
| `k3w-1` | worker | Home LAN RPi | 192.168.100.11 | Debian 13 (trixie) | k3w-1 |
| `k3w-2` | worker | Home LAN RPi | 192.168.100.12 | Debian 13 (trixie) | k3w-2 |
| `k3w-3` | worker | Home LAN RPi | 192.168.100.13 | Debian 13 (trixie) | k3w-3 |

**korczewski cluster:**

| slug | role | location | ip | os | k8s_node_name |
|---|---|---|---|---|---|
| `pk-hetzner-4` | control-plane | Hetzner Helsinki | 10.13.14.1 | Ubuntu 24.04 LTS | pk-hetzner-4 |
| `pk-hetzner-6` | control-plane | Hetzner Helsinki | 10.13.14.2 | Ubuntu 24.04 LTS | pk-hetzner-6 |
| `pk-hetzner-8` | control-plane | Hetzner Helsinki | 10.13.14.3 | Ubuntu 24.04 LTS | pk-hetzner-8 |

---

## 2. API Endpoints

All under `website/src/pages/api/admin/platform/`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/platform/software` | admin | All software assets + live k8s status overlay |
| POST | `/api/admin/platform/software` | admin | Create software asset |
| PUT | `/api/admin/platform/software/[id]` | admin | Update software asset |
| DELETE | `/api/admin/platform/software/[id]` | admin | Delete software asset |
| GET | `/api/admin/platform/hardware` | admin | All hardware assets + live node status |
| GET | `/api/admin/platform/assets/[slug]/tickets` | admin | Open tickets for `component = slug` |

### Live status overlay

Both list endpoints (`GET /software`, `GET /hardware`) run the k8s status check **in parallel** with the DB query using `Promise.all`. If k8s is unreachable, status falls back to `unknown` — the endpoint always returns 200 with data.

**Software status logic:**
- Fetch Deployment via k8s API for each asset that has `namespace` + `deployment_name`
- `readyReplicas >= 1` → `live`
- `readyReplicas === 0` → `degraded`
- Deployment not found / k8s error → `unknown`

**Hardware status logic:**
- Single `kubectl get nodes` call (one context per cluster)
- Node `Ready=True` condition → `ready`
- Node `Ready=False` → `not-ready`
- Node not found / k8s error → `unknown`

The existing k8s API helper (`/api/admin/ops/health` pattern) is reused — no new cluster credentials needed.

---

## 3. UI Components

### New files

**`website/src/components/admin/platform/SoftwareTab.svelte`**
- Fetches `GET /api/admin/platform/software` on mount
- Renders responsive card grid (auto-fill, min 240px)
- "Neu anlegen" button (top right) opens `AssetModal`
- Click on card opens `AssetTicketDrawer` for that asset's slug

**`website/src/components/admin/platform/HardwareTab.svelte`**
- Fetches `GET /api/admin/platform/hardware` on mount
- Same card grid, read-only (no add/edit button)
- Click on card opens `AssetTicketDrawer`

**`website/src/components/admin/platform/AssetModal.svelte`**
- Create / edit modal for software assets
- Fields: Name, Slug, Emoji, Kategorie (dropdown), Cluster (multi-checkbox), Namespace, Deployment-Name, Image-Tag, URL, Sort-Order
- POST on create, PUT on edit, DELETE button in edit mode

**`website/src/components/admin/platform/AssetTicketDrawer.svelte`**
- Slides in from the right when an asset card is clicked
- Fetches `GET /api/admin/platform/assets/[slug]/tickets`
- Shows asset header (emoji, name, slug) + list of open tickets (external_id, title, status badge, priority)
- Each ticket links to `/admin/bugs?component=[slug]`
- "Ticket anlegen" shortcut button pre-fills `component = slug`

### Modified files

**`website/src/components/admin/PlatformHub.svelte`**
- Add two entries to the `tabs` array:
  ```js
  { id: 'software', label: 'Software' },
  { id: 'hardware', label: 'Hardware' },
  ```
- Import and render `SoftwareTab` / `HardwareTab` in the `{#if activeTab === ...}` block

### Card design (A+B hybrid)

```
┌─────────────────────────────────┐
│ SOFTWARE · FRONTEND             │  ← category label (color-coded)
│  [🌐] Website      [LIVE]       │  ← icon + name + status badge
│       Astro + Svelte            │  ← subtitle
│  [mentolder] [korczewski]       │  ← cluster tags
│ ─────────────────────────────── │
│  ns: website   image: :latest   │  ← detail row
└─────────────────────────────────┘
```

Status badge colors:
- `live` / `ready` → green (`#22c55e`)
- `degraded` / `not-ready` → red (`#ef4444`)
- `unknown` → muted (`#555`)
- `optional` (static, for services like whisper) → amber (`#f59e0b`)

Category label colors follow the existing admin design token palette (purple for primary mentolder, blue for korczewski accent, orange/amber for hardware).

---

## 4. Testing

- **E2E test `FA-42` (Playwright):** Navigate to `/admin/platform` → click "Software" tab → assert at least one card renders with name and status badge → click "Hardware" tab → assert node cards with cluster badges.
- **E2E test `FA-43`:** Click a software asset card → assert ticket drawer opens → assert "Ticket anlegen" button visible.
- No unit tests needed for the UI components (pure render logic). API endpoints are covered by the existing auth middleware tests.

---

## 5. Out of Scope

- Editing hardware assets from the UI (migration-only by design)
- Historical status tracking / uptime graphs (separate feature)
- Alert/notification when an asset goes `degraded` (separate feature)
- Korczewski hardware node SSH specs (CPU/RAM) — not available from kubectl, not worth scraping
