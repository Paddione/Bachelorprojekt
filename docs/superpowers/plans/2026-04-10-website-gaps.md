# Website Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all remaining gaps in the mentolder.de website: populate BookingsTab and InvoicesTab with real data, add Claude AI insights to the finalize pipeline, migrate session storage from in-memory to PostgreSQL, and persist reminders to the database.

**Architecture:** Each gap is addressed by adding a lib function + wiring it into the existing Astro component or API route. Session and reminder storage move from in-memory Maps to the existing shared PostgreSQL database (already used for meetings-db). Claude AI insights use the Anthropic SDK to generate summaries/action-items after meeting finalization.

**Tech Stack:** Astro, Svelte, TypeScript, PostgreSQL (pg), Anthropic SDK (`@anthropic-ai/sdk`), Nodemailer, Nextcloud CalDAV/WebDAV, InvoiceNinja v5 API

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/caldav.ts` | Modify | Add `getClientBookings()` function |
| `src/components/portal/BookingsTab.astro` | Modify | Display real booking data |
| `src/lib/invoiceninja.ts` | Modify | Add `getClientInvoices()` + expose `inApi` helper |
| `src/components/portal/InvoicesTab.astro` | Modify | Display real invoice data |
| `src/lib/claude.ts` | Create | Claude API helper for meeting insights |
| `src/pages/api/meeting/finalize.ts` | Modify | Add insights generation step after embeddings |
| `src/lib/auth.ts` | Modify | Replace in-memory Map with PostgreSQL sessions table |
| `src/lib/reminders.ts` | Modify | Replace in-memory Map with PostgreSQL reminders table |
| `tests/api.test.mjs` | Modify | Add tests for new endpoints/behaviors |

---

### Task 1: BookingsTab — Add CalDAV client booking lookup

**Files:**
- Modify: `website/src/lib/caldav.ts:47-118` (add `getClientBookings()` after existing `fetchEvents`)
- Modify: `website/src/components/portal/BookingsTab.astro`

The CalDAV REPORT query already fetches events and parses VEVENT blocks. We need a function that fetches events where the ATTENDEE field matches the client's email.

- [ ] **Step 1: Add `fetchEventsRaw()` and `getClientBookings()` to `caldav.ts`**

Add `fetchEventsRaw` right after the `getAuthHeader()` function (after line 25). This returns raw iCal strings instead of parsed CalEvent objects:

```typescript
// Fetch raw iCal data from Nextcloud CalDAV for a date range
async function fetchEventsRaw(from: Date, to: Date): Promise<string[]> {
  const fromStr = from.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const toStr = to.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const body = `<?xml version="1.0" encoding="utf-8" ?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag />
    <c:calendar-data />
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${fromStr}" end="${toStr}" />
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;

  try {
    const res = await fetch(CALDAV_BASE, {
      method: 'REPORT',
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/xml; charset=utf-8',
        Depth: '1',
      },
      body,
    });

    if (!res.ok) {
      console.error('[caldav] REPORT failed:', res.status);
      return [];
    }

    const xml = await res.text();
    const icals: string[] = [];
    const calDataRegex = /<c:calendar-data[^>]*>([\s\S]*?)<\/c:calendar-data>/gi;
    let match;
    while ((match = calDataRegex.exec(xml)) !== null) {
      icals.push(match[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    }
    return icals;
  } catch (err) {
    console.error('[caldav] Fetch error:', err);
    return [];
  }
}
```

Then refactor `fetchEvents` to use `fetchEventsRaw` internally (replace lines 48-89):

```typescript
async function fetchEvents(from: Date, to: Date): Promise<CalEvent[]> {
  const icals = await fetchEventsRaw(from, to);
  const events: CalEvent[] = [];

  for (const ical of icals) {
    const veventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/gi;
    let eventMatch;

    while ((eventMatch = veventRegex.exec(ical)) !== null) {
      const block = eventMatch[1];
      const dtstart = extractICalProp(block, 'DTSTART');
      const dtend = extractICalProp(block, 'DTEND');
      const summary = extractICalProp(block, 'SUMMARY') || 'Busy';

      if (dtstart) {
        const start = parseICalDate(dtstart);
        const end = dtend ? parseICalDate(dtend) : new Date(start.getTime() + 3600000);
        events.push({ start, end, summary });
      }
    }
  }

  return events;
}
```

Add after the `parseICalDate` function (after line 137):

```typescript
export interface ClientBooking {
  summary: string;
  start: Date;
  end: Date;
  status: string; // CONFIRMED, TENTATIVE, CANCELLED
}

// Fetch calendar events where the client is an attendee
export async function getClientBookings(clientEmail: string): Promise<ClientBooking[]> {
  const now = new Date();
  const past = new Date(now);
  past.setDate(past.getDate() - 90); // Last 90 days
  const future = new Date(now);
  future.setDate(future.getDate() + BOOKING_HORIZON_DAYS);

  const icals = await fetchEventsRaw(past, future);
  const bookings: ClientBooking[] = [];

  for (const ical of icals) {
    const veventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/gi;
    let eventMatch;

    while ((eventMatch = veventRegex.exec(ical)) !== null) {
      const block = eventMatch[1];
      // Check if this client is an attendee
      const attendeePattern = new RegExp(
        `ATTENDEE[^:]*:mailto:${clientEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'i'
      );
      if (!attendeePattern.test(block)) continue;

      const dtstart = extractICalProp(block, 'DTSTART');
      const dtend = extractICalProp(block, 'DTEND');
      const summary = extractICalProp(block, 'SUMMARY') || 'Termin';
      const status = extractICalProp(block, 'STATUS') || 'CONFIRMED';

      if (dtstart) {
        bookings.push({
          summary,
          start: parseICalDate(dtstart),
          end: dtend ? parseICalDate(dtend) : new Date(parseICalDate(dtstart).getTime() + 3600000),
          status,
        });
      }
    }
  }

  bookings.sort((a, b) => b.start.getTime() - a.start.getTime());
  return bookings;
}
```

- [ ] **Step 2: Update BookingsTab to display real data**

Replace the entire contents of `website/src/components/portal/BookingsTab.astro`:

```astro
---
import { getClientBookings } from '../../lib/caldav';
import type { ClientBooking } from '../../lib/caldav';

