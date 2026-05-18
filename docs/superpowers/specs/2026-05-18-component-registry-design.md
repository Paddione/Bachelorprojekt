# Component Registry — Design Spec
**Date:** 2026-05-18  
**Branch:** feature/component-registry  
**Status:** approved

---

## Problem

The existing software-history approach (PR #740) classified PRs via LLM into `software_events` and derived `v_software_stack` / `v_software_history` from them. That machinery broke when the tracking service was removed (PR #788) because the schema was deleted without migrating the admin page that depended on it. The approach was also fundamentally fragile: it required an LLM, a running classifier script, and a separate DB pool pointing to the wrong database.

**Goal:** Replace it with a simple, manually-maintained component registry that tracks both physical (hardware) and non-physical (software) components of the platform.

---

## Schema

One new table in `bachelorprojekt`, added to `k3d/website-schema.yaml`:

```sql
CREATE TABLE bachelorprojekt.components (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('physical','non-physical')),
  area       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','inactive','deprecated')),
  cluster    TEXT NOT NULL DEFAULT 'both'
               CHECK (cluster IN ('mentolder','korczewski','both')),
  url        TEXT,       -- software: ingress URL
  hostname   TEXT,       -- physical: IP or node name
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_components_name ON bachelorprojekt.components (lower(name));
```

The `area` field uses free-text (no enum), allowing new categories without schema changes. Common values: `auth`, `files`, `office`, `infra`, `network`, `streaming`, `gaming`, `web`, `data`, `ai`, `signing`, `tools`.

The following are **removed** from `website-schema.yaml`: `software_events` table, `v_software_stack` view, `v_software_history` view.

---

## Seed Script

`scripts/one-shot/20260518-components-seed.sql` — idempotent (`INSERT ... ON CONFLICT DO NOTHING`), runs against the `website` database on both clusters.

**Physical components (13 entries):**

| name | area | cluster | hostname |
|---|---|---|---|
| gekko-hetzner-2 | infra | mentolder | CP node |
| gekko-hetzner-3 | infra | mentolder | CP node / LiveKit pin |
| gekko-hetzner-4 | infra | mentolder | CP node |
| k3s-1, k3s-2, k3s-3 | infra | mentolder | home LAN workers |
| k3w-1, k3w-2, k3w-3 | infra | mentolder | home LAN workers |
| pk-hetzner-4 | infra | korczewski | CP node |
| pk-hetzner-6, pk-hetzner-8 | infra | korczewski | worker nodes |
| GPU-Host (RTX 5070 Ti) | ai | mentolder | wg-mesh node |

**Non-physical components (~18 entries):**

| name | area | cluster |
|---|---|---|
| Keycloak | auth | both |
| Nextcloud | files | both |
| Collabora | office | both |
| Vaultwarden | auth | both |
| DocuSeal | signing | both |
| LiveKit | streaming | mentolder |
| LiveKit Ingress (RTMP) | streaming | mentolder |
| Arena-Server | gaming | korczewski |
| Brett (Systembrett) | tools | both |
| Website (Astro) | web | both |
| PostgreSQL shared-db | data | both |
| Claude Code | ai | both |
| Whisper Transcriber | ai | mentolder |
| Traefik | infra | both |
| cert-manager | infra | both |
| Sealed Secrets | infra | both |
| Mailpit | messaging | mentolder |
| Janus + coturn | webrtc | both |

---

## Backend

### `website/src/lib/components-db.ts`

Uses `pool` from `website-db.ts` directly — no separate pool. Exports:

- `listComponents(filters: { kind?, cluster?, status?, q?, limit?, offset? }): Promise<ComponentRow[]>`
- `createComponent(data: ComponentInput): Promise<ComponentRow>`
- `updateComponent(id: number, patch: Partial<ComponentInput>): Promise<ComponentRow | null>`
- `deleteComponent(id: number): Promise<boolean>` — sets `status = 'deprecated'` (soft delete)

### API Routes

**`GET /api/admin/components`** — accepts `?kind=&cluster=&status=&q=&limit=&offset=`, returns `{ components: ComponentRow[] }`.

**`POST /api/admin/components`** — creates a new component, returns the created row.

**`PATCH /api/admin/components/[id]`** — partial update of any writable field.

**`DELETE /api/admin/components/[id]`** — soft-deletes (sets status to `deprecated`).

All routes require admin session (same pattern as existing admin APIs).

### Cleanup

The following files are **deleted**:
- `website/src/lib/software-history-db.ts`
- `website/src/lib/software-history-classifier.ts`
- `website/src/pages/api/admin/software-history/index.ts`
- `website/src/pages/api/admin/software-history/[id].ts`
- `website/src/components/admin/SoftwareHistory.svelte`
- `scripts/software-history-classify.mts`

---

## Admin UI

**Page:** `/admin/software-history` (URL unchanged for link stability)  
**Component:** `website/src/components/admin/Components.svelte` (replaces `SoftwareHistory.svelte`)

### Layout

**Filter bar (top):** dropdowns for `kind`, `cluster`, `status`; text input for full-text search; "Neue Komponente" button (top-right).

**Two-section grid:**
- **Physisch** — card grid grouped by `area`
- **Software** — card grid grouped by `area`

Each card displays: name, status badge (active=green / inactive=yellow / deprecated=red), cluster badge, url or hostname (if present), Edit button.

### Inline Modal (create + edit)

Fields: `name`, `kind` (select), `area` (text), `status` (select), `cluster` (select), `url`, `hostname`, `notes`. Submit saves via `POST` or `PATCH`. Cancel closes without saving.

No hard-delete button in the UI — deprecated status is the end state.

---

## Migration Notes

- `website-schema.yaml` removes `software_events`, `v_software_stack`, `v_software_history` and adds `bachelorprojekt.components`
- `k3d/website.yaml` already has `TRACKING_DB_URL` removed (done in the preceding bugfix session)
- Seed script must run on **both** clusters after schema deploy: `task workspace:psql ENV=mentolder -- website < scripts/one-shot/20260518-components-seed.sql` and same for korczewski
- The `software-history-db.ts` currently re-exports `pool` as `trackingPool` — that entire file is deleted; no other files import from it except the two API routes (which are also deleted)
