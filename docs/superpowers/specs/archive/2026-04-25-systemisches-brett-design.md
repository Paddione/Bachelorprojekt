# Systemisches Brett — Talk-Integrated 3D Constellation Tool

**Status:** Approved design, ready for implementation planning
**Date:** 2026-04-25
**Author:** brainstorming session with Patrick
**Related prior work:** `2026-04-24-systembrett-whiteboard-template-design.md` (the
2D Excalidraw template — different artefact, kept as-is alongside this one)

---

## 1. Background

Patrick's father (Gerald) coded a self-contained Three.js HTML app
(`systemisches-brett.html`) for systemic-constellation coaching work: a 3D
wooden board on which named figures (pawns, cones, cubes, octahedrons) can be
placed, coloured, scaled, rotated, and labelled. Each figure carries a
forward-direction arrow on its base — the "Blickrichtung" is the central
primitive of systemic work and is the reason the existing 2D Excalidraw
`systembrett.whiteboard` template cannot replace it.

The app today saves and loads JSON files locally. Gerald's accompanying design
notes (`patrick-nextcloud-integration.md`, `patrick-websocket-sync.md`)
describe a two-stage path: WebDAV-backed storage in Nextcloud, plus a Node.js
WebSocket server for realtime sync.

**This spec replaces Gerald's WebDAV stage-1 with shared-postgres persistence
and adapts stage-2 (the WebSocket sync) to the existing Kubernetes/Kustomize
stack.** The protocol he specified is preserved almost verbatim.

## 2. Goals

1. The brett is callable from inside a Nextcloud Talk meeting via two
   complementary entry points: a `/brett` chat slash-command (any
   conversation), and an auto-posted link when a scheduled coaching meeting
   transitions to active.
2. Both call participants see figure movements in real time.
3. State persists in the shared postgres so a reconnect (or page refresh)
   restores the brett.
