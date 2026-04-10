# Meeting History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins release meeting artefacts (transcript, whiteboard, AI summary) to clients via the portal. Audio is deleted once transcription completes. Clients see released meetings in the "Vergangene Gespräche" portal tab.

**Architecture:** Meeting release state is stored in the existing PostgreSQL `meetings` table (new `released_at` column). The finalization pipeline writes the transcript + deletes the audio. Admins click "Freigeben" in `/admin/[clientId]?tab=meetings` which calls `POST /api/meeting/release`. Clients load the `MeetingsTab` which queries meetings from the DB filtered by their email and `released_at IS NOT NULL`.

**Tech Stack:** Astro SSR, `lib/meetings-db.ts` (PostgreSQL), `lib/mattermost.ts`, `lib/outline.ts`. **Depends on:** Client Portal plan (MeetingsTab stub already created).

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/meetings-db.ts` | Modify | Add `releaseMeeting()`, `getMeetingsByEmail()`, `getMeetingArtefacts()` |
| `src/pages/api/meeting/finalize.ts` | Modify | Delete audio file after transcript saved |
| `src/pages/api/meeting/release.ts` | Create | POST endpoint — sets `released_at`, notifies client |
| `src/components/portal/MeetingsTab.astro` | Replace stub | Full implementation — lists released meetings |
| `src/components/portal/MeetingDetail.astro` | Create | Transcript + whiteboard + summary view |
| `src/components/admin/MeetingsAdminTab.astro` | Create | Admin view — all meetings with Freigeben button |
| `src/pages/admin/[clientId].astro` | Modify | Replace MeetingsTab with MeetingsAdminTab for admin view |
| `tests/e2e/specs/fa-meeting-history.spec.ts` | Create | Playwright E2E test |

---

### Task 1: Write failing Playwright test

**Files:**
- Create: `tests/e2e/specs/fa-meeting-history.spec.ts`

- [ ] **Step 1: Write tests**

```typescript
import { test, expect } from '@playwright/test';
const BASE = process.env.BASE_URL || 'http://localhost:4321';

