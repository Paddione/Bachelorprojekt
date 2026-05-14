---
title: Live-Cockpit Implementation Plan
domains: [website, infra]
status: active
pr_number: null
---

# Live-Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/admin/stream` and `/admin/meetings` with one adaptive `/admin/live` cockpit page that auto-arranges around what is currently live (empty / stream-only / rooms-only / both). Fixes the broken `/admin/meetings` on `web.korczewski.de` as a side-effect of replacing the page entirely.

**Architecture:** A single Astro page (`/admin/live/index.astro`) does an SSR auth check + initial state seed via a new `/api/live/state` endpoint, then mounts a Svelte `LiveCockpit` root component. The root polls `/api/live/state` every 5 seconds and derives one of four layout states (`empty | stream | rooms | both`) which selects which child shell to render. Reactions/Hand-raise/Chat already flow via LiveKit DataChannel inside `StreamPlayer.svelte` — no additional pub/sub layer is needed. Bulk actions (Brett, Poll, Transcription) reuse the existing endpoints unchanged; only the UI is consolidated. Old `/admin/meetings/[id]` page is moved verbatim under `/admin/live/sessions/[id]`.

**Tech Stack:** Astro 5 (SSR), Svelte 5 (runes mode, `$state` / `$effect` / `$props`), TailwindCSS, TypeScript, Playwright for E2E. Backend uses `pg` against `shared-db` (workspace + websites) and `livekit-server-sdk` for stream state.

**Spec:** `docs/superpowers/specs/2026-05-08-live-cockpit-design.md`

---

## File Structure

**New files (created):**
```
website/src/pages/admin/live/index.astro                 # SSR shell + initial state
website/src/pages/admin/live/sessions/[id].astro         # moved from admin/meetings/[id].astro
website/src/pages/api/live/state.ts                      # GET — aggregated cockpit state
website/src/lib/live-state.ts                            # pure: aggregator + state-machine reducer
website/src/components/live/LiveCockpit.svelte           # root, polling + state derivation
website/src/components/live/Launchpad.svelte             # empty state
website/src/components/live/shared/LiveStatusBar.svelte
website/src/components/live/shared/LiveToasts.svelte
website/src/components/live/shared/ScheduleNudge.svelte  # stretch (Phase 10)
website/src/components/live/stream/StreamCockpit.svelte
website/src/components/live/stream/PublishControls.svelte
website/src/components/live/stream/RecordingPanel.svelte
website/src/components/live/stream/ConnectionIndicator.svelte
website/src/components/live/stream/AudiencePanel.svelte
website/src/components/live/stream/HandRaiseQueue.svelte
website/src/components/live/stream/PollOverlayPanel.svelte
website/src/components/live/rooms/RoomsBoard.svelte
website/src/components/live/rooms/ActiveRoomCard.svelte
website/src/components/live/rooms/RoomDrawer.svelte
website/src/components/live/rooms/BulkActionsBar.svelte
website/src/components/live/rooms/BrettBroadcastModal.svelte
website/src/components/live/rooms/PollBroadcastModal.svelte
website/src/components/live/rooms/TranscriptionModal.svelte
tests/e2e/specs/fa-admin-live.spec.ts                    # Playwright E2E
website/tests/live-state.test.mjs                        # Unit: state-machine reducer
```

**Modified files:**
```
website/src/layouts/AdminLayout.astro                    # sidebar entries (lines 75-76)
website/src/pages/admin/stream.astro                     # replace body with redirect
website/src/pages/admin/meetings.astro                   # replace body with redirect
tests/e2e/playwright.config.ts                           # register fa-admin-live in 'website' project
```

**Deleted files (Phase 11):** none (the redirect stubs stay; no orphaned files)

---

## Phase 0 — Diagnose & hot-fix the Korczewski meetings crash

The `/admin/meetings` page on `web.korczewski.de` currently throws. The redesign replaces the page anyway, but its data layer (`listAllMeetings()`) is still used by the new Launchpad's "Letzte Sessions" list and by `/admin/live/sessions/[id]`. So the crash must be diagnosed first.

### Task 0.1: Reproduce and identify root cause

**Files:**
- Read-only investigation; no code changes yet

- [ ] **Step 1: Capture the actual error from the live korczewski pod**

```bash
kubectl --context mentolder -n workspace-korczewski logs deploy/bachelorprojekt --tail=500 \
  | grep -iE 'meeting|astro|error|exception' | tail -50
```

If logs are silent, hit the page with verbose output:

```bash
kubectl --context mentolder -n workspace-korczewski exec deploy/bachelorprojekt -- \
  curl -s -o /tmp/out -w '%{http_code}\n' http://localhost:80/admin/meetings -H 'Cookie: <admin-session>'
kubectl --context mentolder -n workspace-korczewski exec deploy/bachelorprojekt -- cat /tmp/out | head -80
```

- [ ] **Step 2: Verify the database schema on korczewski matches the query in `listAllMeetings`**

`listAllMeetings()` selects from `meetings` JOIN `customers` LEFT JOIN `projects`, and runs subqueries against `transcripts` and `meeting_artifacts`. Check all five tables exist on korczewski's website DB:

```bash
kubectl --context mentolder -n workspace-korczewski exec deploy/shared-db -- \
  psql -U postgres -d website -c \
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('meetings','customers','projects','transcripts','meeting_artifacts') ORDER BY table_name;"
```

Also verify column shapes:

```bash
kubectl --context mentolder -n workspace-korczewski exec deploy/shared-db -- \
  psql -U postgres -d website -c "\d meetings" -c "\d transcripts" -c "\d meeting_artifacts"
```

- [ ] **Step 3: Run the actual query directly against korczewski's DB**

```bash
kubectl --context mentolder -n workspace-korczewski exec deploy/shared-db -- \
  psql -U postgres -d website -c "
SELECT m.id, m.meeting_type, m.status, m.talk_room_token, m.started_at, m.ended_at, m.created_at,
       c.name, c.email, c.id, p.name, p.id,
       EXISTS(SELECT 1 FROM transcripts t WHERE t.meeting_id = m.id) AS has_transcript,
       (SELECT COUNT(*) FROM meeting_artifacts a WHERE a.meeting_id = m.id) AS artifact_count
FROM meetings m JOIN customers c ON m.customer_id = c.id LEFT JOIN projects p ON m.project_id = p.id
ORDER BY m.created_at DESC LIMIT 5;"
```

- [ ] **Step 4: Document findings**

In a small note in the PR description, record: "Root cause = X" — one of:

- **Schema drift**: a referenced table/column missing → fix-forward by running the schema init script (`initMeetingProjectLink()` migration is missing on korczewski)
- **Missing OIDC redirect / brand-config issue**: the page itself errors in template render → fix in Task 0.2
- **TLS/DB connection**: the visible `CaUsedAsEndEntity` warning is harmless (code falls back to plaintext); not the cause

### Task 0.2: Apply the minimum fix to unblock `listAllMeetings()` on korczewski

Decide based on Task 0.1's findings; only do **one** of the following.

**If schema drift:**

- [ ] **Step 1: Run the migration on korczewski's website DB**

The migration is auto-applied at app startup via `initMeetingProjectLink()`. Trigger it by restarting the website pod:

```bash
kubectl --context mentolder -n workspace-korczewski rollout restart deploy/bachelorprojekt
kubectl --context mentolder -n workspace-korczewski rollout status deploy/bachelorprojekt --timeout=120s
```

Verify the schema is now correct (re-run Task 0.1 Step 2). Verify `/admin/meetings` loads.

**If brand/template error:**

- [ ] **Step 1: Patch the offending line(s) in `meetings.astro`** with explicit `?? null` or guarded access on the field that crashed (the error message in Task 0.1 will pinpoint it).

**Either way — Step 2: Commit**

```bash
git add -A
git commit -m "fix(admin/meetings): unblock korczewski (Phase 0 — Live-Cockpit)"
```

> **Note:** If Task 0.1 reveals the page actually works on korczewski (false alarm), skip Phase 0 entirely and proceed to Phase 1.

---

## Phase 1 — Page skeleton, state-machine reducer, redirects

### Task 1.1: Define the `LiveCockpitData` and `LiveState` types + write the reducer test

**Files:**
- Create: `website/src/lib/live-state.ts`
- Create: `website/tests/live-state.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `website/tests/live-state.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveLiveState } from '../src/lib/live-state.js';

test('empty when no stream and no rooms', () => {
  const data = { stream: { live: false, recording: false }, rooms: [], pollActive: null, recentSessions: [], schedule: { nextEvent: null } };
  assert.equal(deriveLiveState(data), 'empty');
});

test('stream when only stream live', () => {
  const data = { stream: { live: true, recording: false }, rooms: [], pollActive: null, recentSessions: [], schedule: { nextEvent: null } };
  assert.equal(deriveLiveState(data), 'stream');
});

test('rooms when only rooms active', () => {
  const data = { stream: { live: false, recording: false }, rooms: [{ token: 't1', name: 'r', displayName: 'r', activeSince: new Date() }], pollActive: null, recentSessions: [], schedule: { nextEvent: null } };
  assert.equal(deriveLiveState(data), 'rooms');
});

test('both when stream and rooms', () => {
  const data = { stream: { live: true, recording: false }, rooms: [{ token: 't1', name: 'r', displayName: 'r', activeSince: new Date() }], pollActive: null, recentSessions: [], schedule: { nextEvent: null } };
  assert.equal(deriveLiveState(data), 'both');
});