4. Gerald can save and reload named snapshots, optionally linked to a customer
   (mentolder.de's existing `customers` table), and browse them either by
   client or by Talk room.
5. The integration ships through the existing GitOps flow (Kustomize + ArgoCD
   + sealed secrets) with no docker-compose detour.

## 3. Non-goals (v1)

- In-call grid-tile embedding (would require a custom Nextcloud Talk PHP app —
  out of scope).
- Multi-replica brett pod / horizontal scaling (single coach, single
  deployment is sufficient; documented constraint).
- SSO-gated access to the brett page itself. Auth is **token-only** by
  explicit decision: anyone with the URL containing the Talk room token can
  open and edit that brett. The Talk room token is already a per-conversation
  shared secret known only to its participants.
- Verifying Talk-room membership against the Nextcloud API per join.
- Snapshot deletion, snapshot edit-in-place, snapshot search.
- Customer creation from inside the brett (use the existing portal).
- Cleanup/expiry of stale `brett_rooms` rows.

## 4. Architecture

```
                                workspace namespace
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   Traefik ──▶ brett.<domain>          ──▶  brett pod (NEW)              │
│      │                                       Node.js: HTTP + WS         │
│      │                                       ├─ /             static    │
│      │                                       ├─ /api/brett/*  REST      │
│      │                                       └─ /sync         WS        │
│      │                                              │                   │
│      ├──▶ web.<domain>/api/brett/bot  ──▶  website pod (existing)       │
│      │                                       Talk bot webhook           │
│      │                                       + meeting-active hook      │
│      │                                              │                   │
│      └──▶ files.<domain>              ──▶  nextcloud (Talk)             │
│                                                                         │
│   shared-db ◀────────────────────────  brett pod, website pod           │
│      (website DB: + 2 new tables, + 1 new column)                       │
└─────────────────────────────────────────────────────────────────────────┘
```

**Component placement rationale.**

- The brett pod is one new container — it owns the static page, the REST API
  for snapshots, and the WebSocket sync. Single origin avoids CORS and a
  second ingress.
- The Talk integration (bot webhook, auto-post on meeting active) lives in
  the existing website backend because that is the only service that already
  has the Nextcloud Talk API helper, the meeting state machine, and the
  customer table.
- Persistence lives in the existing `website` postgres database. The brett
  pod connects as the existing `website` DB user — no new role.

## 5. Data model

Two new tables and one column, appended to `k3d/website-schema.yaml` in **both**
`init-meetings-schema.sh` (fresh DB) and `ensure-meetings-schema.sh` (postStart
on existing DB). Pure additive migration, all `IF NOT EXISTS` / `ADD COLUMN
IF NOT EXISTS`.

```sql
-- Layer 1: live state per Talk room. Overwritten as figures move.
CREATE TABLE IF NOT EXISTS brett_rooms (
    room_token       TEXT PRIMARY KEY,
    state            JSONB NOT NULL DEFAULT '{"figures":[]}'::jsonb,
    last_modified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Layer 2: manual snapshots. Immutable, named, optionally linked to a customer.
CREATE TABLE IF NOT EXISTS brett_snapshots (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_token  TEXT,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    state       JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brett_snapshots_customer
    ON brett_snapshots(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_brett_snapshots_room
    ON brett_snapshots(room_token, created_at DESC);

-- Idempotency for auto-post on meeting active.
ALTER TABLE meetings
    ADD COLUMN IF NOT EXISTS brett_link_posted_at TIMESTAMPTZ;
```

**State JSONB shape** (matches Gerald's existing save format, plus a stable
per-figure `id` required for sync messages):

```json
{
  "figures": [
    {
      "id": "fig_lq8x3k_4f9a",
      "type": "pawn",
      "color": "#e06b6b",
      "label": "Mutter",
      "scale": 1.4,
      "rotY": 0.2,
      "x": 3.0,
      "z": -1.5
    }
  ]
}
```

**Design choices and why.**

- `room_token` is the primary key of `brett_rooms` (not a surrogate UUID).
  There is exactly one live state per Talk room, the token is unique, lookups
  are always by token. A surrogate would only add a join.
- `customer_id` is nullable on snapshots. Ad-hoc conversations have no client
  link; `ON DELETE SET NULL` lets DSGVO customer-deletion preserve snapshot
  history without dangling FKs.
- `room_token` is also nullable on snapshots — once loaded into a different
  room, "originating room" is a historical attribute rather than a routing
  one.
- No `created_by` column. Auth is token-only, so we have no reliable user
  identity to record.
- No `updated_at` on snapshots — they are immutable. To "edit", save a new
  one.
- Two indexes mirror the two browse paths exposed in the UI: by-customer and
  by-room.

## 6. Brett pod

### 6.1 Source layout

```
brett/
├── Dockerfile
├── package.json
├── package-lock.json
├── server.js              ~250 lines, single file
├── public/
│   ├── index.html         Gerald's HTML, modified (see §8)
│   └── three.min.js       vendored r128, no CDN
└── README.md
```

### 6.2 HTTP routes

```
GET  /                                      → public/index.html
GET  /three.min.js                          → vendored asset
GET  /healthz                               → 200 "ok"
GET  /api/state?room=<token>                → { figures: [...] }
GET  /api/customers                         → [{ id, name }]
GET  /api/snapshots?room=<t>&customer_id=<u>
                                            → [{ id, name, room_token,
                                                customer_id, created_at }]
POST /api/snapshots                         → { id }
                                              body: { room_token, customer_id?,
                                                      name, state }
GET  /api/snapshots/:id                     → { id, name, state, customer_id,
                                                room_token, created_at }
```

No DELETE. Snapshots accumulate; cleanup is a future-if-needed problem.

### 6.3 WebSocket protocol — `wss://brett.<domain>/sync`

Server-side state: `Map<roomToken, Set<WebSocket>>` plus a per-room
debounce timer.

**Client → server:**

```jsonc
{ "type": "join", "room": "<talk-token>" }                          // first
{ "type": "add",    "fig": {...} }
{ "type": "move",   "id": "fig_xxx", "x": 4.2, "z": -1.8 }
{ "type": "update", "id": "fig_xxx", "changes": { "label": "Vater" } }
{ "type": "delete", "id": "fig_xxx" }
{ "type": "clear" }
```

**Server → client:**

```jsonc
{ "type": "snapshot", "figures": [...] }   // sent once after join
{ "type": "add"|"move"|"update"|"delete"|"clear", ... }   // echoed mutations
{ "type": "info", "count": 2 }
```

### 6.4 Persistence and lifecycle

- Each mutation triggers a per-room debounced write (1 s after last activity)
  that does
  `INSERT ... ON CONFLICT (room_token) DO UPDATE SET state = $1, last_modified_at = now()`
  against `brett_rooms`.
- `clear` writes immediately, no debounce.
- Last client leaving a room: flush any pending write before deleting the
  room from the in-memory map.
- SIGTERM: flush all pending writes before closing the HTTP server. K8s
  default `terminationGracePeriodSeconds: 30` is sufficient.

**Rationale:** dragging a figure emits ~30 messages/sec. Writing each to
postgres is wasteful and creates lock contention. Debounced writes capture
the rest position with minimal IO; bounded last-second loss on crash is
acceptable for this use case.

### 6.5 Dependencies

```json
{
  "dependencies": {
    "express": "^4.21.0",
    "ws": "^8.18.0",
    "pg": "^8.13.0"
  }
}
```

No ORM, no validation library. Postgres parameterized queries handle
injection; message shapes are small enough to validate inline.

### 6.6 Deployment shape

- One Deployment, `replicas: 1`, `strategy: Recreate`.
- Runs as `runAsNonRoot: true`, `runAsUser: 1000`,
  `readOnlyRootFilesystem: true`, `capabilities: drop: [ALL]`.
- Resources: `requests: 128Mi/100m`, `limits: 512Mi/500m`.
- Reads `WEBSITE_DB_PASSWORD` from `workspace-secrets`.
- NetworkPolicy: ingress from Traefik on 3000; egress to `shared-db:5432`
  and DNS only.

**Single-replica constraint** is intentional and documented: in-memory rooms
map means two clients on different pods would not see each other. For v1
single-coach use this is fine. Future scaling path: postgres LISTEN/NOTIFY or
small Redis. Out of scope for v1.

## 7. Talk integration (in the website backend)

### 7.1 Slash command via Talk Bots API (entry point B)

**One-time registration per env**, run via `task workspace:brett-setup`:

```bash
php occ talk:bot:install \
    "Systemisches Brett" \
    "<BRETT_BOT_SECRET>" \
    "https://web.<domain>/api/brett/bot" \
    "Stellt das Systemische Brett auf /brett bereit" \
    "webhook"
php occ talk:bot:setup <bot-id> --feature all
```

Idempotent: if the bot already exists, the script logs and exits 0.

**Webhook handler** — `website/src/pages/api/brett/bot.ts`:

1. Verify HMAC: `SHA256(X-Nextcloud-Talk-Random-header + body)` signed with
   `BRETT_BOT_SECRET`, compared against `X-Nextcloud-Talk-Signature` in
   constant-time. Reject with 401 on mismatch.
2. Ignore non-message events (`type !== 'Create'` or
   `object.name !== 'message'`).
3. Parse the chat message from `object.content` (a JSON string). Match
   `^/brett(\s|$)`. Otherwise respond 200, no action.
4. Read the Talk room token from `target.id` in the webhook body.
5. Build `https://<BRETT_DOMAIN>/?room=<token>`.
6. POST a reply back to
   `/ocs/v2.php/apps/spreed/api/v1/bot/<token>/message` with its own HMAC
   signature (same secret, signs `random + body` for the outgoing request).

The bot is stateless. No customer lookup happens here — the brett page itself
queries `/api/customers` on load.

### 7.2 Auto-post on meeting active (entry point C)

Hook fires wherever `meetings.status` transitions to `'active'` (the existing
state-machine site that also sets `started_at`). Implementation:

```ts
async function postBrettLinkOnce(meetingId: string, talkRoomToken: string) {
  const updated = await sql`
    UPDATE meetings
       SET brett_link_posted_at = now()
     WHERE id = ${meetingId} AND brett_link_posted_at IS NULL
     RETURNING id`;
  if (updated.length === 0) return;            // already posted

  const url = `https://${env.BRETT_DOMAIN}/?room=${encodeURIComponent(talkRoomToken)}`;
  await sendTalkMessage(talkRoomToken,
    `🎯 Systemisches Brett für diese Sitzung: ${url}`);
}
```

The `UPDATE ... WHERE brett_link_posted_at IS NULL RETURNING` pattern
atomically claims the post — even if the active-transition fires twice, the
message is sent exactly once.

### 7.3 Secrets

One new sealed secret key: `BRETT_BOT_SECRET`. Generated by `env:generate`,
sealed via `env:seal`. Used by:

- Website backend (validates incoming webhooks, signs outgoing bot replies).
- The `talk:bot:install` invocation in `scripts/brett-bot-setup.sh`.

The brett pod itself does **not** need this secret.

### 7.4 Domain config

New entry in `k3d/configmap-domains.yaml`, `environments/schema.yaml`, and
each env file:

| env         | BRETT_DOMAIN          |
|-------------|-----------------------|
| dev         | brett.localhost       |
| mentolder   | brett.mentolder.de    |
| korczewski  | brett.korczewski.de   |

## 8. Brett HTML changes

The goal is to keep Gerald's file recognizable to him: same UI, same Three.js
scene, same German labels. The cluster integration is grafted on. Gerald's
own stage-2 protocol design from `patrick-websocket-sync.md` is followed
almost verbatim.

### 8.1 File location

`brett/public/index.html` — repo-vendored copy of Gerald's
`systemisches-brett.html` with the edits below. Gerald's working copy in his
OneDrive folder remains his canonical source of truth for visual/layout
changes; we re-vendor on update.

### 8.2 Edits, in order

1. **Vendor Three.js.** Replace the cdnjs script tag (line ~262) with
   `<script src="/three.min.js"></script>`. Ship r128 alongside `index.html`.
2. **Add a small config block** at the top of the existing `<script>` section
   (Gerald's stage-1 WebDAV CONFIG block was never applied; we add this in its
   place). Same-origin, so no auth/URL config needed:
   ```js
   const params  = new URLSearchParams(window.location.search);
   const ROOM    = params.get('room') || 'standalone';
   const API     = '/api';
   const SYNC_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://')
                  + location.host + '/sync';
   ```
   `room='standalone'` keeps the file openable as a single-player toy if
   Gerald opens it locally.
3. **Stable figure IDs** — modify `addFigure()` to accept and persist an
   optional `id`, generating a fresh one when absent. Exact pattern from
   Gerald's stage-2 §4e.
4. **WebSocket sync layer** — `connect()`, `send()`, `receive()` per
   Gerald's stage-2 §4b–4d, with auto-reconnect (3 s backoff).
5. **Wire mutations to `send()`.** One extra line per existing mutation
   site: figure-add, drag/touch (debounced ~30 ms), color/scale/rotation/
   label change, delete, clear.
6. **`receive()` applies remote mutations without re-broadcasting** by
   reusing `setLabel`, `setScale`, `setRotY`, `recolorFigure`, `clearBoard`.
   These functions don't call `send()`, so loops are naturally avoided. An
   `applyingRemote` guard provides belt-and-braces safety.
7. **Replace Save/Load buttons.** New "Speichern" and "Laden" buttons open
   modals (see 8.3 and 8.4). "Brett leeren" stays. The hidden file-input is
   removed.
8. **Status indicator** in toolbar top-right: `Verbinde…` /
   `Verbunden ✓ — N Teilnehmer` / `Verbindung getrennt — versuche neu …`.

### 8.3 Save modal

```
┌──────────────────────────────────┐
│  Brett speichern                 │
│                                  │
│  Klient: [Anna Müller       ▾]  │  ← prefilled if a customer was
│          [— kein Klient —      ] │     associated with this room before
│                                  │
│  Name:   [vor Intervention    ] │
│                                  │
│       [Abbrechen]  [Speichern]  │
└──────────────────────────────────┘
```

On open: `GET /api/customers` populates the dropdown. Pre-selected customer
comes from the most recent snapshot already linked to this room (if any),
else "kein Klient".

On Speichern: `POST /api/snapshots` with
`{ room_token: ROOM, customer_id, name, state: { figures } }` → toast on
success.

### 8.4 Load modal

Two-step:

```
Step 1 — Klient wählen:
┌──────────────────────────────────┐
│  Klient: [Anna Müller       ▾]  │
│          [Alle Snapshots dieses │
│           Raums                ] │
└──────────────────────────────────┘