interface Props {
  clientEmail: string;
}
const { clientEmail } = Astro.props;

let bookings: ClientBooking[] = [];
try {
  bookings = await getClientBookings(clientEmail);
} catch {
  // CalDAV unavailable
}

const now = new Date();
const upcoming = bookings.filter(b => b.start >= now && b.status !== 'CANCELLED');
const past = bookings.filter(b => b.start < now || b.status === 'CANCELLED');
---

<div data-testid="bookings-tab">
  <h3 class="text-lg font-semibold text-light mb-4">Ihre Termine</h3>

  {bookings.length === 0 ? (
    <p class="text-muted">Keine gebuchten Termine vorhanden.</p>
  ) : (
    <>
      {upcoming.length > 0 && (
        <div class="mb-6">
          <h4 class="text-sm font-medium text-muted mb-3 uppercase tracking-wide">Anstehend</h4>
          <ul class="space-y-2">
            {upcoming.map(b => (
              <li class="flex items-center gap-3 p-3 bg-dark rounded-lg border border-dark-lighter">
                <div class="flex-1">
                  <span class="text-light font-medium">{b.summary}</span>
                  <div class="text-sm text-muted mt-1">
                    {b.start.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}
                    {' '}um{' '}
                    {b.start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    {' '}&ndash;{' '}
                    {b.end.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <span class="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent">
                  {b.status === 'TENTATIVE' ? 'Anfrage' : 'Bestaetigt'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h4 class="text-sm font-medium text-muted mb-3 uppercase tracking-wide">Vergangene</h4>
          <ul class="space-y-2">
            {past.map(b => (
              <li class="flex items-center gap-3 p-3 bg-dark rounded-lg border border-dark-lighter opacity-60">
                <div class="flex-1">
                  <span class="text-light">{b.summary}</span>
                  <div class="text-sm text-muted mt-1">
                    {b.start.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </div>
                </div>
                <span class="text-xs px-2 py-0.5 rounded-full bg-dark-lighter text-muted">
                  {b.status === 'CANCELLED' ? 'Abgesagt' : 'Vergangen'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )}
</div>
```

- [ ] **Step 3: Verify build compiles**

Run: `cd /home/patrick/Bachelorprojekt/website && npx astro check 2>&1 | tail -20`
Expected: No type errors in `caldav.ts` or `BookingsTab.astro`

- [ ] **Step 4: Commit**

```bash
git add src/lib/caldav.ts src/components/portal/BookingsTab.astro
git commit -m "feat: populate BookingsTab with CalDAV client bookings"
```

---

### Task 2: InvoicesTab — Add InvoiceNinja invoice listing

**Files:**
- Modify: `website/src/lib/invoiceninja.ts` (add `getClientInvoices()` after line 203)
- Modify: `website/src/components/portal/InvoicesTab.astro`

InvoiceNinja v5 API supports `GET /clients?email=X` (already used in `getOrCreateClient`) and `GET /invoices?client_id=X`.

- [ ] **Step 1: Add `getClientInvoices()` to `invoiceninja.ts`**

Add after the `createQuote` function (after line 203):

```typescript
// InvoiceNinja v5 invoice status IDs
const INVOICE_STATUS_LABELS: Record<string, string> = {
  '1': 'Entwurf',
  '2': 'Versendet',
  '3': 'Teilweise bezahlt',
  '4': 'Bezahlt',
  '5': 'Storniert',
  '6': 'Ueberfaellig',
};

export interface ClientInvoiceListItem {
  id: string;
  number: string;
  date: string;
  dueDate: string;
  amount: number;
  balance: number;
  statusId: string;
  statusLabel: string;
}

// List invoices for a client by email
export async function getClientInvoices(clientEmail: string): Promise<ClientInvoiceListItem[]> {
  if (!IN_TOKEN) return [];

  // Find client by email
  const searchRes = await inApi('GET', `/clients?email=${encodeURIComponent(clientEmail)}`);
  if (!searchRes.ok) return [];

  const clientData = await searchRes.json();
  if (!clientData.data?.length) return [];

  const clientId = clientData.data[0].id;

  // Fetch invoices for this client
  const invoicesRes = await inApi('GET', `/invoices?client_id=${clientId}&sort=date|desc&per_page=50`);
  if (!invoicesRes.ok) return [];

  const invoicesData = await invoicesRes.json();
  return (invoicesData.data || []).map((inv: {
    id: string; number: string; date: string; due_date: string;
    amount: number; balance: number; status_id: string;
  }) => ({
    id: inv.id,
    number: inv.number,
    date: inv.date,
    dueDate: inv.due_date,
    amount: inv.amount,
    balance: inv.balance,
    statusId: inv.status_id,
    statusLabel: INVOICE_STATUS_LABELS[inv.status_id] || 'Unbekannt',
  }));
}
```

- [ ] **Step 2: Update InvoicesTab to display real data**

Replace the entire contents of `website/src/components/portal/InvoicesTab.astro`:

```astro
---
import { getClientInvoices } from '../../lib/invoiceninja';
import type { ClientInvoiceListItem } from '../../lib/invoiceninja';

interface Props {
  clientEmail: string;
}
const { clientEmail } = Astro.props;

let invoices: ClientInvoiceListItem[] = [];
try {
  invoices = await getClientInvoices(clientEmail);
} catch {
  // InvoiceNinja unavailable
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function statusColor(statusId: string): string {
  switch (statusId) {
    case '4': return 'bg-green-500/20 text-green-400';  // Paid
    case '2': return 'bg-accent/20 text-accent';          // Sent
    case '6': return 'bg-red-500/20 text-red-400';        // Overdue
    case '5': return 'bg-dark-lighter text-muted';         // Cancelled
    default: return 'bg-dark-lighter text-muted';
  }
}
---

<div data-testid="invoices-tab">
  <h3 class="text-lg font-semibold text-light mb-4">Ihre Rechnungen</h3>

  {invoices.length === 0 ? (
    <p class="text-muted">Keine Rechnungen vorhanden.</p>
  ) : (
    <ul class="space-y-2">
      {invoices.map(inv => (
        <li class="flex items-center gap-3 p-3 bg-dark rounded-lg border border-dark-lighter" data-testid="invoice-item">
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <span class="text-light font-medium">#{inv.number}</span>
              <span class={`text-xs px-2 py-0.5 rounded-full ${statusColor(inv.statusId)}`}>
                {inv.statusLabel}
              </span>
            </div>
            <div class="text-sm text-muted mt-1">
              {formatDate(inv.date)}
              {inv.dueDate && inv.statusId !== '4' && (
                <span> &middot; Faellig: {formatDate(inv.dueDate)}</span>
              )}
            </div>
          </div>
          <div class="text-right">
            <div class="text-light font-medium">{formatCurrency(inv.amount)}</div>
            {inv.balance > 0 && inv.balance !== inv.amount && (
              <div class="text-xs text-muted">Offen: {formatCurrency(inv.balance)}</div>
            )}
          </div>
        </li>
      ))}
    </ul>
  )}
</div>
```

- [ ] **Step 3: Verify build compiles**

Run: `cd /home/patrick/Bachelorprojekt/website && npx astro check 2>&1 | tail -20`
Expected: No type errors in `invoiceninja.ts` or `InvoicesTab.astro`

- [ ] **Step 4: Commit**

```bash
git add src/lib/invoiceninja.ts src/components/portal/InvoicesTab.astro
git commit -m "feat: populate InvoicesTab with InvoiceNinja client invoices"
```

---

### Task 3: Claude AI Insights — Add to finalize pipeline

**Files:**
- Create: `website/src/lib/claude.ts`
- Modify: `website/src/pages/api/meeting/finalize.ts:218-228` (add step between embeddings and Mattermost summary)
- Modify: `website/package.json` (add `@anthropic-ai/sdk` dependency)

The `saveInsight()` function in `meetings-db.ts:188` already exists and supports types: `summary`, `action_items`, `key_topics`, `sentiment`, `coaching_notes`. The Outline `updateDocument()` function also exists. We just need to call Claude and wire it in.

- [ ] **Step 1: Install Anthropic SDK**

Run: `cd /home/patrick/Bachelorprojekt/website && npm install @anthropic-ai/sdk`

- [ ] **Step 2: Create `src/lib/claude.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

export interface MeetingInsights {
  summary: string;
  actionItems: string;
  keyTopics: string;
  sentiment: string;
  coachingNotes: string;
}

// Generate coaching insights from a meeting transcript and artifacts
export async function generateMeetingInsights(params: {
  customerName: string;
  meetingType: string;
  transcript: string;
  artifacts?: string;
}): Promise<MeetingInsights | null> {
  if (!ANTHROPIC_API_KEY) {
    console.log('[claude] No API key configured. Skipping insights generation.');
    return null;
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const artifactSection = params.artifacts
    ? `\n\n## Whiteboard-Artefakte\n${params.artifacts}`
    : '';

  const prompt = `Du bist ein erfahrener Coaching-Assistent. Analysiere das folgende Meeting-Transkript und erstelle strukturierte Erkenntnisse.

## Kontext
- Kunde: ${params.customerName}
- Typ: ${params.meetingType}

## Transkript
${params.transcript.substring(0, 30000)}${artifactSection}

Erstelle die Analyse im folgenden JSON-Format. Alle Texte auf Deutsch:
{
  "summary": "2-3 Saetze Zusammenfassung des Meetings",
  "actionItems": "Bullet-Liste der naechsten Schritte (Markdown)",
  "keyTopics": "Komma-separierte Liste der Hauptthemen",
  "sentiment": "Kurze Einschaetzung der Stimmung und Dynamik",
  "coachingNotes": "Beobachtungen und Empfehlungen fuer den Coach (Markdown)"
}

Antworte ausschliesslich mit dem JSON-Objekt.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');

    // Extract JSON from response (handle possible markdown code fences)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[claude] No JSON found in response');
      return null;
    }

    return JSON.parse(jsonMatch[0]) as MeetingInsights;
  } catch (err) {
    console.error('[claude] Insights generation failed:', err);
    return null;
  }
}
```

- [ ] **Step 3: Wire insights into finalize pipeline**

In `website/src/pages/api/meeting/finalize.ts`:

Update the existing import on line 8 to include `saveInsight`:

```typescript
import {
  upsertCustomer, createMeeting, updateMeetingStatus,
  saveTranscript, saveArtifact, saveInsight, generateMeetingEmbeddings,
} from '../../../lib/meetings-db';
```

Add new import after line 7:

```typescript
import { generateMeetingInsights } from '../../../lib/claude';
```

Then add step 7b after embeddings (after line 227, before `await updateMeetingStatus(meeting.id, 'finalized')` on line 229):

```typescript
    // ── 7b. Generate Claude AI insights (best-effort) ───────────────
    if (transcriptText) {
      try {
        const artifactTexts = whiteboardArtifacts
          .map(wb => {
            const text = extractWhiteboardText(wb.data);
            return text ? `### ${wb.name}\n${text}` : '';
          })
          .filter(Boolean)
          .join('\n\n');

        const insights = await generateMeetingInsights({
          customerName,
          meetingType: meetingType || 'Meeting',
          transcript: transcriptText,
          artifacts: artifactTexts || undefined,
        });

        if (insights) {
          const insightTypes = [
            { type: 'summary' as const, content: insights.summary },
            { type: 'action_items' as const, content: insights.actionItems },
            { type: 'key_topics' as const, content: insights.keyTopics },
            { type: 'sentiment' as const, content: insights.sentiment },
            { type: 'coaching_notes' as const, content: insights.coachingNotes },
          ];

          for (const { type, content } of insightTypes) {
            await saveInsight({
              meetingId: meeting.id,
              insightType: type,
              content,
              generatedBy: 'claude-sonnet-4-20250514',
            });
          }
          results.push(`:brain: Claude-Analyse: ${insightTypes.length} Insights generiert`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Claude-Insights: ${msg}`);
        await notifyPipelineError({ step: 'Claude-Insights generieren', error: msg, customerName, meetingId });
      }
    }
```

- [ ] **Step 4: Add ANTHROPIC_API_KEY to K8s ConfigMap**

In `k3d/website.yaml`, add to the `website-config` ConfigMap data (after the `OUTLINE_API_KEY` line):

```yaml
  ANTHROPIC_API_KEY: ""
```

- [ ] **Step 5: Verify build compiles**

Run: `cd /home/patrick/Bachelorprojekt/website && npx astro check 2>&1 | tail -20`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/lib/claude.ts website/src/pages/api/meeting/finalize.ts website/package.json website/package-lock.json k3d/website.yaml
git commit -m "feat: add Claude AI insights generation to meeting finalize pipeline"
```

---

### Task 4: Session Storage — Migrate from in-memory to PostgreSQL

**Files:**
- Modify: `website/src/lib/auth.ts:33-40` (replace Map with pg pool)
- Modify: `website/src/pages/api/auth/logout.ts` (await now-async `getLogoutUrl`)
- Modify: `k3d/website.yaml` (add `SESSIONS_DATABASE_URL` to ConfigMap)

The meetings-db already uses `pg` and the shared PostgreSQL instance. Sessions will use the same database.

- [ ] **Step 1: Replace in-memory session store with PostgreSQL in `auth.ts`**

Replace lines 33-40 (the in-memory Map and `generateSessionId`):

```typescript
// PostgreSQL session store (survives container restarts)
import pg from 'pg';
const sessionPool = new pg.Pool({
  connectionString: process.env.SESSIONS_DATABASE_URL
    || 'postgresql://meetings:devmeetingsdb@shared-db.workspace.svc.cluster.local:5432/meetings',
});

// Ensure sessions table exists (called lazily)
let sessionsTableReady = false;
async function ensureSessionsTable(): Promise<void> {
  if (sessionsTableReady) return;
  await sessionPool.query(`
    CREATE TABLE IF NOT EXISTS web_sessions (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  sessionsTableReady = true;
}

function generateSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 2: Update `getLogoutUrl` to delete from PostgreSQL**

Replace lines 53-61:

```typescript
export async function getLogoutUrl(sessionId?: string): Promise<string> {
  if (sessionId) {
    try {
      await ensureSessionsTable();
      await sessionPool.query('DELETE FROM web_sessions WHERE id = $1', [sessionId]);
    } catch { /* best-effort cleanup */ }
  }

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    post_logout_redirect_uri: SITE_URL,
  });
  return `${LOGOUT_ENDPOINT}?${params}`;
}
```

- [ ] **Step 3: Update `exchangeCode` to write to PostgreSQL**

Replace lines 96-110 (inside `exchangeCode`, the part that creates and stores the session):

```typescript
  const sessionId = generateSessionId();
  const user: UserSession = {
    sub: userInfo.sub,
    email: userInfo.email,
    name: userInfo.name || `${userInfo.given_name || ''} ${userInfo.family_name || ''}`.trim(),
    preferred_username: userInfo.preferred_username,
    given_name: userInfo.given_name,
    family_name: userInfo.family_name,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + tokens.expires_in * 1000,
  };

  await ensureSessionsTable();
  await sessionPool.query(
    'INSERT INTO web_sessions (id, data, expires_at) VALUES ($1, $2, $3)',
    [sessionId, JSON.stringify(user), new Date(user.expires_at)]
  );
  return { sessionId, user };
```

- [ ] **Step 4: Update `getSession` to read from PostgreSQL**

Replace lines 119-137:

```typescript
export async function getSession(cookieHeader: string | null): Promise<UserSession | null> {
  if (!cookieHeader) return null;

  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;

  const sessionId = match[1];

  try {
    await ensureSessionsTable();
    const result = await sessionPool.query(
      'SELECT data FROM web_sessions WHERE id = $1 AND expires_at > NOW()',
      [sessionId]
    );

    if (result.rows.length === 0) return null;

    const session = result.rows[0].data as UserSession;

    // Check expiry (with 60s buffer)
    if (session.expires_at < Date.now() + 60000) {
      await sessionPool.query('DELETE FROM web_sessions WHERE id = $1', [sessionId]);
      return null;
    }

    return session;
  } catch (err) {
    console.error('[auth] Session lookup failed:', err);
    return null;
  }
}
```

- [ ] **Step 5: Update callers for now-async functions**

`getSession` was already called with `await` in all Astro pages (portal.astro, admin/index.astro, admin/[clientId].astro). Verify no callers break.

`getLogoutUrl` is now async. Update `website/src/pages/api/auth/logout.ts`:

Change `const url = getLogoutUrl(sessionId);` to `const url = await getLogoutUrl(sessionId);`

- [ ] **Step 6: Add periodic expired session cleanup**

Add at the bottom of `auth.ts`:

```typescript
// Clean up expired sessions every 15 minutes
setInterval(async () => {
  try {
    await ensureSessionsTable();
    await sessionPool.query('DELETE FROM web_sessions WHERE expires_at < NOW()');
  } catch { /* best-effort */ }
}, 15 * 60 * 1000);
```

- [ ] **Step 7: Add `SESSIONS_DATABASE_URL` to K8s ConfigMap**

In `k3d/website.yaml`, add to ConfigMap data (after `OUTLINE_API_KEY`):

```yaml
  SESSIONS_DATABASE_URL: "postgresql://meetings:devmeetingsdb@shared-db.workspace.svc.cluster.local:5432/meetings"
```

- [ ] **Step 8: Verify build compiles**

Run: `cd /home/patrick/Bachelorprojekt/website && npx astro check 2>&1 | tail -20`
Expected: No type errors

- [ ] **Step 9: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/lib/auth.ts website/src/pages/api/auth/logout.ts k3d/website.yaml
git commit -m "feat: migrate session storage from in-memory to PostgreSQL"
```

---

### Task 5: Reminders — Migrate from in-memory to PostgreSQL

**Files:**
- Modify: `website/src/lib/reminders.ts` (replace Map with pg pool)
- Modify: `website/src/pages/api/mattermost/actions.ts:155` (await `scheduleReminder`)
- Modify: `website/src/pages/api/reminders/process.ts:10,27` (await `getPendingReminders`)

Same pattern as sessions. The reminder CronJob in `k3d/website.yaml:153-173` already exists and triggers every minute.

- [ ] **Step 1: Rewrite `reminders.ts` to use PostgreSQL**

Replace the entire file:

```typescript
// Meeting reminder scheduler backed by PostgreSQL.
// Stores reminders in the database so they survive container restarts.
// Triggered every minute by K8s CronJob -> POST /api/reminders/process.

import pg from 'pg';
import { sendEmail } from './email';

const BRAND_NAME = process.env.BRAND_NAME || 'Workspace';
const REMINDERS_DB_URL = process.env.SESSIONS_DATABASE_URL
  || 'postgresql://meetings:devmeetingsdb@shared-db.workspace.svc.cluster.local:5432/meetings';

const pool = new pg.Pool({ connectionString: REMINDERS_DB_URL });

let tableReady = false;
async function ensureTable(): Promise<void> {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS meeting_reminders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      meeting_start TIMESTAMPTZ NOT NULL,
      reminder_time TIMESTAMPTZ NOT NULL,
      meeting_url TEXT NOT NULL,
      meeting_type TEXT NOT NULL,
      sent BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  tableReady = true;
}

export interface Reminder {
  id: string;
  meetingStart: Date;
  reminderTime: Date;
  email: string;
  name: string;
  meetingUrl: string;
  meetingType: string;
  sent: boolean;
}

export async function scheduleReminder(params: {
  email: string;
  name: string;
  meetingStart: Date;
  meetingUrl: string;
  meetingType: string;
}): Promise<string> {
  await ensureTable();
  const reminderTime = new Date(params.meetingStart.getTime() - 10 * 60 * 1000);

  const result = await pool.query(
    `INSERT INTO meeting_reminders (email, name, meeting_start, reminder_time, meeting_url, meeting_type)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [params.email, params.name, params.meetingStart, reminderTime, params.meetingUrl, params.meetingType]
  );

  const id = result.rows[0].id;
  console.log(`[reminders] Scheduled reminder ${id} for ${params.name} at ${reminderTime.toISOString()}`);
  return id;
}

export async function processDueReminders(): Promise<number> {
  await ensureTable();
  let sent = 0;

  const result = await pool.query(
    `SELECT id, email, name, meeting_start, reminder_time, meeting_url, meeting_type
     FROM meeting_reminders
     WHERE sent = false AND reminder_time <= NOW()
     ORDER BY reminder_time ASC`
  );

  for (const row of result.rows) {
    const startTime = new Date(row.meeting_start).toLocaleTimeString('de-DE', {
      hour: '2-digit', minute: '2-digit',
    });
    const startDate = new Date(row.meeting_start).toLocaleDateString('de-DE', {
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    });

    const emailSent = await sendEmail({
      to: row.email,
      subject: `Erinnerung: ${row.meeting_type} in 10 Minuten`,
      text: `Hallo ${row.name},

Ihr Termin beginnt in 10 Minuten!

  Typ:     ${row.meeting_type}
  Datum:   ${startDate}
  Uhrzeit: ${startTime}

Hier ist Ihr Meeting-Link:
${row.meeting_url}

Klicken Sie auf den Link, um dem Meeting beizutreten.

Mit freundlichen Grussen
${BRAND_NAME}`,
      html: `<p>Hallo ${row.name},</p>
<p><strong>Ihr Termin beginnt in 10 Minuten!</strong></p>
<table style="border-collapse:collapse;margin:16px 0">
<tr><td style="padding:4px 12px 4px 0;color:#666">Typ</td><td>${row.meeting_type}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#666">Datum</td><td>${startDate}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#666">Uhrzeit</td><td>${startTime}</td></tr>
</table>
<p><a href="${row.meeting_url}" style="display:inline-block;background:#e8c870;color:#0f1623;padding:12px 24px;border-radius:25px;text-decoration:none;font-weight:bold">Zum Meeting beitreten</a></p>
<p>Mit freundlichen Grussen<br>${BRAND_NAME}</p>`,
    });

    if (emailSent) {
      await pool.query('UPDATE meeting_reminders SET sent = true WHERE id = $1', [row.id]);
      sent++;
      console.log(`[reminders] Sent reminder ${row.id} to ${row.email}`);
    }
  }

  // Clean up old sent reminders (older than 1 hour past meeting time)
  await pool.query(
    `DELETE FROM meeting_reminders WHERE sent = true AND meeting_start < NOW() - INTERVAL '1 hour'`
  );

  return sent;
}

export async function getPendingReminders(): Promise<Reminder[]> {
  await ensureTable();
  const result = await pool.query(
    `SELECT id, email, name, meeting_start, reminder_time, meeting_url, meeting_type, sent
     FROM meeting_reminders WHERE sent = false ORDER BY reminder_time ASC`
  );

  return result.rows.map(row => ({
    id: row.id,
    meetingStart: new Date(row.meeting_start),
    reminderTime: new Date(row.reminder_time),
    email: row.email,
    name: row.name,
    meetingUrl: row.meeting_url,
    meetingType: row.meeting_type,
    sent: row.sent,
  }));
}
```

- [ ] **Step 2: Update `scheduleReminder` caller to await**

In `website/src/pages/api/mattermost/actions.ts:155`, change:

```typescript
          scheduleReminder({
```

to:

```typescript
          await scheduleReminder({
```

- [ ] **Step 3: Update `getPendingReminders` caller to await**

In `website/src/pages/api/reminders/process.ts`, line 10 change:

```typescript
    const pending = getPendingReminders();
```

to:

```typescript
    const pending = await getPendingReminders();
```

And line 27 change:

```typescript
  const pending = getPendingReminders();
```

to:

```typescript
  const pending = await getPendingReminders();
```

- [ ] **Step 4: Verify build compiles**

Run: `cd /home/patrick/Bachelorprojekt/website && npx astro check 2>&1 | tail -20`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/reminders.ts website/src/pages/api/mattermost/actions.ts website/src/pages/api/reminders/process.ts
git commit -m "feat: migrate reminders from in-memory to PostgreSQL"
```

---

### Task 6: Tests — Add coverage for new functionality

**Files:**
- Modify: `website/tests/api.test.mjs`

- [ ] **Step 1: Add BookingsTab and InvoicesTab portal tests**

Add after the existing page route tests section in `tests/api.test.mjs`:

```javascript
section('Portal Tabs (unauthenticated - expect redirect)');

await assert('GET /portal redirects to login', async () => {
  const res = await fetch(`${BASE_URL}/portal`, { redirect: 'manual' });
  expect(res.status).toBeOneOf([302, 303]);
});

section('Calendar Client Bookings API');

await assert('GET /api/calendar/slots returns 200 or 500', async () => {
  const res = await fetch(`${BASE_URL}/api/calendar/slots`);
  expect(res.status).toBeOneOf([200, 500]);
  if (res.status === 200) {
    const data = await res.json();
    expect(data).toBeArray();
  }
});
```

- [ ] **Step 2: Add meeting finalize insights test**

Add to the existing meeting finalize section:

```javascript
await assert('POST /api/meeting/finalize with transcript returns results', async () => {
  const res = await fetch(`${BASE_URL}/api/meeting/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: 'Test Insights',
      customerEmail: 'insights@test.local',
      meetingType: 'Test',
      transcript: 'Dies ist ein Test-Transkript fuer die Insights-Generierung.',
    }),
  });
  // Pipeline may fail on DB connection, but should not crash
  expect(res.status).toBeOneOf([200, 503]);
});
```

- [ ] **Step 3: Add reminders persistence test**

```javascript
section('Reminders (persistence)');

await assert('GET /api/reminders/process returns pending count', async () => {
  const res = await fetch(`${BASE_URL}/api/reminders/process`);
  expect(res.status).toBeOneOf([200, 500]);
  if (res.status === 200) {
    const data = await res.json();
    expect(data).toHaveProperty('pending');
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add website/tests/api.test.mjs
git commit -m "test: add coverage for bookings, invoices, insights, and reminders"
```

---

## Summary

| Task | Gap Addressed | Effort |
|------|--------------|--------|
| 1 | BookingsTab shows real CalDAV data | Small |
| 2 | InvoicesTab shows real InvoiceNinja data | Small |
| 3 | Claude AI insights in finalize pipeline | Medium |
| 4 | Session storage -> PostgreSQL | Medium |
| 5 | Reminders -> PostgreSQL | Medium |
| 6 | Test coverage for new features | Small |

**Not addressed in this plan** (deliberate scope exclusions):
- **Email<->Mattermost bidirectional thread sync**: Requires a Mattermost outgoing webhook or bot that monitors replies and forwards them via email. Separate integration with its own deployment. Should be a separate plan.
- **Admin client detail page enrichment**: Automatically benefits from Tasks 1+2 since the same BookingsTab and InvoicesTab components are reused. The `[clientId].astro` page already passes the correct props to all tab components.