test('recording-only counts as stream', () => {
  const data = { stream: { live: false, recording: true }, rooms: [], pollActive: null, recentSessions: [], schedule: { nextEvent: null } };
  assert.equal(deriveLiveState(data), 'stream');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd website && node --test tests/live-state.test.mjs
```

Expected: FAIL with `Cannot find module './src/lib/live-state.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `website/src/lib/live-state.ts`:

```typescript
import type { ActiveCallRoom } from './nextcloud-talk-db';
import type { AdminMeeting } from './website-db';

export type LiveState = 'empty' | 'stream' | 'rooms' | 'both';

export interface StreamLiveStatus {
  live: boolean;
  recording: boolean;
  recordingStartedAt?: string | null;
}

export interface ActivePoll {
  id: string;
  question: string;
  kind: 'multiple_choice' | 'text';
}

export interface ScheduleHint {
  startsAt: string;
  label: string;
  talkRoomToken?: string | null;
}

export interface LiveCockpitData {
  stream: StreamLiveStatus;
  rooms: ActiveCallRoom[];
  pollActive: ActivePoll | null;
  recentSessions: AdminMeeting[];
  schedule: { nextEvent: ScheduleHint | null };
}

export function deriveLiveState(data: LiveCockpitData): LiveState {
  const streamOn = data.stream.live || data.stream.recording;
  const roomsOn = data.rooms.length > 0;
  if (streamOn && roomsOn) return 'both';
  if (streamOn) return 'stream';
  if (roomsOn) return 'rooms';
  return 'empty';
}
```

- [ ] **Step 4: Run the test to verify it passes**

The test imports from `.js` but the source is `.ts`. Either: (a) rely on Astro's TS resolution (Node's test runner doesn't do TS), or (b) ship a built JS file. The website project already runs Vitest-style tests via `node --test` against `.mjs` files only — for TS unit tests we use a `tsx` shim. Use `tsx`:

```bash
cd website && npx tsx --test tests/live-state.test.mjs
```

If `tsx` is not installed: `npm i -D tsx` first, then re-run. Update the test imports to point to the `.ts` source: `from '../src/lib/live-state.ts'`.

Expected: PASS for all 5 cases.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/live-state.ts website/tests/live-state.test.mjs
git commit -m "feat(live-cockpit): add LiveState reducer + types"
```

### Task 1.2: Add the `/admin/live` page skeleton

**Files:**
- Create: `website/src/pages/admin/live/index.astro`
- Create: `website/src/components/live/LiveCockpit.svelte`

- [ ] **Step 1: Write the failing E2E test stub**

Create `tests/e2e/specs/fa-admin-live.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA: Admin Live Cockpit', () => {
  test('T1: /admin/live redirects unauthenticated users', async ({ page }) => {
    await page.goto(`${BASE}/admin/live`);
    await expect(page).not.toHaveURL(`${BASE}/admin/live`);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd tests/e2e && WEBSITE_URL=http://localhost:4321 npx playwright test --project=website fa-admin-live.spec.ts
```

Expected: FAIL with 404 (the page does not exist yet).

- [ ] **Step 3: Create the Astro page**

Create `website/src/pages/admin/live/index.astro`:

```astro
---
import AdminLayout from '../../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../../lib/auth';
import LiveCockpit from '../../../components/live/LiveCockpit.svelte';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

// Initial seed is fetched client-side on mount; the page just renders the shell.
// This keeps the SSR fast and avoids a second round-trip while LiveCockpit does
// its first /api/live/state poll.
---

<AdminLayout title="Live">
  <section class="pt-6 pb-12 bg-dark min-h-screen">
    <div class="max-w-7xl mx-auto px-6">
      <LiveCockpit client:load />
    </div>
  </section>
</AdminLayout>
```

- [ ] **Step 4: Create the empty `LiveCockpit.svelte` placeholder**

Create `website/src/components/live/LiveCockpit.svelte`:

```svelte
<script lang="ts">
  import type { LiveState } from '../../lib/live-state';

  let state = $state<LiveState>('empty');
</script>

<div class="text-light" data-testid="live-cockpit" data-state={state}>
  <h1 class="text-2xl font-serif mb-4">Live</h1>
  <p class="text-muted">Cockpit lädt…</p>
</div>
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd tests/e2e && WEBSITE_URL=http://localhost:4321 npx playwright test --project=website fa-admin-live.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add website/src/pages/admin/live/index.astro website/src/components/live/LiveCockpit.svelte tests/e2e/specs/fa-admin-live.spec.ts
git commit -m "feat(live-cockpit): add /admin/live page skeleton"
```

### Task 1.3: Register the new spec in the Playwright `website` project

**Files:**
- Modify: `tests/e2e/playwright.config.ts`

- [ ] **Step 1: Add the spec to the `website` project's `testMatch` array**

In `tests/e2e/playwright.config.ts`, find the `name: 'website'` block (~line 28) and append to its `testMatch` array:

```typescript
'**/fa-admin-live.spec.ts',  // unified live cockpit
```

- [ ] **Step 2: Verify with --list**

```bash
cd tests/e2e && npx playwright test --project=website --list | grep fa-admin-live
```

Expected: at least one test line is printed.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/playwright.config.ts
git commit -m "test(live-cockpit): register fa-admin-live in website project"
```

### Task 1.4: Move sidebar entry from "Meetings" + "Stream" to single "Live"

**Files:**
- Modify: `website/src/layouts/AdminLayout.astro:75-76`

- [ ] **Step 1: Replace the two entries with one**

In `website/src/layouts/AdminLayout.astro`, lines 75-76 currently read:

```typescript
{ href: '/admin/meetings',      label: 'Meetings',      icon: 'microphone' },
{ href: '/admin/stream',        label: 'Stream',        icon: 'broadcast' },
```

Replace those two lines with one:

```typescript
{ href: '/admin/live',          label: 'Live',          icon: 'broadcast' },
```

- [ ] **Step 2: Manual smoke check**

Visit `https://web.mentolder.de/admin` (or local dev) — sidebar should show one "Live" entry where two used to be.

- [ ] **Step 3: Commit**

```bash
git add website/src/layouts/AdminLayout.astro
git commit -m "feat(live-cockpit): replace Meetings+Stream sidebar with Live"
```

### Task 1.5: Replace `/admin/stream` and `/admin/meetings` with redirects

**Files:**
- Modify: `website/src/pages/admin/stream.astro` (full rewrite)
- Modify: `website/src/pages/admin/meetings.astro` (full rewrite)

- [ ] **Step 1: Write the failing test**

Append to `tests/e2e/specs/fa-admin-live.spec.ts`:

```typescript
test('T2: /admin/stream redirects to /admin/live', async ({ page }) => {
  const response = await page.goto(`${BASE}/admin/stream`, { waitUntil: 'commit' });
  // Either a 301/302 or the post-redirect URL ends in /admin/live (or /login if anon)
  const finalUrl = page.url();
  expect(finalUrl).toMatch(/\/admin\/live|\/login|keycloak/);
});

test('T3: /admin/meetings redirects to /admin/live', async ({ page }) => {
  await page.goto(`${BASE}/admin/meetings`, { waitUntil: 'commit' });
  const finalUrl = page.url();
  expect(finalUrl).toMatch(/\/admin\/live|\/login|keycloak/);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tests/e2e && WEBSITE_URL=http://localhost:4321 npx playwright test --project=website fa-admin-live.spec.ts -g 'T2|T3'
```

Expected: FAIL — currently the old pages render their own UI.

- [ ] **Step 3: Replace `website/src/pages/admin/stream.astro` with a redirect stub**

Full rewrite — overwrite the entire file:

```astro
---
// Legacy route kept for backwards-compatible bookmarks.
// Live cockpit lives at /admin/live.
return Astro.redirect('/admin/live', 301);
---
```

- [ ] **Step 4: Replace `website/src/pages/admin/meetings.astro` the same way**

```astro
---
// Legacy route kept for backwards-compatible bookmarks.
// Live cockpit lives at /admin/live; per-session detail at /admin/live/sessions/[id].
return Astro.redirect('/admin/live', 301);
---
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd tests/e2e && WEBSITE_URL=http://localhost:4321 npx playwright test --project=website fa-admin-live.spec.ts -g 'T2|T3'
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add website/src/pages/admin/stream.astro website/src/pages/admin/meetings.astro tests/e2e/specs/fa-admin-live.spec.ts
git commit -m "feat(live-cockpit): redirect /admin/stream + /admin/meetings to /admin/live"
```

### Task 1.6: Move the meeting detail page to `/admin/live/sessions/[id]`

**Files:**
- Create: `website/src/pages/admin/live/sessions/[id].astro` (verbatim copy of old file with import paths fixed)
- Delete: `website/src/pages/admin/meetings/[id].astro`

- [ ] **Step 1: Copy the file to its new home and fix relative paths**

```bash
mkdir -p website/src/pages/admin/live/sessions
cp website/src/pages/admin/meetings/\[id\].astro website/src/pages/admin/live/sessions/\[id\].astro
```

- [ ] **Step 2: Adjust import depths in the new copy**

The old file is at depth `pages/admin/meetings/[id].astro` and uses `../../../layouts/...`. The new file is at depth `pages/admin/live/sessions/[id].astro` (one more level deep), so all `../../../` become `../../../../`. Update every `import` line accordingly.

Open `website/src/pages/admin/live/sessions/[id].astro` and replace every occurrence of `'../../../` with `'../../../../`.

- [ ] **Step 3: Add a redirect from the old detail URL**

Replace `website/src/pages/admin/meetings/[id].astro` entirely with:

```astro
---
const { id } = Astro.params;
return Astro.redirect(`/admin/live/sessions/${id}`, 301);
---
```

- [ ] **Step 4: Manual smoke**

Visit a known meeting URL like `/admin/meetings/<existing-id>` — should land on `/admin/live/sessions/<existing-id>` with the same detail page.

- [ ] **Step 5: Commit**

```bash
git add website/src/pages/admin/live/sessions/\[id\].astro website/src/pages/admin/meetings/\[id\].astro
git commit -m "feat(live-cockpit): move meeting detail to /admin/live/sessions/[id]"
```

---

## Phase 2 — `/api/live/state` endpoint

### Task 2.1: Aggregator function (pure, testable)

**Files:**
- Modify: `website/src/lib/live-state.ts` (add `fetchLiveCockpitData`)

- [ ] **Step 1: Append the aggregator stub**

At the bottom of `website/src/lib/live-state.ts`, add:

```typescript
import { listActiveCallRooms } from './nextcloud-talk-db';
import { listAllMeetings } from './website-db';
import { RoomServiceClient } from 'livekit-server-sdk';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devlivekit';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'devlivekitsecret1234567890abcdef';
const LIVEKIT_URL = process.env.LIVEKIT_SERVICE_URL || `http://${process.env.LIVEKIT_DOMAIN || 'livekit.localhost'}`;
const ROOM_NAME = 'main-stream';

async function fetchStreamStatus(): Promise<StreamLiveStatus> {
  const client = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  try {
    const participants = await client.listParticipants(ROOM_NAME);
    const live = participants.some((p) => (p.tracks ?? []).length > 0);
    return { live, recording: false, recordingStartedAt: null };
  } catch {
    return { live: false, recording: false, recordingStartedAt: null };
  }
}

async function fetchActivePoll(): Promise<ActivePoll | null> {
  // Reuses /api/admin/poll/active logic: query polls table for one row WHERE closed_at IS NULL.
  // We import the same db helper so the source of truth stays single-file.
  const { getActivePoll } = await import('./poll-db');
  const poll = await getActivePoll();
  if (!poll) return null;
  return { id: poll.id, question: poll.question, kind: poll.kind };
}

async function fetchRecentSessions(): Promise<AdminMeeting[]> {
  try {
    return await listAllMeetings({ limit: 12 });
  } catch (err) {
    console.error('[live-state] listAllMeetings failed (Korczewski schema?):', err);
    return [];
  }
}

export async function fetchLiveCockpitData(): Promise<LiveCockpitData> {
  const [stream, rooms, pollActive, recentSessions] = await Promise.all([
    fetchStreamStatus(),
    listActiveCallRooms(),
    fetchActivePoll(),
    fetchRecentSessions(),
  ]);
  return {
    stream,
    rooms,
    pollActive,
    recentSessions,
    schedule: { nextEvent: null },  // wired in Phase 10
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd website && npx astro check 2>&1 | tail -30
```

Expected: 0 errors. If `getActivePoll` is missing from `poll-db`, instead inline the SQL:

```typescript
async function fetchActivePoll(): Promise<ActivePoll | null> {
  const { pool } = await import('./website-db');
  const r = await pool.query<{ id: string; question: string; kind: 'multiple_choice' | 'text' }>(
    `SELECT id, question, kind FROM polls WHERE closed_at IS NULL ORDER BY created_at DESC LIMIT 1`
  );
  return r.rows[0] ?? null;
}
```

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/live-state.ts
git commit -m "feat(live-cockpit): aggregator fetches stream + rooms + poll + sessions"
```

### Task 2.2: Endpoint `GET /api/live/state`

**Files:**
- Create: `website/src/pages/api/live/state.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/e2e/specs/fa-admin-live.spec.ts`:

```typescript
test('T4: GET /api/live/state returns 401 without auth', async ({ request }) => {
  const res = await request.get(`${BASE}/api/live/state`);
  expect([401, 403]).toContain(res.status());
});

test('T5: GET /api/live/state shape (when reachable)', async ({ request }) => {
  // Anonymous request returns 401; we only check that the endpoint exists.
  const res = await request.get(`${BASE}/api/live/state`);
  expect(res.status()).not.toBe(404);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tests/e2e && WEBSITE_URL=http://localhost:4321 npx playwright test --project=website fa-admin-live.spec.ts -g 'T4|T5'
```

Expected: FAIL on T5 (404).

- [ ] **Step 3: Create the endpoint**

Create `website/src/pages/api/live/state.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { fetchLiveCockpitData, deriveLiveState } from '../../../lib/live-state';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const data = await fetchLiveCockpitData();
    return new Response(JSON.stringify({ ...data, state: deriveLiveState(data) }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[/api/live/state] failed:', err);
    return new Response(JSON.stringify({ error: 'Cockpit nicht erreichbar' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd tests/e2e && WEBSITE_URL=http://localhost:4321 npx playwright test --project=website fa-admin-live.spec.ts -g 'T4|T5'
```

Expected: PASS for both.

- [ ] **Step 5: Commit**

```bash
git add website/src/pages/api/live/state.ts tests/e2e/specs/fa-admin-live.spec.ts
git commit -m "feat(live-cockpit): GET /api/live/state endpoint"
```

### Task 2.3: Wire LiveCockpit to poll the endpoint and derive state

**Files:**
- Modify: `website/src/components/live/LiveCockpit.svelte`

- [ ] **Step 1: Replace the placeholder body with polling logic**

Overwrite `website/src/components/live/LiveCockpit.svelte`:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { LiveCockpitData, LiveState } from '../../lib/live-state';

  const POLL_MS = 5000;

  let data = $state<LiveCockpitData | null>(null);
  let state = $state<LiveState>('empty');
  let loadError = $state<string | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function refresh() {
    try {
      const res = await fetch('/api/live/state', { credentials: 'same-origin' });
      if (!res.ok) {
        loadError = `Cockpit nicht erreichbar (${res.status})`;
        return;
      }
      const json = await res.json() as LiveCockpitData & { state: LiveState };
      data = json;
      state = json.state;
      loadError = null;
    } catch (err) {
      loadError = 'Netzwerkfehler';
    }
  }

  onMount(() => {
    refresh();
    timer = setInterval(refresh, POLL_MS);
  });
  onDestroy(() => { if (timer) clearInterval(timer); });
</script>

<div class="text-light" data-testid="live-cockpit" data-state={state}>
  {#if loadError}
    <div class="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 mb-4">
      {loadError}
      <button onclick={refresh} class="ml-3 underline">Erneut versuchen</button>
    </div>
  {/if}

  {#if !data}
    <p class="text-muted">Cockpit lädt…</p>
  {:else if state === 'empty'}
    <p data-testid="cockpit-empty" class="text-muted">— nichts läuft gerade —</p>
  {:else if state === 'stream'}
    <p data-testid="cockpit-stream" class="text-muted">— Stream-Cockpit —</p>
  {:else if state === 'rooms'}
    <p data-testid="cockpit-rooms" class="text-muted">— Räume-Board —</p>
  {:else}
    <p data-testid="cockpit-both" class="text-muted">— Beides —</p>
  {/if}
</div>
```

- [ ] **Step 2: Manual smoke**

Run `task website:dev`, log in as admin, open `/admin/live`. The page should show one of the four placeholder strings (most likely `— nichts läuft gerade —`). Open DevTools network tab — `/api/live/state` should be hit every 5 seconds with `200`.

- [ ] **Step 3: Commit**

```bash
git add website/src/components/live/LiveCockpit.svelte
git commit -m "feat(live-cockpit): poll /api/live/state and switch on derived state"
```

---

## Phase 3 — Launchpad (empty state)

### Task 3.1: Build the Launchpad component

**Files:**
- Create: `website/src/components/live/Launchpad.svelte`
- Modify: `website/src/components/live/LiveCockpit.svelte`

- [ ] **Step 1: Write the failing test**

Append to `tests/e2e/specs/fa-admin-live.spec.ts` (these tests will be auth-skipped on CI but assert structure on a logged-in dev session):

```typescript
test('T6: Launchpad shows Stream-start + Letzte Sessions when empty', async ({ page }) => {
  await page.goto(`${BASE}/admin/live`);
  // We can't authenticate via Playwright in the basic suite — assert just the testid presence
  const cockpit = page.locator('[data-testid=live-cockpit]');
  // Anonymous requests redirect; if logged-in dev cookie is present, we'd see launchpad.
  // Skip if redirected away.
  if (!page.url().includes('/admin/live')) test.skip();
  await expect(cockpit).toBeVisible();
});
```

- [ ] **Step 2: Create `Launchpad.svelte`**

Create `website/src/components/live/Launchpad.svelte`:

```svelte
<script lang="ts">
  import type { LiveCockpitData } from '../../lib/live-state';

  let { data }: { data: LiveCockpitData } = $props();

  function fmtDate(d: Date | string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function fmtTime(d: Date | string | null) {
    if (!d) return '';
    return new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div data-testid="cockpit-launchpad" class="space-y-8">
  <div class="grid md:grid-cols-2 gap-4">
    <a href="/admin/live?force=stream"
       class="bg-dark-light border border-dark-lighter rounded-2xl p-6 hover:border-gold transition-colors block">
      <div class="text-3xl mb-2">📡</div>
      <h2 class="text-lg font-serif text-light mb-1">Stream starten</h2>
      <p class="text-sm text-muted">Browser oder OBS → live an web.&lt;brand&gt;.de/portal/stream</p>
    </a>

    <a href="https://files.{import.meta.env.PROD_DOMAIN ?? 'mentolder.de'}/apps/spreed/"
       target="_blank" rel="noopener"
       class="bg-dark-light border border-dark-lighter rounded-2xl p-6 hover:border-gold transition-colors block">
      <div class="text-3xl mb-2">🎙</div>
      <h2 class="text-lg font-serif text-light mb-1">Talk-Call starten</h2>
      <p class="text-sm text-muted">In Nextcloud Talk eröffnen — taucht hier automatisch auf, sobald jemand drin ist.</p>
    </a>
  </div>

  <section>
    <h2 class="text-xs uppercase tracking-wide text-muted mb-3">Letzte Sessions</h2>
    {#if data.recentSessions.length === 0}
      <p class="text-muted text-sm">Noch keine aufgezeichneten Sessions.</p>
    {:else}
      <ul class="space-y-1">
        {#each data.recentSessions as m}
          <li>
            <a href={`/admin/live/sessions/${m.id}`}
               class="block bg-dark-light border border-dark-lighter rounded-lg px-4 py-2 hover:border-gold/40 flex items-center gap-4">
              <span class="text-xs font-mono text-muted">{fmtDate(m.startedAt ?? m.createdAt)} {fmtTime(m.startedAt ?? m.createdAt)}</span>
              <span class="text-sm text-light flex-1 truncate">{m.customerName}</span>
              <span class="text-xs text-muted">{m.meetingType}</span>
              {#if m.hasTranscript}<span class="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">📝</span>{/if}
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>
```

- [ ] **Step 3: Use it in `LiveCockpit.svelte`**

Replace the `{:else if state === 'empty'}` branch in `LiveCockpit.svelte`:

```svelte
{:else if state === 'empty'}
  <Launchpad {data} />
```

And add the import at top of the `<script>`:

```typescript
import Launchpad from './Launchpad.svelte';
```

- [ ] **Step 4: Manual smoke**

Visit `/admin/live` with no stream + no calls active. You should see two big buttons (Stream-start, Talk-Call-start) and a "Letzte Sessions" list of up to 12 recent meetings.

- [ ] **Step 5: Commit**

```bash
git add website/src/components/live/Launchpad.svelte website/src/components/live/LiveCockpit.svelte tests/e2e/specs/fa-admin-live.spec.ts
git commit -m "feat(live-cockpit): Launchpad with start-buttons + recent sessions"
```

---

## Phase 4 — Multi-Room board (read side)

### Task 4.1: ActiveRoomCard

**Files:**
- Create: `website/src/components/live/rooms/ActiveRoomCard.svelte`

- [ ] **Step 1: Create the card component**

Create `website/src/components/live/rooms/ActiveRoomCard.svelte`:

```svelte
<script lang="ts">
  import type { ActiveCallRoom } from '../../../lib/nextcloud-talk-db';

  let {
    room,
    onclick,
    transcribing = false,
  }: {
    room: ActiveCallRoom;
    onclick?: () => void;
    transcribing?: boolean;
  } = $props();

  function durationLabel(activeSince: Date | null): string {
    if (!activeSince) return '—';
    const ms = Date.now() - new Date(activeSince).getTime();
    const min = Math.floor(ms / 60_000);
    if (min < 1) return '< 1 min';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}h ${m}m`;
  }
</script>

<button
  type="button"
  data-testid="active-room-card"
  data-token={room.token}
  onclick={onclick}
  class="text-left bg-dark-light border border-dark-lighter rounded-xl px-4 py-3 hover:border-gold/40 transition-colors w-full"
>
  <div class="flex items-center justify-between mb-1">
    <span class="text-sm font-medium text-light truncate">{room.displayName || room.name || room.token}</span>
    {#if transcribing}
      <span class="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-400/20">📝</span>
    {/if}
  </div>
  <div class="text-xs text-muted">⏱ {durationLabel(room.activeSince)}</div>
</button>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/live/rooms/ActiveRoomCard.svelte
git commit -m "feat(live-cockpit): ActiveRoomCard component"
```

### Task 4.2: RoomDrawer (drill-down)

**Files:**
- Create: `website/src/components/live/rooms/RoomDrawer.svelte`

- [ ] **Step 1: Create the drawer**

Create `website/src/components/live/rooms/RoomDrawer.svelte`:

```svelte
<script lang="ts">
  import type { ActiveCallRoom } from '../../../lib/nextcloud-talk-db';

  let {
    room,
    onclose,
    transcribing = false,
    onStartTranscribe,
    onStopTranscribe,
  }: {
    room: ActiveCallRoom | null;
    onclose: () => void;
    transcribing?: boolean;
    onStartTranscribe?: (token: string) => Promise<void>;
    onStopTranscribe?: (token: string) => Promise<void>;
  } = $props();
</script>

{#if room}
  <div class="fixed inset-0 z-40 bg-black/60" onclick={onclose} role="presentation"></div>
  <aside data-testid="room-drawer" data-token={room.token}
         class="fixed right-0 top-0 bottom-0 w-full max-w-md bg-dark-light border-l border-dark-lighter z-50 p-6 overflow-y-auto">
    <div class="flex justify-between items-start mb-4">
      <div>
        <h2 class="text-xl font-serif text-light">{room.displayName || room.name}</h2>
        <p class="text-xs text-muted font-mono mt-0.5">{room.token}</p>
      </div>
      <button onclick={onclose} aria-label="Schließen"
              class="text-muted hover:text-light text-2xl leading-none">×</button>
    </div>

    <section class="space-y-3">
      <h3 class="text-xs uppercase tracking-wide text-muted">Aktionen</h3>
      {#if transcribing}
        <button onclick={() => onStopTranscribe?.(room.token)}
                class="w-full px-4 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-400/30 text-sm font-semibold">
          🎙 Transkription stoppen
        </button>
      {:else}
        <button onclick={() => onStartTranscribe?.(room.token)}
                class="w-full px-4 py-2 rounded-lg bg-gold text-dark text-sm font-semibold">
          🎙 Transkription starten
        </button>
      {/if}
    </section>
  </aside>
{/if}
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/live/rooms/RoomDrawer.svelte
git commit -m "feat(live-cockpit): RoomDrawer with transcription start/stop"
```

### Task 4.3: RoomsBoard

**Files:**
- Create: `website/src/components/live/rooms/RoomsBoard.svelte`
- Modify: `website/src/components/live/LiveCockpit.svelte`

- [ ] **Step 1: Create RoomsBoard**

Create `website/src/components/live/rooms/RoomsBoard.svelte`:

```svelte
<script lang="ts">
  import type { ActiveCallRoom } from '../../../lib/nextcloud-talk-db';
  import ActiveRoomCard from './ActiveRoomCard.svelte';
  import RoomDrawer from './RoomDrawer.svelte';

  let { rooms }: { rooms: ActiveCallRoom[] } = $props();

  let activeSessions = $state<string[]>([]);
  let selected = $state<ActiveCallRoom | null>(null);

  async function refreshTranscriptionState() {
    try {
      const res = await fetch('/api/admin/transcription');
      if (!res.ok) return;
      const data = await res.json() as { activeSessions: string[] };
      activeSessions = data.activeSessions ?? [];
    } catch { /* ignore */ }
  }
  $effect(() => { refreshTranscriptionState(); });

  async function startTranscribe(token: string) {
    await fetch('/api/admin/transcription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action: 'start' }),
    });
    activeSessions = [...activeSessions.filter(t => t !== token), token];
  }
  async function stopTranscribe(token: string) {
    await fetch('/api/admin/transcription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action: 'stop' }),
    });
    activeSessions = activeSessions.filter(t => t !== token);
  }
</script>

<div data-testid="rooms-board">
  <h2 class="text-xs uppercase tracking-wide text-muted mb-3">Aktive Talk-Räume ({rooms.length})</h2>
  {#if rooms.length === 0}
    <p class="text-muted text-sm">Keine aktiven Calls.</p>
  {:else}
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {#each rooms as r (r.token)}
        <ActiveRoomCard
          room={r}
          transcribing={activeSessions.includes(r.token)}
          onclick={() => selected = r}
        />
      {/each}
    </div>
  {/if}

  <RoomDrawer
    room={selected}
    transcribing={selected ? activeSessions.includes(selected.token) : false}
    onclose={() => selected = null}
    onStartTranscribe={startTranscribe}
    onStopTranscribe={stopTranscribe}
  />
</div>
```

- [ ] **Step 2: Wire it into LiveCockpit**

In `LiveCockpit.svelte`, add the import:

```typescript
import RoomsBoard from './rooms/RoomsBoard.svelte';
```

Replace the `{:else if state === 'rooms'}` branch:

```svelte
{:else if state === 'rooms'}
  <RoomsBoard rooms={data.rooms} />
```

- [ ] **Step 3: Manual smoke**

Start a Talk-call (in Nextcloud Talk, manually). Within ~5 s, `/admin/live` should switch from `empty` → `rooms` and show the call as a card. Click the card → drawer opens. Click "Transkription starten" → green badge appears on the card.

- [ ] **Step 4: Commit**

```bash
git add website/src/components/live/rooms/RoomsBoard.svelte website/src/components/live/LiveCockpit.svelte
git commit -m "feat(live-cockpit): RoomsBoard with drawer + per-room transcription"
```

---

## Phase 5 — Bulk actions bar (Brett / Poll / Transcription für alle)

This phase extracts the modals from the old `meetings.astro` script into proper Svelte components and exposes them via a shared `BulkActionsBar`.

### Task 5.1: BrettBroadcastModal

**Files:**
- Create: `website/src/components/live/rooms/BrettBroadcastModal.svelte`

- [ ] **Step 1: Create the modal as a self-contained Svelte component**

Create `website/src/components/live/rooms/BrettBroadcastModal.svelte`:

```svelte
<script lang="ts">
  import type { ActiveCallRoom } from '../../../lib/nextcloud-talk-db';

  let { open, onclose }: { open: boolean; onclose: () => void } = $props();

  let rooms = $state<ActiveCallRoom[]>([]);
  let intro = $state('Lade laufende Calls…');
  let result = $state<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  let busy = $state(false);

  async function load() {
    intro = 'Lade laufende Calls…';
    rooms = [];
    result = null;
    try {
      const res = await fetch('/api/admin/brett/broadcast');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { rooms: ActiveCallRoom[] };
      rooms = data.rooms ?? [];
      intro = rooms.length === 0
        ? 'Aktuell läuft kein Talk-Call.'
        : `Brett-Link wird in folgende ${rooms.length} laufende(n) Call(s) gepostet:`;
    } catch { intro = 'Fehler beim Laden der Calls.'; }
  }
  $effect(() => { if (open) load(); });

  async function broadcast() {
    busy = true;
    try {
      const res = await fetch('/api/admin/brett/broadcast', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { total: number; sent: number; failed: number };
      result = data.failed === 0
        ? { kind: 'ok',  text: `✓ Brett-Link an ${data.sent} Call(s) gesendet.` }
        : { kind: 'warn', text: `${data.sent}/${data.total} gesendet, ${data.failed} fehlgeschlagen.` };
    } catch { result = { kind: 'err', text: 'Senden fehlgeschlagen.' }; }
    finally { busy = false; }
  }
</script>

{#if open}
  <div class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
       onclick={(e) => { if (e.currentTarget === e.target) onclose(); }}
       role="presentation">
    <div class="bg-dark-light rounded-2xl border border-dark-lighter max-w-lg w-full p-6 shadow-xl">
      <h2 class="text-xl font-serif text-light mb-2">🎯 Systemisches Brett</h2>
      <p class="text-sm text-muted mb-4">{intro}</p>

      <ul class="max-h-64 overflow-y-auto space-y-1 mb-5 text-sm text-light">
        {#each rooms as r (r.token)}
          <li class="px-3 py-2 bg-dark rounded border border-dark-lighter">{r.displayName || r.name || r.token}</li>
        {/each}
      </ul>

      {#if result}
        <p class="mb-4 text-sm" class:text-green-400={result.kind==='ok'} class:text-yellow-400={result.kind==='warn'} class:text-red-400={result.kind==='err'}>{result.text}</p>
      {/if}

      <div class="flex justify-end gap-2">
        <button onclick={onclose}
                class="px-4 py-2 bg-dark rounded-lg border border-dark-lighter text-sm text-muted hover:text-light">
          Schließen
        </button>
        <button onclick={broadcast} disabled={busy || rooms.length===0}
                class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold disabled:opacity-40">
          {busy ? 'Sende…' : 'Senden'}
        </button>
      </div>
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/live/rooms/BrettBroadcastModal.svelte
git commit -m "feat(live-cockpit): BrettBroadcastModal extracted to component"
```

### Task 5.2: PollBroadcastModal

**Files:**
- Create: `website/src/components/live/rooms/PollBroadcastModal.svelte`

- [ ] **Step 1: Create the component**

Create `website/src/components/live/rooms/PollBroadcastModal.svelte`. The implementation mirrors the existing inline script in `meetings.astro` (lines ~390–650). Use the existing endpoints `POST /api/admin/poll`, `GET /api/admin/poll/active`, `GET /api/admin/poll/:id`, `POST /api/admin/poll/:id/share`. Templates come from `POLL_TEMPLATES` exported by `website/src/lib/poll-db.ts` — fetch them via a small new endpoint OR inline via Astro `define:vars`. To keep the component self-contained, inline templates inside the component's `templates` constant (it's a short list — see `lib/poll-db.ts`). Below is the full file:

```svelte
<script lang="ts">
  let {
    open,
    onclose,
    onActivePoll,
  }: {
    open: boolean;
    onclose: () => void;
    onActivePoll?: (poll: { id: string; question: string; kind: string }) => void;
  } = $props();

  type Tpl = { label: string; question: string; kind: 'multiple_choice' | 'text'; options: string[] | null };
  // Match website/src/lib/poll-db.ts POLL_TEMPLATES exactly when implementing.
  // Fetch the list from a small companion endpoint if you don't want to duplicate it:
  let templates = $state<Tpl[]>([]);
  let loadedTemplates = false;

  async function ensureTemplates() {
    if (loadedTemplates) return;
    try {
      const r = await fetch('/api/admin/poll/templates');
      if (r.ok) templates = (await r.json() as { templates: Tpl[] }).templates;
    } catch {}
    loadedTemplates = true;
  }

  let selected = $state<number | 'custom' | null>(null);
  let question = $state('');
  let kind = $state<'multiple_choice' | 'text'>('text');
  let options = $state<string[]>([]);
  let result = $state<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  let busy = $state(false);

  function pick(i: number | 'custom') {
    selected = i;
    if (i === 'custom') {
      kind = 'text'; question = ''; options = [];
    } else {
      const t = templates[i];
      kind = t.kind; question = t.question;
      options = t.options ? [...t.options] : [];
    }
  }

  function valid(): boolean {
    if (question.trim().length < 2) return false;
    if (kind === 'multiple_choice') return options.filter(o => o.trim()).length >= 2;
    return true;
  }

  async function submit() {
    busy = true;
    result = null;
    try {
      const res = await fetch('/api/admin/poll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim(), kind, options: kind === 'multiple_choice' ? options.filter(o => o.trim()) : null }),
      });
      const data = await res.json() as { poll?: { id: string; question: string; kind: string }; error?: string; sent?: number; total?: number };
      if (res.ok && data.poll) {
        onActivePoll?.(data.poll);
        onclose();
      } else if (res.status === 409) {
        result = { kind: 'warn', text: 'Es läuft bereits eine Umfrage.' };
      } else {
        result = { kind: 'err', text: 'Fehler: ' + (data.error ?? 'Unbekannt') };
      }
    } catch { result = { kind: 'err', text: 'Netzwerkfehler.' }; }
    finally { busy = false; }
  }

  $effect(() => { if (open) ensureTemplates(); });
</script>

{#if open}
  <div class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
       onclick={(e) => { if (e.currentTarget === e.target) onclose(); }} role="presentation">
    <div class="bg-dark-light rounded-2xl border border-dark-lighter max-w-lg w-full p-6 shadow-xl">
      <h2 class="text-xl font-serif text-light mb-2">📊 Umfrage starten</h2>

      <div class="flex flex-col gap-2 mb-4">
        {#each templates as t, i}
          <label class="flex items-center gap-3 px-3 py-2 rounded-lg border border-dark-lighter hover:border-gold/40 text-sm text-light cursor-pointer">
            <input type="radio" name="poll-tpl" value={i} checked={selected===i} onchange={() => pick(i)} class="accent-gold" />
            <span><strong>{t.label}</strong>
              <span class="text-muted ml-1">{t.options ? t.options.join(' · ') : 'Freitext'}</span></span>
          </label>
        {/each}
        <label class="flex items-center gap-3 px-3 py-2 rounded-lg border border-dark-lighter hover:border-gold/40 text-sm cursor-pointer">
          <input type="radio" name="poll-tpl" value="custom" checked={selected==='custom'} onchange={() => pick('custom')} class="accent-gold" />
          <span><strong style="color:#d7b06a">Eigene Frage…</strong>
            <span class="text-muted ml-1">Freitext-Antwort</span></span>
        </label>
      </div>

      {#if selected !== null}
        <div class="space-y-3 bg-dark rounded-xl border border-dark-lighter p-3 mb-4">
          <input type="text" bind:value={question} maxlength="200" placeholder="Ihre Frage…"
            class="w-full bg-dark-light border border-dark-lighter rounded-lg px-3 py-2 text-sm text-light focus:outline-none focus:border-gold" />
          {#if kind === 'multiple_choice'}
            <div class="flex flex-col gap-1.5">
              {#each options as opt, i}
                <div class="flex gap-1.5">
                  <input type="text" bind:value={options[i]} maxlength="100" placeholder="Option…"
                    class="flex-1 bg-dark-light border border-dark-lighter rounded-lg px-3 py-1.5 text-sm text-light focus:outline-none focus:border-gold" />
                  <button onclick={() => options = options.filter((_, j) => j !== i)}
                    class="px-2 text-muted hover:text-red-400 text-lg leading-none">×</button>
                </div>
              {/each}
              <button type="button" onclick={() => options = [...options, '']}
                class="mt-2 text-xs text-gold hover:text-gold/70 self-start">+ Option hinzufügen</button>
            </div>
          {/if}
        </div>
      {/if}

      {#if result}
        <p class="mb-4 text-sm" class:text-green-400={result.kind==='ok'} class:text-yellow-400={result.kind==='warn'} class:text-red-400={result.kind==='err'}>{result.text}</p>
      {/if}

      <div class="flex gap-2 justify-end">
        <button onclick={onclose} class="px-4 py-2 bg-dark rounded-lg border border-dark-lighter text-sm text-muted hover:text-light">Abbrechen</button>
        <button onclick={submit} disabled={busy || !valid()}
          class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold disabled:opacity-40">
          {busy ? '…' : '📊 Umfrage starten'}
        </button>
      </div>
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Add the templates endpoint**

Create `website/src/pages/api/admin/poll/templates.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { POLL_TEMPLATES } from '../../../../lib/poll-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  return new Response(JSON.stringify({ templates: POLL_TEMPLATES }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 3: Commit**

```bash
git add website/src/components/live/rooms/PollBroadcastModal.svelte website/src/pages/api/admin/poll/templates.ts
git commit -m "feat(live-cockpit): PollBroadcastModal + /api/admin/poll/templates"
```

### Task 5.3: TranscriptionModal (bulk + per-room)

**Files:**
- Create: `website/src/components/live/rooms/TranscriptionModal.svelte`

- [ ] **Step 1: Create the component**

```svelte
<script lang="ts">
  type TrRoom = { token: string; displayName: string };

  let { open, onclose }: { open: boolean; onclose: () => void } = $props();

  let rooms = $state<TrRoom[]>([]);
  let activeSessions = $state<string[]>([]);
  let intro = $state('Lade laufende Calls…');
  let result = $state<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function load() {
    intro = 'Lade laufende Calls…'; rooms = []; result = null;
    try {
      const res = await fetch('/api/admin/transcription');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { rooms: TrRoom[]; activeSessions: string[] };
      rooms = data.rooms ?? []; activeSessions = data.activeSessions ?? [];
      intro = rooms.length === 0 ? 'Aktuell läuft kein Talk-Call.' : `${rooms.length} laufende(r) Call(s) — Transkription steuern:`;
    } catch { intro = 'Fehler beim Laden der Calls.'; }
  }
  $effect(() => { if (open) load(); });

  async function toggle(token: string, action: 'start' | 'stop') {
    const res = await fetch('/api/admin/transcription', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action }),
    });
    if (res.ok) {
      activeSessions = action === 'start'
        ? [...activeSessions.filter(t => t !== token), token]
        : activeSessions.filter(t => t !== token);
    }
  }
  async function startAll() {
    const inactive = rooms.filter(r => !activeSessions.includes(r.token));
    const started = await Promise.all(inactive.map(r =>
      fetch('/api/admin/transcription', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: r.token, action: 'start' }),
      }).then(res => res.ok ? r.token : null)
    ));
    const ok = started.filter(Boolean) as string[];
    activeSessions = [...new Set([...activeSessions, ...ok])];
    if (ok.length > 0) result = { kind: 'ok', text: `✓ Transkription für ${ok.length} Call(s) gestartet.` };
  }

  $: inactiveCount = rooms.filter(r => !activeSessions.includes(r.token)).length;
</script>

{#if open}
  <div class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
       onclick={(e) => { if (e.currentTarget === e.target) onclose(); }} role="presentation">
    <div class="bg-dark-light rounded-2xl border border-dark-lighter max-w-lg w-full p-6 shadow-xl">
      <h2 class="text-xl font-serif text-light mb-2">🎙 Transkription</h2>
      <p class="text-sm text-muted mb-4">{intro}</p>

      <ul class="max-h-64 overflow-y-auto space-y-1 mb-5 text-sm text-light">
        {#each rooms as r (r.token)}
          {@const isActive = activeSessions.includes(r.token)}
          <li class="flex items-center justify-between px-3 py-2 bg-dark rounded border border-dark-lighter gap-3">
            <span class="flex-1 truncate">{r.displayName || r.token}</span>
            <span class={isActive
              ? 'text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-400/20'
              : 'text-xs px-1.5 py-0.5 rounded bg-dark-lighter text-muted border border-dark-lighter'}>
              {isActive ? '🟢 Aktiv' : '⚫ Inaktiv'}
            </span>
            <button onclick={() => toggle(r.token, isActive ? 'stop' : 'start')}
              class={isActive ? 'px-2 py-1 text-xs rounded border border-red-400/30 text-red-400 hover:bg-red-400/10'
                              : 'px-2 py-1 text-xs rounded border border-gold/30 text-gold hover:bg-gold/10'}>
              {isActive ? 'Stop' : 'Start'}
            </button>
          </li>
        {/each}
      </ul>

      {#if result}<p class="mb-4 text-sm text-green-400">{result.text}</p>{/if}

      <div class="flex justify-end gap-2">
        <button onclick={onclose} class="px-4 py-2 bg-dark rounded-lg border border-dark-lighter text-sm text-muted hover:text-light">Schließen</button>
        <button onclick={startAll} disabled={inactiveCount===0}
          class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold disabled:opacity-40">
          {inactiveCount > 0 ? `▶ Alle starten (${inactiveCount})` : '✓ Alle aktiv'}
        </button>
      </div>
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/live/rooms/TranscriptionModal.svelte
git commit -m "feat(live-cockpit): TranscriptionModal extracted to component"
```

### Task 5.4: BulkActionsBar

**Files:**
- Create: `website/src/components/live/rooms/BulkActionsBar.svelte`
- Modify: `website/src/components/live/rooms/RoomsBoard.svelte` (mount the bar)

- [ ] **Step 1: Create BulkActionsBar**

```svelte
<script lang="ts">
  import BrettBroadcastModal from './BrettBroadcastModal.svelte';
  import PollBroadcastModal from './PollBroadcastModal.svelte';
  import TranscriptionModal from './TranscriptionModal.svelte';

  let openBrett = $state(false);
  let openPoll = $state(false);
  let openTr = $state(false);
</script>

<div data-testid="bulk-actions-bar" class="flex flex-wrap gap-2 mb-4">
  <button onclick={() => openBrett = true}
    class="px-4 py-2 bg-dark-light text-light rounded-lg text-sm font-semibold border border-dark-lighter hover:border-gold/40">
    🎯 Brett für alle
  </button>
  <button onclick={() => openPoll = true}
    class="px-4 py-2 bg-dark-light text-light rounded-lg text-sm font-semibold border border-dark-lighter hover:border-gold/40">
    📊 Umfrage starten
  </button>
  <button onclick={() => openTr = true}
    class="px-4 py-2 bg-dark-light text-light rounded-lg text-sm font-semibold border border-dark-lighter hover:border-gold/40">
    🎙 Transkription
  </button>
</div>

<BrettBroadcastModal open={openBrett} onclose={() => openBrett = false} />
<PollBroadcastModal open={openPoll} onclose={() => openPoll = false} />
<TranscriptionModal open={openTr} onclose={() => openTr = false} />
```

- [ ] **Step 2: Mount in RoomsBoard**

In `website/src/components/live/rooms/RoomsBoard.svelte`, add at the top of the script:

```typescript
import BulkActionsBar from './BulkActionsBar.svelte';
```

Insert `<BulkActionsBar />` immediately under the `<h2>`:

```svelte
<h2 class="text-xs uppercase tracking-wide text-muted mb-3">Aktive Talk-Räume ({rooms.length})</h2>
<BulkActionsBar />
```

- [ ] **Step 3: Manual smoke**

Visit `/admin/live` with a Talk-call active. Three buttons should show above the card grid: "Brett für alle", "Umfrage starten", "Transkription". Each opens its respective modal.

- [ ] **Step 4: Commit**

```bash
git add website/src/components/live/rooms/BulkActionsBar.svelte website/src/components/live/rooms/RoomsBoard.svelte
git commit -m "feat(live-cockpit): BulkActionsBar wires Brett/Poll/Transcribe modals"
```

---

## Phase 6 — Stream cockpit (host side)

### Task 6.1: PublishControls (mode toggle Browser ↔ OBS)

**Files:**
- Create: `website/src/components/live/stream/PublishControls.svelte`

- [ ] **Step 1: Create the component**

```svelte
<script lang="ts">
  let { mode = $bindable<'browser' | 'obs'>('browser') }: { mode?: 'browser' | 'obs' } = $props();

  const streamDomain = (import.meta.env.PUBLIC_STREAM_DOMAIN as string) || 'stream.localhost';
  const rtmpKey = (import.meta.env.PUBLIC_LIVEKIT_RTMP_KEY as string) || 'devrtmpkey123456';

  function setMode(m: 'browser' | 'obs') { mode = m; }
</script>

<div class="space-y-4">
  <div class="flex gap-2" role="tablist" aria-label="Sendemodus">
    <button type="button" role="tab" aria-selected={mode==='browser'}
            onclick={() => setMode('browser')}
            class={mode==='browser'
              ? 'px-4 py-2 rounded-lg text-sm font-semibold border bg-gold text-dark border-gold'
              : 'px-4 py-2 rounded-lg text-sm font-semibold border bg-dark border-dark-lighter text-light hover:border-gold'}>
      📹 Im Browser senden
    </button>
    <button type="button" role="tab" aria-selected={mode==='obs'}
            onclick={() => setMode('obs')}
            class={mode==='obs'
              ? 'px-4 py-2 rounded-lg text-sm font-semibold border bg-gold text-dark border-gold'
              : 'px-4 py-2 rounded-lg text-sm font-semibold border bg-dark border-dark-lighter text-light hover:border-gold'}>
      🎬 Mit OBS (RTMP)
    </button>
  </div>

  {#if mode === 'obs'}
    <div class="bg-dark-light border border-dark-lighter rounded-xl p-5">
      <h2 class="text-sm font-semibold text-light mb-3">OBS / RTMP Zugangsdaten</h2>
      <div class="space-y-2 text-sm">
        <div>
          <span class="text-muted">Server URL</span>
          <code class="block mt-1 bg-dark px-3 py-2 rounded text-gold font-mono">rtmp://{streamDomain}/live</code>
        </div>
        <div>
          <span class="text-muted">Stream Key</span>
          <code class="block mt-1 bg-dark px-3 py-2 rounded text-gold font-mono">{rtmpKey}</code>
        </div>
      </div>
    </div>
  {/if}
</div>
```

> Note on env vars: `STREAM_DOMAIN` and `LIVEKIT_RTMP_KEY` must be exposed to the client. In `astro.config.mjs` they are already passed via SSR; for a client component use `PUBLIC_*` mirrors. Add the mirrors in `website/Dockerfile` or check existing approach used by `stream.astro` (it injects via `define:vars` at SSR time — alternative: have `index.astro` pass the values as props).

- [ ] **Step 2: Pass values from `index.astro` as props**

Modify `website/src/pages/admin/live/index.astro` — pass these to `LiveCockpit`:

```astro
---
import AdminLayout from '../../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../../lib/auth';
import LiveCockpit from '../../../components/live/LiveCockpit.svelte';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

const livekitDomain = process.env.LIVEKIT_DOMAIN || 'livekit.localhost';
const livekitUrl = livekitDomain.endsWith('.localhost') ? `ws://${livekitDomain}` : `wss://${livekitDomain}`;
const streamDomain = process.env.STREAM_DOMAIN || 'stream.localhost';
const rtmpKey = process.env.LIVEKIT_RTMP_KEY || 'devrtmpkey123456';
---

<AdminLayout title="Live">
  <section class="pt-6 pb-12 bg-dark min-h-screen">
    <div class="max-w-7xl mx-auto px-6">
      <LiveCockpit client:load {livekitUrl} {streamDomain} {rtmpKey} />
    </div>
  </section>
</AdminLayout>
```

Update `LiveCockpit.svelte` to accept and forward those props (add to `$props()` and pass into `StreamCockpit` later in Task 6.4). Then update `PublishControls.svelte` to take props instead of `import.meta.env`:

```svelte
<script lang="ts">
  let {
    mode = $bindable<'browser' | 'obs'>('browser'),
    streamDomain,
    rtmpKey,
  }: { mode?: 'browser' | 'obs'; streamDomain: string; rtmpKey: string } = $props();
</script>
```

And replace `{streamDomain}` / `{rtmpKey}` template references accordingly (already correct above).

- [ ] **Step 3: Commit**

```bash
git add website/src/components/live/stream/PublishControls.svelte website/src/pages/admin/live/index.astro
git commit -m "feat(live-cockpit): PublishControls (browser/OBS toggle)"
```

### Task 6.2: RecordingPanel

**Files:**
- Create: `website/src/components/live/stream/RecordingPanel.svelte`

- [ ] **Step 1: Create the component**

```svelte
<script lang="ts">
  let egressId = $state<string | null>(null);
  let status = $state<{ kind: 'idle' | 'running' | 'err'; text: string }>({ kind: 'idle', text: '' });
  let busy = $state(false);
  let startedAt = $state<number | null>(null);
  let elapsed = $state('00:00');

  $effect(() => {
    if (!startedAt) return;
    const t = setInterval(() => {
      const ms = Date.now() - startedAt!;
      const s = Math.floor(ms / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      elapsed = `${mm}:${ss}`;
    }, 1000);
    return () => clearInterval(t);
  });

  async function toggle() {
    busy = true;
    try {
      if (!egressId) {
        const res = await fetch('/api/stream/recording', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start' }),
        });
        const data = await res.json() as { egressId?: string; error?: string };
        if (!res.ok || !data.egressId) {
          status = { kind: 'err', text: data.error ?? 'Aufzeichnung konnte nicht gestartet werden.' };
          return;
        }
        egressId = data.egressId;
        startedAt = Date.now();
        status = { kind: 'running', text: 'Aufzeichnung läuft' };
      } else {
        const res = await fetch('/api/stream/recording', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'stop', egressId }),
        });
        if (!res.ok) {
          status = { kind: 'err', text: 'Stoppen fehlgeschlagen.' };
          return;
        }
        egressId = null;
        startedAt = null;
        elapsed = '00:00';
        status = { kind: 'idle', text: 'Gespeichert in /recordings/' };
      }
    } finally { busy = false; }
  }
</script>

<div class="bg-dark-light border border-dark-lighter rounded-xl p-5">
  <h2 class="text-sm font-semibold text-light mb-3">Aufzeichnung</h2>
  <div class="flex items-center gap-4">
    <button onclick={toggle} disabled={busy}
      class={egressId
        ? 'px-4 py-2 rounded-lg text-sm font-semibold border border-red-500 text-red-400 disabled:opacity-50'
        : 'px-4 py-2 rounded-lg text-sm font-semibold bg-dark border border-dark-lighter text-light hover:border-gold disabled:opacity-50'}>
      {egressId ? '⏹ Aufzeichnung stoppen' : '● Aufzeichnung starten'}
    </button>
    <span class="text-sm" class:text-red-400={status.kind==='err'} class:text-muted={status.kind!=='err'}>
      {status.text} {egressId ? `· ${elapsed}` : ''}
    </span>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/live/stream/RecordingPanel.svelte
git commit -m "feat(live-cockpit): RecordingPanel with elapsed timer"
```

### Task 6.3: ConnectionIndicator

**Files:**
- Create: `website/src/components/live/stream/ConnectionIndicator.svelte`

- [ ] **Step 1: Create the component**

```svelte
<script lang="ts">
  import type { Room } from 'livekit-client';
  import { ConnectionQuality } from 'livekit-client';

  let { room }: { room: Room | null } = $props();

  let quality = $state<ConnectionQuality>(ConnectionQuality.Unknown);

  $effect(() => {
    if (!room) return;
    const handler = (q: ConnectionQuality) => { quality = q; };
    room.on('connectionQualityChanged', handler);
    return () => { room.off('connectionQualityChanged', handler); };
  });

  const labels: Record<ConnectionQuality, { text: string; color: string }> = {
    [ConnectionQuality.Excellent]: { text: '● Ausgezeichnet', color: 'text-green-400' },
    [ConnectionQuality.Good]:      { text: '● Gut',           color: 'text-green-400' },
    [ConnectionQuality.Poor]:      { text: '● Wackelig',      color: 'text-yellow-400' },
    [ConnectionQuality.Lost]:      { text: '● Abgebrochen',   color: 'text-red-400' },
    [ConnectionQuality.Unknown]:   { text: '○ Unbekannt',     color: 'text-muted' },
  };
</script>

<span class={`text-xs font-mono ${labels[quality].color}`} data-testid="connection-indicator">
  {labels[quality].text}
</span>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/live/stream/ConnectionIndicator.svelte
git commit -m "feat(live-cockpit): ConnectionIndicator (LiveKit quality)"
```

### Task 6.4: StreamCockpit (composition)

**Files:**
- Create: `website/src/components/live/stream/StreamCockpit.svelte`
- Modify: `website/src/components/live/LiveCockpit.svelte`

- [ ] **Step 1: Create StreamCockpit**

```svelte
<script lang="ts">
  import StreamPlayer from '../../LiveStream/StreamPlayer.svelte';
  import PublishControls from './PublishControls.svelte';
  import RecordingPanel from './RecordingPanel.svelte';

  let {
    livekitUrl,
    streamDomain,
    rtmpKey,
  }: { livekitUrl: string; streamDomain: string; rtmpKey: string } = $props();

  let mode = $state<'browser' | 'obs'>('browser');
</script>

<div data-testid="stream-cockpit" class="space-y-6">
  <div class="flex items-center justify-between">
    <h2 class="text-xs uppercase tracking-wide text-muted">Stream-Cockpit</h2>
  </div>

  <PublishControls bind:mode {streamDomain} {rtmpKey} />
  <RecordingPanel />

  <StreamPlayer
    livekitUrl={livekitUrl}
    isHost={true}
    publishMode={mode}
  />
</div>
```

- [ ] **Step 2: Wire it into LiveCockpit**

Update `LiveCockpit.svelte` to accept the new props and pass them to `StreamCockpit`:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { LiveCockpitData, LiveState } from '../../lib/live-state';
  import Launchpad from './Launchpad.svelte';
  import RoomsBoard from './rooms/RoomsBoard.svelte';
  import StreamCockpit from './stream/StreamCockpit.svelte';

  let { livekitUrl, streamDomain, rtmpKey }: { livekitUrl: string; streamDomain: string; rtmpKey: string } = $props();

  // (rest unchanged — refresh / state / timer)
</script>

<!-- … existing markup, replace stream branches: -->

{:else if state === 'stream'}
  <StreamCockpit {livekitUrl} {streamDomain} {rtmpKey} />
{:else if state === 'rooms'}
  <RoomsBoard rooms={data.rooms} />
{:else}
  <div class="grid grid-cols-3 gap-6">
    <div class="col-span-2"><StreamCockpit {livekitUrl} {streamDomain} {rtmpKey} /></div>
    <div class="col-span-1"><RoomsBoard rooms={data.rooms} /></div>
  </div>
```

- [ ] **Step 3: Manual smoke**

Start a stream from `/admin/live` (in `state='empty'`, click "Stream starten" — when implemented; for now just bring up a stream via `/admin/stream` would have done before, but that page now redirects). For testing, trigger directly: hit `/api/stream/token` and start a publisher in the embedded `StreamPlayer`. Within ~5 s `/api/live/state` returns `state='stream'` and `StreamCockpit` renders. Recording start/stop should work via `/api/stream/recording`.

- [ ] **Step 4: Commit**

```bash
git add website/src/components/live/stream/StreamCockpit.svelte website/src/components/live/LiveCockpit.svelte
git commit -m "feat(live-cockpit): StreamCockpit composes player + publish + recording"
```

---

## Phase 7 — Audience side (host-facing wrappers)

The audience-side components (`StreamReactions`, `StreamHandRaise`, `StreamChat`) already render *both* host and viewer variants by branching on `isHost`. They consume LiveKit DataChannel events directly — no extra API wiring needed.

### Task 7.1: AudiencePanel

**Files:**
- Create: `website/src/components/live/stream/AudiencePanel.svelte`
- Modify: `website/src/components/live/stream/StreamCockpit.svelte` (mount inside the player area)

- [ ] **Step 1: Create AudiencePanel that taps into the LiveKit `Room`**

Open `website/src/components/LiveStream/StreamPlayer.svelte` and look at how it exposes the `room` to children. If it doesn't expose it as a prop, the simplest approach is to render a host-only sidebar *inside* `StreamPlayer` via an existing slot. If `StreamPlayer` already mounts `StreamHandRaise`/`StreamReactions`/`StreamChat` for the host case, just verify those render — no new code needed; document this in `AudiencePanel.svelte` as a wrapper that's a no-op for v1:

```svelte
<!-- AudiencePanel: thin marker component to indicate where the host-side audience widgets live.
     The actual rendering is performed by StreamHandRaise/StreamReactions/StreamChat inside
     StreamPlayer when isHost=true. -->
<script lang="ts">
  // No props — kept for future expansion (viewer count graph, chat moderation actions).
</script>

<div data-testid="audience-panel" class="contents"></div>
```

If `StreamPlayer` does *not* mount the host variants, then mount them here. Inspect the file and decide.

- [ ] **Step 2: Verify host sees hand-raise queue and reactions**

Manual smoke: open `/admin/live` (logged in as admin) in one window and `/portal/stream` (logged in as a different test user) in another. Have the viewer raise hand → admin sees the queue update. Have the viewer click a reaction → admin sees the burst.

- [ ] **Step 3: Commit**

```bash
git add website/src/components/live/stream/AudiencePanel.svelte
git commit -m "feat(live-cockpit): document AudiencePanel boundary (LiveKit-driven)"
```

### Task 7.2: HandRaiseQueue

If Task 7.1 found that `StreamHandRaise` is *not* automatically mounted in host mode, render it explicitly here. Otherwise this is a no-op task.

**Files:**
- Create (if needed): `website/src/components/live/stream/HandRaiseQueue.svelte`

- [ ] **Step 1: Check whether `StreamPlayer` mounts `StreamHandRaise` for the host**

```bash
grep -n 'StreamHandRaise\|StreamReactions\|StreamChat' website/src/components/LiveStream/StreamPlayer.svelte
```

- [ ] **Step 2: If they're already mounted: skip the rest, commit nothing**

- [ ] **Step 3: If not, add a wrapper that consumes the room from `StreamPlayer`**

The wrapper must accept a `Room` instance — the cleanest way is to extend `StreamPlayer.svelte` to accept a `children` snippet (Svelte 5) or to expose `room` via an event. Add the smallest possible change: emit a `roomReady` event from `StreamPlayer` and listen in `StreamCockpit`. Implementation deferred to whoever sees this state in Step 1.

- [ ] **Step 4: Commit (if any code was added)**

---

## Phase 8 — PollOverlayPanel (live poll status on stream side)

### Task 8.1: PollOverlayPanel

**Files:**
- Create: `website/src/components/live/stream/PollOverlayPanel.svelte`
- Modify: `website/src/components/live/stream/StreamCockpit.svelte`

- [ ] **Step 1: Create the panel**

```svelte
<script lang="ts">
  import type { ActivePoll } from '../../../lib/live-state';

  let { pollActive }: { pollActive: ActivePoll | null } = $props();

  type Results = { poll: { id: string; question: string; kind: string }; total: number; counts: { answer: string; count: number }[] };
  let results = $state<Results | null>(null);

  $effect(() => {
    if (!pollActive) { results = null; return; }
    let cancelled = false;
    async function tick() {
      try {
        const r = await fetch(`/api/admin/poll/${pollActive!.id}`);
        if (r.ok && !cancelled) results = await r.json() as Results;
      } catch {}
    }
    tick();
    const t = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(t); };
  });

  async function shareAndClose() {
    if (!pollActive) return;
    await fetch(`/api/admin/poll/${pollActive.id}/share`, { method: 'POST' });
  }
</script>

{#if pollActive && results}
  <div data-testid="poll-overlay-panel" class="bg-dark-light border border-dark-lighter rounded-2xl p-4">
    <div class="flex items-start justify-between mb-3">
      <div>
        <span class="text-xs text-muted uppercase tracking-wide">Aktive Umfrage</span>
        <p class="font-serif text-light mt-0.5 text-sm">{pollActive.question}</p>
      </div>
      <span class="text-sm text-muted ml-4 flex-shrink-0">{results.total} Antwort{results.total!==1?'en':''}</span>
    </div>

    {#if pollActive.kind === 'multiple_choice'}
      <div class="flex flex-col gap-2 mb-4 text-sm">
        {#each results.counts as c}
          {@const pct = results.total > 0 ? Math.round(c.count / results.total * 100) : 0}
          <div class="flex items-center gap-2">
            <span class="w-28 flex-shrink-0 truncate text-light">{c.answer}</span>
            <div class="flex-1 bg-dark rounded h-2"><div class="h-full bg-gold rounded" style="width:{pct}%"></div></div>
            <span class="w-6 text-right text-muted">{c.count}</span>
          </div>
        {/each}
      </div>
    {:else}
      <p class="text-muted text-xs mb-4">{results.total} Freitext-Antwort{results.total!==1?'en':''} eingegangen</p>
    {/if}

    <div class="flex gap-2 justify-end">
      <button onclick={shareAndClose}
        class="px-3 py-1.5 text-sm rounded-lg bg-gold text-dark font-semibold hover:bg-gold/90">
        📤 Ergebnisse teilen &amp; schließen
      </button>
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Pass `pollActive` from LiveCockpit through StreamCockpit**

Update `StreamCockpit.svelte` `$props()` to add `pollActive: ActivePoll | null` and pass it down. Update `LiveCockpit.svelte` to pass `pollActive={data.pollActive}`. Render `<PollOverlayPanel pollActive={pollActive} />` near the top of `StreamCockpit.svelte`.

- [ ] **Step 3: Manual smoke**

Open `/admin/live` with a stream live. Open Bulk-actions modal → start a poll → verify the live bars appear in the StreamCockpit's `PollOverlayPanel`.

- [ ] **Step 4: Commit**

```bash
git add website/src/components/live/stream/PollOverlayPanel.svelte website/src/components/live/stream/StreamCockpit.svelte website/src/components/live/LiveCockpit.svelte
git commit -m "feat(live-cockpit): PollOverlayPanel — live bars on stream half"
```

---

## Phase 9 — Status bar + toasts

### Task 9.1: LiveStatusBar

**Files:**
- Create: `website/src/components/live/shared/LiveStatusBar.svelte`
- Modify: `website/src/components/live/LiveCockpit.svelte`

- [ ] **Step 1: Create the bar**

```svelte
<script lang="ts">
  import type { LiveCockpitData, LiveState } from '../../../lib/live-state';

  let { data, state }: { data: LiveCockpitData; state: LiveState } = $props();

  const dot = $derived(state === 'empty' ? 'bg-muted' : 'bg-red-500 animate-pulse');
  const label = $derived(
    state === 'empty' ? 'Bereit'
    : state === 'stream' ? 'ON AIR'
    : state === 'rooms' ? `${data.rooms.length} Call(s)`
    : `ON AIR · ${data.rooms.length} Call(s)`
  );
</script>

<div data-testid="live-status-bar" class="flex items-center gap-3 px-4 py-2 bg-dark-light border border-dark-lighter rounded-xl mb-4">
  <span class={`w-2.5 h-2.5 rounded-full ${dot}`}></span>
  <span class="text-sm font-mono text-light">{label}</span>
  {#if data.stream.recording}
    <span class="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-400/20">REC</span>
  {/if}
  {#if data.pollActive}
    <span class="text-xs px-1.5 py-0.5 rounded bg-gold/10 text-gold border border-gold/30">📊 Umfrage</span>
  {/if}
</div>
```

- [ ] **Step 2: Mount in LiveCockpit**

In `LiveCockpit.svelte`, render `<LiveStatusBar {data} {state} />` at the top of the rendered branch (only when `data` is loaded):

```svelte
{:else}
  <LiveStatusBar {data} {state} />
  {#if state === 'empty'}
    <Launchpad {data} />
  {:else if state === 'stream'}
    <StreamCockpit {livekitUrl} {streamDomain} {rtmpKey} pollActive={data.pollActive} />
  {:else if state === 'rooms'}
    <RoomsBoard rooms={data.rooms} />
  {:else}
    <div class="grid grid-cols-3 gap-6">
      <div class="col-span-2"><StreamCockpit {livekitUrl} {streamDomain} {rtmpKey} pollActive={data.pollActive} /></div>
      <div class="col-span-1"><RoomsBoard rooms={data.rooms} /></div>
    </div>
  {/if}
{/if}
```

(Add `import LiveStatusBar from './shared/LiveStatusBar.svelte';` at the top.)

- [ ] **Step 3: Commit**

```bash
git add website/src/components/live/shared/LiveStatusBar.svelte website/src/components/live/LiveCockpit.svelte
git commit -m "feat(live-cockpit): LiveStatusBar shows ON AIR + REC + poll badges"
```

### Task 9.2: LiveToasts

**Files:**
- Create: `website/src/components/live/shared/LiveToasts.svelte`
- Modify: `website/src/components/live/LiveCockpit.svelte`

- [ ] **Step 1: Create a tiny toast queue**

```svelte
<script lang="ts" module>
  type Toast = { id: number; text: string; kind: 'info' | 'ok' | 'warn' | 'err' };
  let toasts = $state<Toast[]>([]);
  let next = 1;

  export function pushToast(text: string, kind: Toast['kind'] = 'info') {
    const id = next++;
    toasts = [...toasts, { id, text, kind }];
    setTimeout(() => { toasts = toasts.filter(t => t.id !== id); }, 4500);
  }
</script>

<div data-testid="live-toasts" class="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
  {#each toasts as t (t.id)}
    <div class={`px-4 py-2 rounded-lg shadow-xl border text-sm pointer-events-auto
      ${t.kind==='ok'   ? 'bg-green-500/10 text-green-400 border-green-400/30' :
       t.kind==='warn' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-400/30' :
       t.kind==='err'  ? 'bg-red-500/10 text-red-400 border-red-400/30' :
                          'bg-dark-light text-light border-dark-lighter'}`}>
      {t.text}
    </div>
  {/each}
</div>
```

- [ ] **Step 2: Detect events in LiveCockpit and push toasts**

In `LiveCockpit.svelte`, add a previous-state compare in `refresh()`:

```typescript
import { pushToast } from './shared/LiveToasts.svelte';

// after `state = json.state;` add:
const prevRoomsCount = data?.rooms.length ?? 0;
const newRoomsCount = json.rooms.length;
if (newRoomsCount > prevRoomsCount && data) pushToast('Neuer Talk-Call gestartet', 'info');
if (newRoomsCount < prevRoomsCount && data) pushToast('Talk-Call beendet', 'info');
if (json.stream.recording && !data?.stream.recording) pushToast('Aufzeichnung läuft', 'ok');
if (!json.stream.recording && data?.stream.recording) pushToast('Aufzeichnung gespeichert', 'ok');
```

Mount the component once near the bottom of LiveCockpit's markup:

```svelte
<LiveToasts />
```

(Import: `import LiveToasts from './shared/LiveToasts.svelte';`.)

- [ ] **Step 3: Commit**

```bash
git add website/src/components/live/shared/LiveToasts.svelte website/src/components/live/LiveCockpit.svelte
git commit -m "feat(live-cockpit): LiveToasts on room/recording state changes"
```

---

## Phase 10 — ScheduleNudge (stretch — only if time)

### Task 10.1: Add `nextEvent` to `/api/live/state`

**Files:**
- Modify: `website/src/lib/live-state.ts`

- [ ] **Step 1: Locate the calendar source**

```bash
grep -rn 'kalender\|calendar' website/src/lib/*.ts | head -5
```

If a `getNextScheduledMeeting()` function exists, use it. Otherwise, query `meetings` for the next `scheduled_at > now()`:

```typescript
async function fetchNextEvent(): Promise<ScheduleHint | null> {
  const { pool } = await import('./website-db');
  const r = await pool.query<{ scheduled_at: Date; meeting_type: string; talk_room_token: string | null; customer_name: string }>(
    `SELECT m.scheduled_at, m.meeting_type, m.talk_room_token, c.name AS customer_name
       FROM meetings m JOIN customers c ON m.customer_id = c.id
      WHERE m.scheduled_at IS NOT NULL AND m.scheduled_at > now() AND m.scheduled_at < now() + interval '30 minutes'
      ORDER BY m.scheduled_at ASC LIMIT 1`
  );
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  return {
    startsAt: row.scheduled_at.toISOString(),
    label: `${row.meeting_type} mit ${row.customer_name}`,
    talkRoomToken: row.talk_room_token,
  };
}
```

Update `fetchLiveCockpitData()` to call it and assign `schedule.nextEvent`.

- [ ] **Step 2: Commit**

```bash
git add website/src/lib/live-state.ts
git commit -m "feat(live-cockpit): expose next-30-min scheduled event"
```

### Task 10.2: ScheduleNudge component

**Files:**
- Create: `website/src/components/live/shared/ScheduleNudge.svelte`
- Modify: `website/src/components/live/Launchpad.svelte`

- [ ] **Step 1: Create the component**

```svelte
<script lang="ts">
  import type { ScheduleHint } from '../../../lib/live-state';

  let { event }: { event: ScheduleHint | null } = $props();

  function minutesUntil(iso: string): number {
    return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
  }
</script>

{#if event}
  <div data-testid="schedule-nudge"
       class="bg-gold/10 border border-gold/30 rounded-2xl p-4 flex items-center justify-between">
    <div>
      <p class="text-sm text-light"><strong>{event.label}</strong> — in {minutesUntil(event.startsAt)} Min</p>
    </div>
    {#if event.talkRoomToken}
      <a href={`https://files.${import.meta.env.PROD_DOMAIN ?? 'mentolder.de'}/call/${event.talkRoomToken}`}
         target="_blank" rel="noopener"
         class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold">
        Jetzt starten →
      </a>
    {/if}
  </div>
{/if}
```

- [ ] **Step 2: Mount in Launchpad**

At the top of `Launchpad.svelte`'s markup:

```svelte
{#if data.schedule.nextEvent}
  <ScheduleNudge event={data.schedule.nextEvent} />
{/if}
```

(Import: `import ScheduleNudge from './shared/ScheduleNudge.svelte';`.)

- [ ] **Step 3: Commit**

```bash
git add website/src/components/live/shared/ScheduleNudge.svelte website/src/components/live/Launchpad.svelte
git commit -m "feat(live-cockpit): ScheduleNudge — next 30-min meeting on Launchpad"
```

---

## Phase 11 — Cleanup

### Task 11.1: Remove unused old script blocks

The redirect stubs from Task 1.5 are minimal and should already not contain old code. Confirm no orphan files remain.

- [ ] **Step 1: Verify**

```bash
grep -rn 'btn-brett\|poll-template-list\|btn-transcription' website/src/pages/admin/ 2>/dev/null
```

Expected: empty output (the inline modal scripts are gone — replaced by Svelte components).

- [ ] **Step 2: Commit if anything was actually removed**

```bash
git add -A && git commit -m "chore(live-cockpit): remove orphan inline scripts" || true
```

---

## Phase 12 — Full E2E sweep

### Task 12.1: Authenticated admin tests

The Playwright suite has helpers for admin login (`tests/e2e/helpers/`). Use them.

**Files:**
- Modify: `tests/e2e/specs/fa-admin-live.spec.ts` — add authenticated tests

- [ ] **Step 1: Find the admin login helper**

```bash
ls tests/e2e/helpers/
grep -rn 'loginAsAdmin\|adminSession\|adminCookie' tests/e2e/helpers/ tests/e2e/specs/fa-admin-monitoring.spec.ts
```

- [ ] **Step 2: Append authenticated tests using whatever helper you found**

Pseudo-code template (replace `loginAsAdmin` with the real helper name):

```typescript
import { loginAsAdmin } from '../helpers/auth';

test.describe('FA: Admin Live Cockpit (authenticated)', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page); });

  test('T7: Launchpad renders when nothing live', async ({ page }) => {
    await page.goto(`${BASE}/admin/live`);
    await expect(page.locator('[data-testid=cockpit-launchpad]')).toBeVisible({ timeout: 10000 });
  });

  test('T8: Sidebar has single "Live" entry', async ({ page }) => {
    await page.goto(`${BASE}/admin/live`);
    await expect(page.locator('a[href="/admin/live"]:has-text("Live")')).toHaveCount(1);
    await expect(page.locator('a[href="/admin/meetings"], a[href="/admin/stream"]')).toHaveCount(0);
  });

  test('T9: BulkActionsBar visible when rooms exist (mock fixture)', async ({ page, request }) => {
    // requires a fixture / mock — skip if env doesn't have one
    test.skip(!process.env.HAS_TALK_FIXTURE, 'Needs Talk fixture');
    await page.goto(`${BASE}/admin/live`);
    await expect(page.locator('[data-testid=bulk-actions-bar]')).toBeVisible({ timeout: 10000 });
  });

  test('T10: Korczewski brand loads /admin/live without errors', async ({ page }) => {
    test.skip(process.env.BRAND !== 'korczewski', 'Korczewski-only check');
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${BASE}/admin/live`);
    await expect(page.locator('[data-testid=live-cockpit]')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the suite locally**

```bash
cd tests/e2e && WEBSITE_URL=http://localhost:4321 npx playwright test --project=website fa-admin-live.spec.ts
```

Expected: all non-skipped tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/specs/fa-admin-live.spec.ts
git commit -m "test(live-cockpit): authenticated E2E coverage for cockpit + sidebar"
```

### Task 12.2: Run the full deploy sequence

- [ ] **Step 1: Build, deploy, verify both clusters**

```bash
task feature:website
```

This runs `task website:redeploy:all-prods` — rebuilds the website image and rolls it on both `mentolder` and `korczewski` clusters.

- [ ] **Step 2: Smoke-test live URLs**

```bash
curl -sI https://web.mentolder.de/admin/live    | head -1
curl -sI https://web.korczewski.de/admin/live   | head -1
curl -sI https://web.mentolder.de/admin/stream   | head -1   # expect 301 → /admin/live
curl -sI https://web.korczewski.de/admin/meetings | head -1  # expect 301 → /admin/live
```

Expected: 200/302 (auth redirect to keycloak) for `/admin/live`; 301 for the legacy paths.

- [ ] **Step 3: Manual final smoke on each brand**

Login as admin on each brand → visit `/admin/live` → verify Launchpad renders → start a Talk-call → verify rooms appear within 5 s → start the bulk Brett action → verify the link lands in the Talk room.

- [ ] **Step 4: No commit needed for verification — open PR**

```bash
git push origin HEAD
gh pr create --title "feat(live-cockpit): unify Stream + Meetings into /admin/live" --body "$(cat <<'EOF'
## Summary
- Replaces /admin/stream and /admin/meetings with a single adaptive /admin/live cockpit
- Layout switches based on what is live: empty / stream / rooms / both
- Reuses Brett, Poll, Transcription endpoints unchanged
- Fixes /admin/meetings crash on web.korczewski.de as a side-effect (Phase 0)

## Test plan
- [ ] /admin/stream redirects 301 → /admin/live
- [ ] /admin/meetings redirects 301 → /admin/live
- [ ] /admin/meetings/<id> redirects 301 → /admin/live/sessions/<id>
- [ ] Sidebar shows single "Live" entry
- [ ] Empty state: Launchpad renders with start buttons + recent sessions
- [ ] Stream-only: full-width StreamCockpit
- [ ] Rooms-only: full-width RoomsBoard with bulk-actions
- [ ] Both: 2/3 + 1/3 split layout
- [ ] Bulk Brett/Poll/Transcription work
- [ ] Live bars appear in StreamCockpit when poll active
- [ ] Korczewski brand /admin/live loads without errors

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Checklist (run before handing this plan to an executor)

**Spec coverage** — every spec section has tasks:

| Spec § | Implemented in |
|---|---|
| §3 Routes & Sidebar | Task 1.4, 1.5, 1.6 |
| §4 State-Machine | Task 1.1 |
| §5 Component-Struktur | Tasks 1.2, 3.1, 4.1–4.3, 5.1–5.4, 6.1–6.4, 7.1–7.2, 8.1, 9.1–9.2, 10.2 |
| §6 API-Oberfläche | Task 2.1, 2.2 (`/api/live/state`); Task 5.2 (`/api/admin/poll/templates`) |
| §7 Live-Datenpfad | Task 2.3 (5 s polling — SSE deferred per simplification documented in spec §7's "Fallback") |
| §8 Page-Load-Flow | Tasks 1.2 + 2.3 + 6.4 |
| §9 Korczewski-Bug-Fix | Phase 0 (Tasks 0.1, 0.2) + Phase 1 (replacement page) |
| §10 Fehlerbehandlung | Task 2.3 (load error UI) + Task 9.2 (toasts) |
| §11 Tests | Task 1.1 (unit), Tasks 1.2/1.5/2.2/12.1 (E2E) |
| §12 Phasen-Plan | Phases 0–12 mirror §12's phases |

**Type consistency**: `LiveCockpitData`, `StreamLiveStatus`, `ActivePoll`, `ScheduleHint`, `LiveState`, `ActiveCallRoom`, `AdminMeeting` are all defined in Task 1.1 / imported from existing libs and used unchanged through Phase 10.

**Placeholder scan**: each step contains either a complete code block, an exact command, or a verification check. No "TODO" / "TBD" / "fill in details". Phase 7 has conditional steps that document what to look for and how to react — that's intentional, not a placeholder.

**Scope check**: all v1-Core spec items are tasked. Stretch items (Phase 10 ScheduleNudge) are isolated to one phase that can be skipped without affecting earlier phases. v2 / Out items are not in the plan.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-08-live-cockpit.md`.
