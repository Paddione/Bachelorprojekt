# Messaging System — Design Spec

**Date:** 2026-04-16  
**Status:** Approved  
**Replaces:** Mattermost, billing-bot, mm-keycloak-proxy, OpenSearch

---

## Overview

Replace Mattermost and its surrounding infrastructure with a lightweight messaging and admin inbox system built directly into the existing Astro website service. All data lives in the existing shared PostgreSQL `website` database.

**Three capabilities:**
1. **Admin Inbox** — unified actionable-item feed replacing the Mattermost `anfragen` channel
2. **Direct Messaging** — admin ↔ logged-in user threads
3. **Chat Rooms** — admin-created persistent rooms with assigned members

**Seven new DB tables** in the existing `website` database.

---

## Context

### What Mattermost was doing

| Use Case | Replacement |
|---|---|
| Registration / booking approval interactive posts | Admin Inbox quick-action cards |
| Contact form, bug report, meeting-finalize notifications | Admin Inbox items |
| Admin → user direct messages | Direct messaging threads |
| General team chat | Chat rooms (admin-created) |
| Billing slash commands (`/billing`) | Removed (user migrating to Stripe) |

### Stack constraints
- Framework: Astro 5.7 + Node adapter, Svelte 5, TailwindCSS 4
- DB client: raw `pg` (no ORM) — new DB functions go in `src/lib/messaging-db.ts`
- Auth: Keycloak SSO via oauth2-proxy — no extra auth code needed for portal
- Notification: nodemailer already in codebase

---

## Database Schema

Six new tables added to the `website` PostgreSQL database:

```sql
-- Actionable items for the admin inbox
CREATE TABLE inbox_items (
  id          SERIAL PRIMARY KEY,
  type        TEXT NOT NULL,         -- 'registration'|'booking'|'contact'|'bug'|'meeting_finalize'|'user_message'
  status      TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'actioned'|'archived'
  reference_id    INT,               -- FK to customers, bookings, bug_tickets, meetings etc.
  reference_table TEXT,
  payload     JSONB,                 -- additional display context (name, email, summary)
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  actioned_at TIMESTAMPTZ,
  actioned_by TEXT                   -- Keycloak user ID of admin who acted
);

-- One thread per customer↔admin conversation
CREATE TABLE message_threads (
  id              SERIAL PRIMARY KEY,
  customer_id     INT REFERENCES customers(id),
  subject         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages within a direct thread
CREATE TABLE messages (
  id                   SERIAL PRIMARY KEY,
  thread_id            INT REFERENCES message_threads(id),
  sender_id            TEXT NOT NULL,  -- Keycloak subject claim
  sender_role          TEXT NOT NULL,  -- 'admin' | 'user'
  body                 TEXT NOT NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  read_at              TIMESTAMPTZ,
  notification_sent_at TIMESTAMPTZ     -- set by cron when 72h email fired
);

-- Admin-created chat rooms
CREATE TABLE chat_rooms (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  created_by  TEXT NOT NULL,         -- Keycloak subject claim (admin)
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

-- Room membership
CREATE TABLE chat_room_members (
  room_id     INT REFERENCES chat_rooms(id),
  customer_id INT REFERENCES customers(id),
  joined_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (room_id, customer_id)
);

-- Messages inside rooms
CREATE TABLE chat_messages (
  id                   SERIAL PRIMARY KEY,
  room_id              INT REFERENCES chat_rooms(id),
  sender_id            TEXT NOT NULL,  -- Keycloak subject claim
  sender_name          TEXT NOT NULL,
  body                 TEXT NOT NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  notification_sent_at TIMESTAMPTZ     -- set by cron when 72h email fired
);

-- Per-user read receipts for room messages (drives 72h email logic)
CREATE TABLE chat_message_reads (
  message_id  INT REFERENCES chat_messages(id),
  customer_id INT REFERENCES customers(id),
  read_at     TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (message_id, customer_id)
);
```

---

## Admin Inbox (`/admin/inbox`)