Step 2 — Snapshot wählen:
┌──────────────────────────────────┐
│  ○ vor Intervention   2026-04-25 │
│  ○ Familienaufstellung 2026-04-18│
│  ○ erste Sitzung      2026-04-10 │
└──────────────────────────────────┘
```

- Klient select → `GET /api/snapshots?customer_id=<u>` populates list.
- "Alle Snapshots dieses Raums" → `GET /api/snapshots?room=<token>`.
- Snapshot select → `GET /api/snapshots/:id` → broadcast `clear` then `add`
  for each figure (so the other side sees the load).

### 8.5 Preserved without change

- The 3D scene (lights, camera, board mesh, geometries, base disc, direction
  arrow, face marker).
- Gerald's color palette, button labels, German UI strings, hint text.
- Touch / RMB orbit controls, scale slider, rotation buttons, label modal.
- The selection ring animation.
- The figure JSON shape — `{type, color, label, scale, rotY, x, z}` per
  figure stays identical, only `id` is added.

## 9. Files to add and change

**New:**

```
brett/Dockerfile
brett/package.json
brett/package-lock.json
brett/server.js
brett/public/index.html
brett/public/three.min.js
brett/README.md

k3d/brett.yaml
scripts/brett-bot-setup.sh
scripts/tests/brett.test.sh
website/src/pages/api/brett/bot.ts
website/src/pages/api/brett/_helpers.ts
docs-site/systemisches-brett.md
```

**Modified:**

```
k3d/website-schema.yaml         + brett_rooms, brett_snapshots,
                                  meetings.brett_link_posted_at (in BOTH scripts)