test.describe('Meeting History', () => {
  test('T1 – /api/meeting/release requires auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/meeting/release`, {
      data: { meetingId: 'test-uuid' },
    });
    expect(res.status()).toBe(401);
  });

  test('T2 – /api/meeting/release rejects non-admin', async ({ request }) => {
    // Without a valid admin session cookie, expect 401
    const res = await request.post(`${BASE}/api/meeting/release`, {
      data: { meetingId: 'test-uuid' },
      headers: { Cookie: 'workspace_session=invalid' },
    });
    expect([401, 403]).toContain(res.status());
  });
});
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd /home/patrick/Bachelorprojekt/tests/e2e
BASE_URL=http://localhost:4321 npx playwright test fa-meeting-history.spec.ts --reporter=line
```

Expected: T1 fails (endpoint doesn't exist → 404, not 401).

---

### Task 2: Extend `meetings-db.ts`

**Files:**
- Modify: `src/lib/meetings-db.ts`

- [ ] **Step 1: Add DB migration for `released_at` column**

Add this function at the end of `src/lib/meetings-db.ts`:

```typescript
// Run once on startup to add released_at column if absent.
// Called from src/pages/api/meeting/release.ts on first use.
export async function ensureReleasedAtColumn(): Promise<void> {
  await pool.query(`
    ALTER TABLE meetings
    ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ
  `);
}
```

- [ ] **Step 2: Add `releaseMeeting()`**

```typescript
export async function releaseMeeting(meetingId: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE meetings SET released_at = now() WHERE id = $1 AND released_at IS NULL RETURNING id`,
    [meetingId]
  );
  return result.rowCount !== null && result.rowCount > 0;
}
```

- [ ] **Step 3: Add `getMeetingsByEmail()`**

```typescript
export interface MeetingSummary {
  id: string;
  meetingType: string;
  scheduledAt: Date | null;
  releasedAt: Date | null;
  customerId: string;
  customerEmail: string;
}

export async function getMeetingsByEmail(email: string, releasedOnly = true): Promise<MeetingSummary[]> {
  const rows = await pool.query(
    `SELECT m.id, m.meeting_type, m.scheduled_at, m.released_at, m.customer_id, c.email AS customer_email
     FROM meetings m
     JOIN customers c ON c.id = m.customer_id
     WHERE c.email = $1
       AND ($2 = false OR m.released_at IS NOT NULL)
     ORDER BY m.scheduled_at DESC NULLS LAST`,
    [email, releasedOnly]
  );
  return rows.rows.map((r) => ({
    id: r.id,
    meetingType: r.meeting_type,
    scheduledAt: r.scheduled_at,
    releasedAt: r.released_at,
    customerId: r.customer_id,
    customerEmail: r.customer_email,
  }));
}
```

- [ ] **Step 4: Add `getMeetingArtefacts()`**

```typescript
export interface MeetingArtefacts {
  transcript: string | null;
  summary: string | null;
  whiteboardPath: string | null; // storage_path from artifacts table
}

export async function getMeetingArtefacts(meetingId: string): Promise<MeetingArtefacts> {
  const [transcriptRes, summaryRes, whiteboardRes] = await Promise.all([
    pool.query(`SELECT full_text FROM transcripts WHERE meeting_id = $1 LIMIT 1`, [meetingId]),
    pool.query(`SELECT content FROM insights WHERE meeting_id = $1 AND insight_type = 'summary' LIMIT 1`, [meetingId]),
    pool.query(`SELECT storage_path FROM artifacts WHERE meeting_id = $1 AND artifact_type = 'whiteboard' LIMIT 1`, [meetingId]),
  ]);
  return {
    transcript: transcriptRes.rows[0]?.full_text ?? null,
    summary: summaryRes.rows[0]?.content ?? null,
    whiteboardPath: whiteboardRes.rows[0]?.storage_path ?? null,
  };
}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/meetings-db.ts
git commit -m "feat: add releaseMeeting, getMeetingsByEmail, getMeetingArtefacts to meetings-db"
```

---

### Task 3: Modify `finalize.ts` to delete audio after transcript

**Files:**
- Modify: `src/pages/api/meeting/finalize.ts`

- [ ] **Step 1: Read current finalize.ts**

```bash
cat src/pages/api/meeting/finalize.ts
```

- [ ] **Step 2: After the transcript is saved, delete the recording file**

Find the section in `finalize.ts` where `saveTranscript()` is called and the recording path is known. After a successful transcript save, add:

```typescript
// Delete audio recording now that transcript is saved
if (recordingPath) {
  try {
    const fs = await import('node:fs/promises');
    await fs.unlink(recordingPath);
    results.push(':wastebasket: Aufnahme nach Transkription gelöscht');
  } catch {
    // File may already be gone — not a fatal error
  }
}
```

`recordingPath` is the local filesystem path passed into the finalize pipeline (e.g. from `meeting.recordingPath`). Adapt the variable name to match what finalize.ts already uses.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/meeting/finalize.ts
git commit -m "feat: delete audio recording after transcript is saved in finalize pipeline"
```

---

### Task 4: Create `POST /api/meeting/release`

**Files:**
- Create: `src/pages/api/meeting/release.ts`

- [ ] **Step 1: Write endpoint**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { releaseMeeting, getMeetingsByEmail, ensureReleasedAtColumn } from '../../../lib/meetings-db';
import { postToChannel, getFirstTeamId, getOrCreateCustomerChannel } from '../../../lib/mattermost';

let columnEnsured = false;

export const POST: APIRoute = async ({ request }) => {
  const session = getSession(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Nicht authentifiziert' }), { status: 401 });
  }
  if (!isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Kein Zugriff' }), { status: 403 });
  }

  // Ensure DB column exists (idempotent)
  if (!columnEnsured) {
    await ensureReleasedAtColumn();
    columnEnsured = true;
  }

  let body: { meetingId: string; clientEmail?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültige Anfrage' }), { status: 400 });
  }

  if (!body.meetingId) {
    return new Response(JSON.stringify({ error: 'meetingId fehlt' }), { status: 400 });
  }

  const released = await releaseMeeting(body.meetingId);
  if (!released) {
    return new Response(JSON.stringify({ error: 'Meeting nicht gefunden oder bereits freigegeben' }), { status: 404 });
  }

  // Notify client via Mattermost if clientEmail provided
  if (body.clientEmail) {
    try {
      const teamId = await getFirstTeamId();
      if (teamId) {
        const channel = await getOrCreateCustomerChannel(teamId, body.clientEmail.split('@')[0]);
        if (channel) {
          await postToChannel(
            channel.id,
            `:scroll: Ihr Gesprächsprotokoll ist jetzt in Ihrem [Portal](/portal?tab=meetings) verfügbar.`
          );
        }
      }
    } catch { /* notification failure is non-fatal */ }
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 2: Run T1 and T2 tests**

```bash
cd /home/patrick/Bachelorprojekt/tests/e2e
BASE_URL=http://localhost:4321 npx playwright test fa-meeting-history.spec.ts --reporter=line
```

Expected: both pass (401 and 403 returned correctly).

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/meeting/release.ts
git commit -m "feat: add POST /api/meeting/release endpoint with admin auth gate"
```

---

### Task 5: Build full `MeetingsTab.astro` (client view)

**Files:**
- Replace: `src/components/portal/MeetingsTab.astro`
- Create: `src/components/portal/MeetingDetail.astro`

- [ ] **Step 1: Replace stub with full implementation**

```astro
---
import { getMeetingsByEmail } from '../../lib/meetings-db';

interface Props { email: string; }
const { email } = Astro.props;

let meetings = await getMeetingsByEmail(email, true).catch(() => []);
const selectedId = Astro.url?.searchParams?.get('meeting') ?? null;
---

<div data-testid="tab-meetings">
  {meetings.length === 0 ? (
    <p class="text-muted text-center py-12">Noch keine freigegebenen Gespräche vorhanden.</p>
  ) : (
    <div class="space-y-3">
      {meetings.map((m) => {
        const dateStr = m.scheduledAt
          ? m.scheduledAt.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
          : 'Datum unbekannt';
        return (
          <a
            href={`/portal?tab=meetings&meeting=${m.id}`}
            class={`block bg-dark rounded-xl border px-5 py-4 hover:border-gold/40 transition-colors ${
              selectedId === m.id ? 'border-gold/60' : 'border-dark-lighter'
            }`}
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="font-semibold text-light">{m.meetingType}</p>
                <p class="text-muted text-sm mt-0.5">{dateStr}</p>
              </div>
              <span class="text-gold text-xs">Anzeigen →</span>
            </div>
          </a>
        );
      })}
    </div>
  )}

  {selectedId && (
    <div class="mt-8">
      <!-- Import lazily to avoid fetching artefacts for every meeting on list load -->
      {/* @ts-ignore */}
      <MeetingDetailInline meetingId={selectedId} />
    </div>
  )}
</div>
```

- [ ] **Step 2: Create `MeetingDetail.astro`**

```astro
---
import { getMeetingArtefacts } from '../../lib/meetings-db';

interface Props { meetingId: string; }
const { meetingId } = Astro.props;

const artefacts = await getMeetingArtefacts(meetingId).catch(() => ({
  transcript: null, summary: null, whiteboardPath: null,
}));

const NC_URL = process.env.NEXTCLOUD_EXTERNAL_URL || '';
const NC_USER = process.env.NEXTCLOUD_CALDAV_USER || 'admin';
const whiteboardUrl = artefacts.whiteboardPath && NC_URL
  ? `${NC_URL}/remote.php/dav/files/${NC_USER}${artefacts.whiteboardPath}`
  : null;
---

<div class="space-y-8">
  {artefacts.summary && (
    <div>
      <h3 class="text-sm font-semibold text-gold uppercase tracking-wider mb-3">Zusammenfassung</h3>
      <div class="prose prose-invert prose-sm max-w-none bg-dark rounded-xl border border-dark-lighter p-5">
        {artefacts.summary}
      </div>
    </div>
  )}

  {artefacts.transcript && (
    <div>
      <h3 class="text-sm font-semibold text-gold uppercase tracking-wider mb-3">Transkript</h3>
      <div class="bg-dark rounded-xl border border-dark-lighter p-5 max-h-80 overflow-y-auto">
        <pre class="text-muted text-sm whitespace-pre-wrap font-sans leading-relaxed">{artefacts.transcript}</pre>
      </div>
    </div>
  )}

  {whiteboardUrl && (
    <div>
      <h3 class="text-sm font-semibold text-gold uppercase tracking-wider mb-3">Zeichnung</h3>
      <img
        src={whiteboardUrl}
        alt="Whiteboard-Zeichnung"
        class="rounded-xl border border-dark-lighter w-full max-h-96 object-contain bg-dark"
        loading="lazy"
      />
    </div>
  )}

  {!artefacts.summary && !artefacts.transcript && !whiteboardUrl && (
    <p class="text-muted text-center py-8">Keine Artefakte für dieses Gespräch gefunden.</p>
  )}
</div>
```

- [ ] **Step 3: Update `MeetingsTab.astro` to use `MeetingDetail.astro`**

Replace the inline comment `{/* @ts-ignore */} <MeetingDetailInline .../>` with a proper import and usage. In the frontmatter of `MeetingsTab.astro` add:

```typescript
import MeetingDetail from './MeetingDetail.astro';
```

And replace the placeholder block with:

```astro
{selectedId && (
  <div class="mt-8">
    <MeetingDetail meetingId={selectedId} />
  </div>
)}
```

- [ ] **Step 4: Build to confirm no errors**

```bash
cd /home/patrick/Bachelorprojekt/website && npm run build 2>&1 | tail -10
```

Expected: `[build] Complete!`

- [ ] **Step 5: Commit**

```bash
git add src/components/portal/MeetingsTab.astro src/components/portal/MeetingDetail.astro
git commit -m "feat: full MeetingsTab with per-meeting artefact detail view"
```

---

### Task 6: Create `MeetingsAdminTab.astro` with "Freigeben" button

**Files:**
- Create: `src/components/admin/MeetingsAdminTab.astro`
- Modify: `src/pages/admin/[clientId].astro`

- [ ] **Step 1: Create admin meetings tab**

```astro
---
import { getMeetingsByEmail } from '../../lib/meetings-db';

interface Props { email: string; clientId: string; }
const { email, clientId } = Astro.props;

const meetings = await getMeetingsByEmail(email, false).catch(() => []);
---

<div>
  {meetings.length === 0 ? (
    <p class="text-muted text-center py-12">Keine Gespräche für diesen Nutzer.</p>
  ) : (
    <div class="space-y-3">
      {meetings.map((m) => {
        const dateStr = m.scheduledAt
          ? m.scheduledAt.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
          : 'Datum unbekannt';
        const isReleased = !!m.releasedAt;
        return (
          <div class={`flex items-center justify-between bg-dark rounded-xl border px-5 py-4 ${isReleased ? 'border-green-800/40' : 'border-dark-lighter'}`}>
            <div>
              <p class="font-semibold text-light">{m.meetingType}</p>
              <p class="text-muted text-sm mt-0.5">{dateStr}</p>
              {isReleased && <p class="text-green-400 text-xs mt-1">Freigegeben am {m.releasedAt!.toLocaleDateString('de-DE')}</p>}
            </div>
            {!isReleased && (
              <button
                data-meeting-id={m.id}
                data-client-email={email}
                class="release-btn px-4 py-2 bg-gold text-dark rounded-full text-sm font-bold hover:bg-gold-light transition-colors"
              >
                Freigeben
              </button>
            )}
          </div>
        );
      })}
    </div>
  )}
</div>

<script>
  document.querySelectorAll<HTMLButtonElement>('.release-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const meetingId = btn.dataset.meetingId!;
      const clientEmail = btn.dataset.clientEmail;
      btn.disabled = true;
      btn.textContent = '...';
      const res = await fetch('/api/meeting/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId, clientEmail }),
      });
      if (res.ok) {
        btn.closest('div.flex')?.classList.add('border-green-800/40');
        btn.replaceWith(Object.assign(document.createElement('span'), {
          className: 'text-green-400 text-xs font-medium',
          textContent: '✓ Freigegeben',
        }));
      } else {
        btn.textContent = 'Fehler';
        btn.disabled = false;
      }
    });
  });
</script>
```

- [ ] **Step 2: Update `admin/[clientId].astro` to use `MeetingsAdminTab` for the meetings tab**

In `src/pages/admin/[clientId].astro`, add the import:

```typescript
import MeetingsAdminTab from '../../components/admin/MeetingsAdminTab.astro';
```

And replace the line:

```astro
{tab === 'meetings'   && <MeetingsTab email={client.email} />}
```

with:

```astro
{tab === 'meetings'   && <MeetingsAdminTab email={client.email} clientId={clientId!} />}
```

- [ ] **Step 3: Build and run all tests**

```bash
cd /home/patrick/Bachelorprojekt/website && npm run build 2>&1 | tail -5
cd /home/patrick/Bachelorprojekt/tests/e2e
BASE_URL=http://localhost:4321 npx playwright test fa-meeting-history.spec.ts --reporter=line
```

Expected: build succeeds, both tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/MeetingsAdminTab.astro src/pages/admin/
git commit -m "feat: admin Freigeben button for meeting artefacts"
```