**Layout:** Card feed with left sidebar type-filters.

**Sidebar filters:** Alle · Registrierung · Buchung · Kontakt · Bug · Meeting · Nachricht — each with unread count badge.

**Cards show:** color-coded type badge, name/summary, timestamp, inline quick-action buttons.

**Quick actions per type:**

| Type | Actions |
|---|---|
| `registration` | Genehmigen / Ablehnen |
| `booking` | Bestätigen / Ablehnen |
| `contact` | Antworten / Archivieren |
| `bug` | Erledigt |
| `meeting_finalize` | Finalisieren |
| `user_message` | Opens direct message thread |

**Action execution:** `POST /api/admin/inbox/[id]/action` — moves existing orchestration logic from `api/mattermost/actions.ts` and `api/mattermost/dialog-submit.ts` verbatim. After action: `inbox_items.status` set to `actioned`, card disappears from feed.

**Card title link:** opens the relevant existing admin page (customer, booking, meeting, bug) for full detail view.

**Inbox population:** Every event that currently posts to Mattermost instead calls `createInboxItem()` from `messaging-db.ts`. The contact form API, booking API, registration API, bug reporter, and meeting pipeline all get this one-line addition.

---

## Messaging

### Direct Messages (`/admin/nachrichten` + `/portal/nachrichten`)

**Layout:** Split panel — thread list left, open thread right. Same Svelte component (`MessagePanel.svelte`) used in both admin and portal views; the `role` prop controls which threads are visible and whether the "New Message" button (admin-only) is shown.

**Admin can:** start a new thread with any customer (searchable by name/email), reply in any thread.

**User can:** start one thread with the admin from their portal, reply in their own thread. Sending the first message creates a `user_message` inbox item for the admin.

**Unread:** `messages.read_at` is set when the recipient's panel fetches the thread. Unread threads are bolded in the list with a purple dot indicator.

### Chat Rooms (`/admin/raeume` + `/portal/raum/[id]`)

**Admin:** creates rooms, names them, assigns members from the customer list. Can archive rooms. Participates in rooms as a sender — admin is implicitly authorised in all rooms without a `chat_room_members` row (access check: `is_admin` session flag, not a members table lookup).

**Users:** see only rooms they are members of, in their portal sidebar. Room chat is the same split-panel — room list left, messages right.

**Near-real-time:** Svelte component polls `GET /api/portal/rooms/[id]/messages?after=[lastMessageId]` every 4 seconds. Query fetches only new rows (`WHERE id > $lastId`) — minimal DB load.

---

## User Portal (`/portal/*`)

Protected by oauth2-proxy (same Keycloak SSO as all other routes). Customer identity resolved by matching Keycloak `email` claim against `customers.email`.

| Route | Content |
|---|---|
| `/portal` | Landing: unread count, links to messages and rooms |
| `/portal/nachrichten` | Direct message thread with admin (split panel) |
| `/portal/raum/[id]` | Chat room (split panel, member-only access) |

Pages are Astro SSR with Svelte islands for interactive panels — same pattern as existing admin pages.

---

## 72h Email Notifications

A Kubernetes `CronJob` (`k3d/notify-unread-cronjob.yaml`) runs every 6 hours and calls `POST /api/cron/notify-unread` with a shared bearer token.

The endpoint:
1. Finds all `messages` where `sender_role = 'admin'`, `read_at IS NULL`, `notification_sent_at IS NULL`, and `created_at < NOW() - INTERVAL '72 hours'`
2. Finds all `chat_messages` with no `chat_message_reads` row for the recipient, `notification_sent_at IS NULL`, and `created_at < NOW() - INTERVAL '72 hours'`
3. Groups by customer, sends one email per customer via nodemailer summarising unread count
4. Sets `notification_sent_at = NOW()` on each processed row to prevent duplicate emails

---

## API Routes