k3d/configmap-domains.yaml      + BRETT_DOMAIN
k3d/ingress.yaml                + brett ingress route (dev: brett.localhost)
k3d/network-policies.yaml       + brett pod ingress/egress rules
k3d/kustomization.yaml          + brett.yaml
prod/kustomization.yaml         + brett TLS patch
prod/brett-tls-patch.yaml       cert-manager Ingress annotation
environments/schema.yaml        + BRETT_DOMAIN, + BRETT_BOT_SECRET
environments/dev.yaml
environments/mentolder.yaml
environments/korczewski.yaml
environments/.secrets/<env>.yaml          + BRETT_BOT_SECRET (generated)
environments/sealed-secrets/<env>.yaml    regenerated
docs-site/_sidebar.md           link the new doc
Taskfile.yml                    + brett:* tasks
```

**Total new code surface:** ~250 LoC `server.js`, ~60 LoC bot webhook,
~150 LoC HTML/modal additions, plus YAML.

## 10. Image build flow

Mirrors the existing website pattern.

**Dev** (`task brett:build`):
```bash
docker build -t workspace-brett:latest brett/
k3d image import workspace-brett:latest -c workspace-cluster
kubectl rollout restart deploy/brett -n workspace
```

**Prod** (CI builds on tag, pushes to GHCR):
- Image: `ghcr.io/paddione/workspace-brett:<git-sha>`.
- Local manifest uses `:latest` with `imagePullPolicy: Always` (intentional —
  matches website's gotcha-documented pattern).

## 11. Taskfile entries

```yaml
brett:build:
  desc: "Build brett image and import into k3d"
  cmds:
    - docker build -t workspace-brett:latest brett/
    - k3d image import workspace-brett:latest -c workspace-cluster

brett:deploy:
  desc: "Build, import, and roll out brett"
  cmds:
    - task: brett:build
    - kubectl rollout restart deploy/brett -n workspace --context "{{.ENV_CONTEXT}}"
    - kubectl rollout status  deploy/brett -n workspace --context "{{.ENV_CONTEXT}}"

brett:bot-setup:
  desc: "Register the Nextcloud Talk bot for /brett (one-time per env)"
  cmds:
    - bash scripts/brett-bot-setup.sh
  preconditions:
    - sh: '[[ -n "${ENV}" ]]'
      msg: "ENV= must be set (dev|mentolder|korczewski)"

brett:logs:
  cmds:
    - kubectl logs -n workspace -l app=brett --tail=200 -f --context "{{.ENV_CONTEXT}}"

brett:psql:
  desc: "psql to website DB to inspect brett tables"
  cmds:
    - task: workspace:psql
      vars: { db: website }
```

## 12. Rollout sequence (per env)

```
1. PR with all file changes merged.
2. ArgoCD auto-syncs k3d/ → brett pod comes up;
   shared-db postStart adds the new tables/column.
3. task env:generate ENV=<env>
   task env:seal     ENV=<env>
   PR + merge so the SealedSecret carries BRETT_BOT_SECRET.
4. kubectl rollout restart deploy/website (so it picks up BRETT_BOT_SECRET).
5. task brett:bot-setup ENV=<env>
6. Smoke test:
   - open https://brett.<domain>/?room=test in two browsers; moves sync;
   - in any Talk conversation, type /brett → bot replies with link;
   - mark a meeting active → link auto-posted.