### Admin (admin-role only)
```
GET  /api/admin/inbox                       list items (filter by status/type)
POST /api/admin/inbox/[id]/action           execute quick action
GET  /api/admin/messages                    list all threads
POST /api/admin/messages                    start new thread
GET  /api/admin/messages/[threadId]         get thread + messages
POST /api/admin/messages/[threadId]         reply in thread
GET  /api/admin/rooms                       list rooms
POST /api/admin/rooms                       create room
PUT  /api/admin/rooms/[id]                  rename / archive
POST /api/admin/rooms/[id]/members          add / remove members
```

### User Portal (logged-in user)
```
GET  /api/portal/messages                   get my thread
POST /api/portal/messages                   send first message (creates thread + inbox item)
GET  /api/portal/messages/[threadId]        get thread messages (marks read)
POST /api/portal/messages/[threadId]        reply
GET  /api/portal/rooms                      list my rooms
GET  /api/portal/rooms/[id]/messages        poll for new messages
POST /api/portal/rooms/[id]/messages        send room message
```

### Internal
```
POST /api/cron/notify-unread                72h email batch (bearer token protected)
```

---

## New Files

### Library
- `src/lib/messaging-db.ts` — all DB operations: inbox CRUD, thread/message CRUD, room/member CRUD, read-receipt writes, unread queries

### Svelte Components
- `src/components/InboxCard.svelte` — single inbox item card with quick-action buttons
- `src/components/MessagePanel.svelte` — split-panel thread list + thread view (used by admin and portal)
- `src/components/ChatRoomPanel.svelte` — split-panel room list + room chat with 4s polling
- `src/components/UnreadBadge.svelte` — unread count indicator (used in nav)

### Admin Pages
- `src/pages/admin/inbox.astro`
- `src/pages/admin/nachrichten.astro`
- `src/pages/admin/raeume.astro`

### User Portal Pages
- `src/pages/portal/index.astro`
- `src/pages/portal/nachrichten.astro`
- `src/pages/portal/raum/[id].astro`

### API Routes (see list above)

### Kubernetes
- `k3d/website-schema.yaml` — extended with 7 new tables
- `k3d/notify-unread-cronjob.yaml` — new CronJob (every 6h)

---

## Removals

### Kubernetes manifests
- `k3d/mattermost.yaml`
- `k3d/mattermost-hpa.yaml`
- `k3d/mattermost-force-sso.yaml`
- `k3d/mm-keycloak-proxy.yaml`
- `k3d/claude-code-mcp-mattermost.yaml`
- `k3d/opensearch.yaml` (only used by Mattermost)
- billing-bot K8s manifest

### Website source
- `src/pages/api/mattermost/actions.ts`
- `src/pages/api/mattermost/dialog-submit.ts`
- `src/pages/api/mattermost/slash/meeting.ts`
- `src/pages/admin/mattermost.astro`

### Services
- `billing-bot/` directory (entire Go service)

### Scripts
- `scripts/mattermost-connectors-setup.sh`
- `scripts/claude-code-mattermost-setup.sh`
- `scripts/mattermost-anfragen-setup.sh`
- `scripts/mattermost-docs-integration.sh`
- `scripts/mattermost-cleanup-channels.sh`
- `scripts/set-mattermost-theme.sh`
- `scripts/call-setup.sh`
- `scripts/billing-bot-setup.sh`

### Tests updated
- `FA-10`: remove Mattermost webhook assertions, verify inbox item creation instead
- `SA-08`: update SSO test (no longer tests Mattermost SSO flow)
- `SA-03`, `SA-07`, `SA-09`, `SA-10`: remove Mattermost config checks

### Database
- `mattermost` database and user dropped from `shared-db`
- `k3d/secrets.yaml` — remove Mattermost DB credentials

---

## Infrastructure savings
- ~20 GiB PVC (Mattermost files) freed
- ~400 MB RAM freed (Mattermost pod)
- OpenSearch pod removed (~512 MB RAM)
- billing-bot pod removed
- mm-keycloak-proxy pod removed
- One fewer PostgreSQL database
- No Enterprise license surface