```

## 13. Tests

`scripts/tests/brett.test.sh` covers, as test ID `FA-26`:

- `HTTP 200` on `/`, `/three.min.js`, `/healthz`.
- WS upgrade succeeds at `/sync`; server responds with `{type:'snapshot'}`
  after `join`.
- `POST /api/snapshots` round-trips through `GET /api/snapshots/:id`.
- DB rows visible via `psql` against `brett_rooms` and `brett_snapshots`.

CI is unchanged: `kustomize build k3d/ | kubeconform` covers the new YAML
once it's in `k3d/kustomization.yaml`; `yamllint` and `shellcheck` pick up
the new files automatically.

## 14. Documentation

`docs-site/systemisches-brett.md` — Gerald-facing, German, ~1 page:

- Was es ist
- Wie öffnen (in jeder Talk-Sitzung `/brett` tippen, oder Link aus dem
  geplanten Termin nutzen)
- Wie speichern (Klient + Name)
- Wie laden
- Was tun, wenn die Statusanzeige rot ist (Seite neu laden — der Server
  stellt selbst neu zu).

Linked from `docs-site/_sidebar.md`. After merge,
`kubectl rollout restart deploy/docs -n workspace --context <env>` is
required (per the documented gotcha — ArgoCD doesn't auto-sync the docs
ConfigMap content).

## 15. Risks and known limitations

| Risk | Mitigation |
|------|------------|
| Token-only auth: leaked Talk room URL = leaked brett. | Accepted by user. The Talk room token is itself a per-conversation secret; this is the same trust model as Talk chat itself. SSO upgrade path documented. |
| Single-replica brett: no HA. | Documented constraint. Single-coach use case. Future path: postgres LISTEN/NOTIFY or Redis. |
| Crash between debounce window flushes: up to 1 s of figure-position drift lost. | Acceptable for this workflow; figures land at rest positions, not mid-drag. |
| Bot and auto-post both fire on the same meeting: two messages with same link. | Cosmetic. Suppression is v2 polish. |
| Three.js r128 vendored — no security updates without a deliberate version bump. | r128 is the version Gerald already uses; no known critical CVEs in the WebGL path used here. Bump as part of routine maintenance. |
| Snapshots accumulate without a cleanup path. | Acceptable for v1 (low write volume — coaches save manually, not continuously). DELETE endpoint added if/when needed. |

## 16. Open items for the implementation plan

The implementation plan should pin down:

1. The exact call site in the website meeting state machine where status
   transitions to `'active'` — the auto-post hook attaches there.
2. Whether the bot setup script enables the bot globally
   (`talk:bot:setup --feature all`) or per-conversation. Default: globally.
3. The exact form of the cert-manager Ingress patch for `brett.<domain>` —
   match existing `prod/` patches for similarity.
4. NetworkPolicy YAML — explicit selectors for ingress from Traefik and
   egress to `shared-db`.

## 17. Out of scope, for the record

- Multi-coach concurrent sessions (would need horizontal scaling).
- A pure-iframe-in-call sidebar embed (custom Talk app).
- Replacing the existing `systembrett.whiteboard` Excalidraw template.
  That artefact stays; this is a separate, complementary tool.
- Recording/transcript integration with the meeting-knowledge pipeline.
  The brett state could be archived as a `meeting_artifact` row at meeting
  end, but that is a follow-up.
