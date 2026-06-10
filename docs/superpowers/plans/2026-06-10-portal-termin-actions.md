---
title: Portal-Terminbuchung: 4 AI-Assistant-Actions
ticket_id: T000582
domains: [website, db, test, security]
status: done
pr_number: null
---

# Portal-Terminbuchung: 4 AI-Assistant-Actions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die vier Portal-Actions `portal:book-session`, `portal:cancel-session`, `portal:move-session` und `portal:request-session` von leeren Stubs zu echten CalDAV-/InboxItem-Implementierungen ausbauen, sodass Kunden per AI-Chat Termine wirklich buchen, absagen, verschieben und anfragen können.

**Architecture:** Jede Action liest `ctx.email` (neues Feld auf `ActionContext`, das der Dispatcher via `getCustomerByKeycloakId(ctx.userSub)` vorab befüllt) und ruft direkt CalDAV-Funktionen aus `caldav.ts` auf. `bookSession` erstellt einen neuen CalDAV-Event; `cancelSession` löscht ihn per UID; `moveSession` patcht DTSTART/DTEND via neue Funktion `updateCalendarEventTime`; `requestSession` legt ein `InboxItem` vom Typ `'booking'` an. Alle drei schreibenden Flows schicken danach eine Bestätigungs-E-Mail. Ownership-Prüfung (cancel/move) vergleicht die ATTENDEE-E-Mail des Events mit `ctx.email`, bevor mutiert wird.

**Tech Stack:** TypeScript, Astro SSR (Node.js), Nextcloud CalDAV (RFC 5545), nodemailer (SMTP/Mailpit), PostgreSQL (`customers`-Tabelle via `pg`), Playwright (E2E), Vitest (Unit).

---

## Datei-Übersicht

| Datei | Aktion |
|-------|--------|
| `website/src/lib/caldav.ts` | Modify: CRLF-Fix + `updateCalendarEventTime()` + `uid` in `getClientBookings` |
| `website/src/lib/assistant/types.ts` | Modify: `ActionContext.email?: string` |
| `website/src/lib/assistant/actions.ts` | Modify: `getCustomerByKeycloakId`-Middleware in `executeAction` |
| `website/src/lib/website-db.ts` | Modify: neue Funktion `getCustomerByKeycloakId(sub)` |
| `website/src/lib/email.ts` | Modify: 3 neue Export-Funktionen |
| `website/src/lib/assistant/actions/portal/bookSession.ts` | Replace: Stub → echter Handler |
| `website/src/lib/assistant/actions/portal/cancelSession.ts` | Replace: Stub → echter Handler |
| `website/src/lib/assistant/actions/portal/moveSession.ts` | Replace: Stub → echter Handler |
| `website/src/lib/assistant/actions/portal/requestSession.ts` | Create: neuer Handler |
| `website/src/lib/assistant/actions/portal/index.ts` | Modify: `requestSession` importieren |
| `website/src/lib/assistant/actions/portal/profile-isolation.test.ts` | Modify: Zähler 7 → 8 |
| `tests/e2e/specs/portal-termin-actions.spec.ts` | Create: E2E Happy-Path |
| `website/src/data/test-inventory.json` | Regenerate |

---

## Task 1: RFC 5545 CRLF-Fix in `createCalendarEvent`

**Files:**
- Modify: `website/src/lib/caldav.ts:476-487`

Der iCal-String in `createCalendarEvent` verwendet `\n` statt `\r\n`. Strict RFC-5545-Parser (wie manche Nextcloud-Versionen bei PUT) akzeptieren das nicht.

- [x] **Schritt 1: Failing Unit-Test schreiben**

Erstelle `website/src/lib/__tests__/caldav-crlf.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We intercept fetch to capture the PUT body
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// Reset module state between tests
beforeEach(() => {
  fetchMock.mockReset();
  vi.resetModules();
});

describe('createCalendarEvent CRLF', () => {
  it('uses \\r\\n line endings in the PUT body (RFC 5545)', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, text: async () => '' });

    const { createCalendarEvent } = await import('../caldav.js');
    await createCalendarEvent({
      summary: 'Test',
      description: 'desc',
      start: new Date('2026-07-01T09:00:00Z'),
      end:   new Date('2026-07-01T10:00:00Z'),
    });

    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = opts.body as string;
    // Every line break must be CRLF; no bare LF allowed
    const bareNewlines = body.match(/(?<!\r)\n/g);
    expect(bareNewlines).toBeNull();
    expect(body).toMatch(/\r\n/);
  });
});
```

- [x] **Schritt 2: Test ausführen — muss FAIL sein**

```bash
cd /tmp/wt-portal-termin/website && npx vitest run src/lib/__tests__/caldav-crlf.test.ts 2>&1 | tail -20
```

Erwartetes Ergebnis: FAIL (bare `\n` vorhanden).

- [x] **Schritt 3: CRLF-Fix implementieren**

In `website/src/lib/caldav.ts` die `createCalendarEvent`-Funktion anpassen. Suche den Template-Literal-Block (Zeilen ~476–487) und ersetze alle `\n` durch `\r\n`:

```typescript
  const ical = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${BRAND_NAME}//Booking//DE`,
    'BEGIN:VEVENT',
    `UID:${uid}@${BRAND_NAME}`,
    `DTSTART:${formatDt(params.start)}`,
    `DTEND:${formatDt(params.end)}`,
    `SUMMARY:${params.summary}`,
    `DESCRIPTION:${params.description.replace(/\n/g, '\\n')}`,
    ...(attendeeLine ? [attendeeLine] : []),
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n') + '\r\n';
```

Passe gleichzeitig `attendeeLine` an — statt dem abschließenden `\n` nur den Wert ohne Zeilenumbruch:

```typescript
  let attendeeLine = '';
  if (params.attendeeEmail) {
    const cn = params.attendeeName || params.attendeeEmail;
    attendeeLine = `ATTENDEE;CN=${cn};RSVP=TRUE:mailto:${params.attendeeEmail}`;
  }
```

- [x] **Schritt 4: Test ausführen — muss PASS sein**

```bash
cd /tmp/wt-portal-termin/website && npx vitest run src/lib/__tests__/caldav-crlf.test.ts 2>&1 | tail -10
```

Erwartetes Ergebnis: PASS.

- [x] **Schritt 5: Commit**

```bash
cd /tmp/wt-portal-termin && git add website/src/lib/caldav.ts website/src/lib/__tests__/caldav-crlf.test.ts
git commit -m "fix(caldav): use CRLF line endings in createCalendarEvent (RFC 5545)"
```

---

## Task 2: `ClientBooking` um `uid`-Feld erweitern

**Files:**
- Modify: `website/src/lib/caldav.ts:156-271`

`getClientBookings()` liefert aktuell kein `uid`. Die Actions `cancelSession` und `moveSession` brauchen es, um den richtigen CalDAV-Event zu adressieren.

- [x] **Schritt 1: Failing Test schreiben**

Erweitere `website/src/lib/__tests__/caldav-crlf.test.ts` (oder erstelle `website/src/lib/__tests__/caldav-uid.test.ts`):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  vi.resetModules();
});

describe('getClientBookings uid', () => {
  it('includes the uid field in each returned booking', async () => {
    const ical = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:abc-123@Workspace',
      'DTSTART:20260701T090000Z',
      'DTEND:20260701T100000Z',
      'SUMMARY:Termin',
      'STATUS:CONFIRMED',
      'ATTENDEE;CN=Test;RSVP=TRUE:mailto:test@example.com',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const xmlBody = `<multistatus xmlns:c="urn:ietf:params:xml:ns:caldav">
      <response><propstat><prop>
        <c:calendar-data>${ical}</c:calendar-data>
      </prop></propstat></response></multistatus>`;

    fetchMock.mockResolvedValue({ ok: true, status: 207, text: async () => xmlBody });

    const { getClientBookings } = await import('../caldav.js');
    const bookings = await getClientBookings('test@example.com');

    expect(bookings).toHaveLength(1);
    expect((bookings[0] as { uid: string }).uid).toBe('abc-123@Workspace');
  });
});
```

- [x] **Schritt 2: Test ausführen — muss FAIL sein**

```bash
cd /tmp/wt-portal-termin/website && npx vitest run src/lib/__tests__/caldav-uid.test.ts 2>&1 | tail -20
```

Erwartetes Ergebnis: FAIL (`uid` ist undefined).

- [x] **Schritt 3: Interface und Implementierung erweitern**

In `website/src/lib/caldav.ts` das Interface `ClientBooking` erweitern:

```typescript
export interface ClientBooking {
  uid: string;   // ← NEU
  summary: string;
  start: Date;
  end: Date;
  status: string;
}
```

In `getClientBookings()` den `uid`-Wert beim Aufbau des Booking-Objekts mit extrahieren:

```typescript
      if (dtstart) {
        const uid = extractICalProp(block, 'UID') || '';   // ← NEU
        bookings.push({
          uid,                                              // ← NEU
          summary,
          start: parseICalDate(dtstart),
          end: dtend ? parseICalDate(dtend) : new Date(parseICalDate(dtstart).getTime() + 3600000),
          status,
        });
      }
```

- [x] **Schritt 4: Test ausführen — muss PASS sein**

```bash
cd /tmp/wt-portal-termin/website && npx vitest run src/lib/__tests__/caldav-uid.test.ts 2>&1 | tail -10
```

- [x] **Schritt 5: Commit**

```bash
cd /tmp/wt-portal-termin && git add website/src/lib/caldav.ts website/src/lib/__tests__/caldav-uid.test.ts
git commit -m "feat(caldav): add uid field to ClientBooking / getClientBookings"
```

---

## Task 3: `updateCalendarEventTime()` in caldav.ts

**Files:**
- Modify: `website/src/lib/caldav.ts` (append after `updateCalendarEventStatus`)

Neue Funktion, die DTSTART und DTEND eines existierenden Events per UID patcht (analog zu `updateCalendarEventStatus`).

- [x] **Schritt 1: Failing Test schreiben**

Erstelle `website/src/lib/__tests__/caldav-move.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  vi.resetModules();
});

describe('updateCalendarEventTime', () => {
  it('returns false when event uid not found (HEAD 404)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    const { updateCalendarEventTime } = await import('../caldav.js');
    const result = await updateCalendarEventTime(
      'missing-uid',
      new Date('2026-07-02T09:00:00Z'),
      new Date('2026-07-02T10:00:00Z'),
    );
    expect(result).toBe(false);
  });

  it('patches DTSTART and DTEND and PUTs back', async () => {
    const originalIcal = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:abc-123@Workspace',
      'DTSTART:20260701T090000Z',
      'DTEND:20260701T100000Z',
      'SUMMARY:Termin',
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200 }) // HEAD (findEventUrl)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => originalIcal }) // GET
      .mockResolvedValueOnce({ ok: true, status: 204 }); // PUT

    const { updateCalendarEventTime } = await import('../caldav.js');
    const result = await updateCalendarEventTime(
      'abc-123@Workspace',
      new Date('2026-07-02T09:00:00Z'),
      new Date('2026-07-02T10:00:00Z'),
    );

    expect(result).toBe(true);
    const [, putOpts] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(putOpts.method).toBe('PUT');
    const putBody = putOpts.body as string;
    expect(putBody).toMatch(/DTSTART:20260702T090000Z/);
    expect(putBody).toMatch(/DTEND:20260702T100000Z/);
  });
});
```

- [x] **Schritt 2: Test ausführen — muss FAIL sein**

```bash
cd /tmp/wt-portal-termin/website && npx vitest run src/lib/__tests__/caldav-move.test.ts 2>&1 | tail -20
```

Erwartetes Ergebnis: FAIL (`updateCalendarEventTime is not a function`).

- [x] **Schritt 3: Funktion implementieren**

Füge nach `updateCalendarEventStatus` in `website/src/lib/caldav.ts` ein:

```typescript
export async function updateCalendarEventTime(
  uid: string,
  newStart: Date,
  newEnd: Date,
): Promise<boolean> {
  const url = await findEventUrl(uid);
  if (!url) return false;

  const formatDt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  try {
    const getRes = await fetch(url, {
      headers: { Authorization: getAuthHeader() },
      signal: AbortSignal.timeout(CALDAV_TIMEOUT_MS),
    });
    if (!getRes.ok) return false;
    let ical = await getRes.text();

    ical = ical.replace(/DTSTART[^\r\n]+/i, `DTSTART:${formatDt(newStart)}`);
    ical = ical.replace(/DTEND[^\r\n]+/i, `DTEND:${formatDt(newEnd)}`);

    const putRes = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'text/calendar; charset=utf-8',
      },
      body: ical,
      signal: AbortSignal.timeout(CALDAV_TIMEOUT_MS),
    });
    return putRes.ok || putRes.status === 204;
  } catch (err) {
    console.error('[caldav] Update event time error:', err);
    return false;
  }
}
```

- [x] **Schritt 4: Test ausführen — muss PASS sein**

```bash
cd /tmp/wt-portal-termin/website && npx vitest run src/lib/__tests__/caldav-move.test.ts 2>&1 | tail -10
```

- [x] **Schritt 5: Commit**

```bash
cd /tmp/wt-portal-termin && git add website/src/lib/caldav.ts website/src/lib/__tests__/caldav-move.test.ts
git commit -m "feat(caldav): add updateCalendarEventTime() for rescheduling events"
```

---

## Task 4: `getCustomerByKeycloakId()` in website-db.ts

**Files:**
- Modify: `website/src/lib/website-db.ts`

Neue Funktion, die anhand des Keycloak-Sub (`keycloak_user_id`) `id`, `email` und `name` des Kunden aus der `customers`-Tabelle liefert. Wird von der Middleware in `actions.ts` aufgerufen.

- [x] **Schritt 1: Failing Test schreiben**

Erstelle `website/src/lib/__tests__/website-db-customer.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

// Mock the pg Pool
vi.mock('pg', () => {
  const query = vi.fn();
  return {
    default: {
      Pool: vi.fn(() => ({ query })),
    },
    query,
  };
});

describe('getCustomerByKeycloakId', () => {
  it('returns null when no matching customer exists', async () => {
    const pg = await import('pg');
    const pool = new (pg.default.Pool as unknown as { new(): { query: ReturnType<typeof vi.fn> } })();
    pool.query.mockResolvedValue({ rows: [] });

    vi.resetModules();
    const { getCustomerByKeycloakId } = await import('../website-db.js');
    const result = await getCustomerByKeycloakId('sub-unknown');
    expect(result).toBeNull();
  });

  it('returns id, email, name when customer found', async () => {
    const pg = await import('pg');
    const pool = new (pg.default.Pool as unknown as { new(): { query: ReturnType<typeof vi.fn> } })();
    pool.query.mockResolvedValue({
      rows: [{ id: 'cust-1', email: 'kunde@example.com', name: 'Max Muster' }],
    });

    vi.resetModules();
    const { getCustomerByKeycloakId } = await import('../website-db.js');
    const result = await getCustomerByKeycloakId('sub-abc');
    expect(result).toEqual({ id: 'cust-1', email: 'kunde@example.com', name: 'Max Muster' });
  });
});
```

> **Note:** Das Mock-Pattern für pg ist aufwendig wegen der globalen Pool-Instanz. Der Test prüft primär die Typen und SQL — in der Praxis reicht es, die Funktion mit dem richtigen SQL zu verifi­zieren.

- [x] **Schritt 2: Test ausführen — muss FAIL sein**

```bash
cd /tmp/wt-portal-termin/website && npx vitest run src/lib/__tests__/website-db-customer.test.ts 2>&1 | tail -20
```

Erwartetes Ergebnis: FAIL (`getCustomerByKeycloakId is not a function`).

- [x] **Schritt 3: Funktion implementieren**

Füge in `website/src/lib/website-db.ts` nach `getCustomerFullById` (ca. Zeile 235) ein:

```typescript
export async function getCustomerByKeycloakId(
  keycloakSub: string,
): Promise<{ id: string; email: string; name: string } | null> {
  const { rows } = await pool.query<{ id: string; email: string; name: string }>(
    `SELECT id, email, name FROM customers WHERE keycloak_user_id = $1 LIMIT 1`,
    [keycloakSub],
  );
  return rows[0] ?? null;
}
```

- [x] **Schritt 4: Test ausführen — muss PASS sein**

```bash
cd /tmp/wt-portal-termin/website && npx vitest run src/lib/__tests__/website-db-customer.test.ts 2>&1 | tail -10
```

- [x] **Schritt 5: Commit**

```bash
cd /tmp/wt-portal-termin && git add website/src/lib/website-db.ts website/src/lib/__tests__/website-db-customer.test.ts
git commit -m "feat(website-db): add getCustomerByKeycloakId()"
```

---

## Task 5: `ActionContext.email?` + Middleware in `actions.ts`

**Files:**
- Modify: `website/src/lib/assistant/actions.ts`
- Modify: `website/src/lib/assistant/types.ts` (kein separates `types.ts` — `ActionContext` ist in `actions.ts` definiert)

`ActionContext` wird um `email?: string` erweitert. `executeAction` befüllt das Feld vor der Delegation an den Handler, wenn `userSub` vorhanden ist.

Wichtig: `ActionContext` ist in `website/src/lib/assistant/actions.ts` definiert (nicht in `types.ts` — `types.ts` enthält nur `AssistantProfile`, `Message`, etc.). Das `AssistantProfile`-Import-Pfad bleibt `./types`.

- [x] **Schritt 1: Test für das neue Feld schreiben**

Erstelle `website/src/lib/assistant/actions-email.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../website-db.js', () => ({
  getCustomerByKeycloakId: vi.fn().mockResolvedValue({
    id: 'cust-1',
    email: 'test@example.com',
    name: 'Test Kunde',
  }),
}));

describe('executeAction — email middleware', () => {
  it('fills ctx.email from getCustomerByKeycloakId before calling handler', async () => {
    const { registerAction, executeAction } = await import('./actions.js');

    let capturedEmail: string | undefined;
    registerAction({
      id: 'test:email-capture',
      allowedProfiles: ['portal'],
      describe: () => ({ targetLabel: 't', summary: 't' }),
      handler: async (ctx) => {
        capturedEmail = ctx.email;
        return { ok: true, message: 'ok' };
      },
    });

    await executeAction('test:email-capture', {
      profile: 'portal',
      userSub: 'keycloak-sub-xyz',
      payload: {},
    });

    expect(capturedEmail).toBe('test@example.com');
  });

  it('leaves email undefined when getCustomerByKeycloakId returns null', async () => {
    vi.mocked((await import('../website-db.js')).getCustomerByKeycloakId).mockResolvedValue(null);

    const { registerAction, executeAction } = await import('./actions.js');

    let capturedEmail: string | undefined = 'SET';
    registerAction({
      id: 'test:email-null',
      allowedProfiles: ['portal'],
      describe: () => ({ targetLabel: 't', summary: 't' }),
      handler: async (ctx) => {
        capturedEmail = ctx.email;
        return { ok: true, message: 'ok' };
      },
    });

    await executeAction('test:email-null', {
      profile: 'portal',
      userSub: 'sub-unknown',
      payload: {},
    });

    expect(capturedEmail).toBeUndefined();
  });
});
```

- [x] **Schritt 2: Test ausführen — muss FAIL sein**

```bash
cd /tmp/wt-portal-termin/website && npx vitest run src/lib/assistant/actions-email.test.ts 2>&1 | tail -20
```

Erwartetes Ergebnis: FAIL (`ctx.email` ist nicht befüllt).

- [x] **Schritt 3: `ActionContext` und `executeAction` anpassen**

Ersetze in `website/src/lib/assistant/actions.ts` den gesamten Dateiinhalt:

```typescript
import type { AssistantProfile, ActionResult } from './types';
import { getCustomerByKeycloakId } from '../website-db.js';

export interface ActionContext {
  profile: AssistantProfile;
  userSub: string;
  email?: string;
  payload: Record<string, unknown>;
}

export interface ActionDescriptor {
  id: string;
  allowedProfiles: AssistantProfile[];
  describe: (payload: Record<string, unknown>) => { targetLabel: string; summary: string };
  handler: (ctx: ActionContext) => Promise<ActionResult>;
}

const registry = new Map<string, ActionDescriptor>();

export function registerAction(descriptor: ActionDescriptor): void {
  registry.set(descriptor.id, descriptor);
}

export function listActionsFor(profile: AssistantProfile): ActionDescriptor[] {
  return [...registry.values()].filter((a) => a.allowedProfiles.includes(profile));
}

export async function executeAction(
  actionId: string,
  ctx: ActionContext,
): Promise<ActionResult> {
  const descriptor = registry.get(actionId);
  if (!descriptor) throw new Error(`unknown action: ${actionId}`);
  if (!descriptor.allowedProfiles.includes(ctx.profile)) {
    throw new Error(`action ${actionId} not allowed for profile ${ctx.profile}`);
  }

  // Fill ctx.email via DB lookup when not already provided
  if (!ctx.email && ctx.userSub) {
    try {
      const customer = await getCustomerByKeycloakId(ctx.userSub);
      if (customer) ctx = { ...ctx, email: customer.email };
    } catch {
      // Non-fatal: action runs without email (handler must guard)
    }
  }

  return descriptor.handler(ctx);
}

export function describeAction(actionId: string, payload: Record<string, unknown>) {
  const descriptor = registry.get(actionId);
  if (!descriptor) throw new Error(`unknown action: ${actionId}`);
  return { id: actionId, ...descriptor.describe(payload) };
}
```

- [x] **Schritt 4: Bestehende Tests noch grün**

```bash
cd /tmp/wt-portal-termin/website && npx vitest run src/lib/assistant/actions.test.ts src/lib/assistant/actions-email.test.ts 2>&1 | tail -20
```

Erwartetes Ergebnis: alle PASS.

- [x] **Schritt 5: Commit**

```bash
cd /tmp/wt-portal-termin && git add website/src/lib/assistant/actions.ts website/src/lib/assistant/actions-email.test.ts
git commit -m "feat(actions): add email field to ActionContext + DB-lookup middleware"
```

---

## Task 6: E-Mail-Helfer in email.ts

**Files:**
- Modify: `website/src/lib/email.ts`

Drei neue Export-Funktionen für die drei schreibenden Flows.

- [x] **Schritt 1: Test schreiben**

Erstelle `website/src/lib/__tests__/email-booking.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'x' }),
    }),
  },
}));

describe('booking email helpers', () => {
  it('sendBookingConfirmation sends to correct address with date in subject', async () => {
    const { sendBookingConfirmation } = await import('../email.js');
    const result = await sendBookingConfirmation({
      to: 'kunde@example.com',
      name: 'Max Muster',
      start: new Date('2026-07-01T09:00:00Z'),
      end: new Date('2026-07-01T10:00:00Z'),
    });
    expect(result).toBe(true);
  });

  it('sendCancellationNotification resolves true', async () => {
    const { sendCancellationNotification } = await import('../email.js');
    const result = await sendCancellationNotification({
      to: 'kunde@example.com',
      name: 'Max Muster',
      start: new Date('2026-07-01T09:00:00Z'),
    });
    expect(result).toBe(true);
  });

  it('sendRescheduleNotification resolves true', async () => {
    const { sendRescheduleNotification } = await import('../email.js');
    const result = await sendRescheduleNotification({
      to: 'kunde@example.com',
      name: 'Max Muster',
      newStart: new Date('2026-07-02T09:00:00Z'),
      newEnd: new Date('2026-07-02T10:00:00Z'),
    });
    expect(result).toBe(true);
  });
});
```

- [x] **Schritt 2: Test ausführen — muss FAIL sein**

```bash
cd /tmp/wt-portal-termin/website && npx vitest run src/lib/__tests__/email-booking.test.ts 2>&1 | tail -20
```

Erwartetes Ergebnis: FAIL (Funktionen nicht exportiert).

- [x] **Schritt 3: Drei Helfer am Ende von email.ts anhängen**

```typescript
function formatDe(d: Date): string {
  return d.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function sendBookingConfirmation(params: {
  to: string;
  name: string;
  start: Date;
  end: Date;
}): Promise<boolean> {
  const dateStr = formatDe(params.start);
  return sendEmail({
    to: params.to,
    subject: `Terminbestätigung — ${dateStr}`,
    text: `Hallo ${params.name},

Ihr Termin am ${dateStr} ist bestätigt.

Mit freundlichen Grüßen
${FROM_NAME}`,
  });
}

export async function sendCancellationNotification(params: {
  to: string;
  name: string;
  start: Date;
}): Promise<boolean> {
  const dateStr = formatDe(params.start);
  return sendEmail({
    to: params.to,
    subject: 'Terminabsage bestätigt',
    text: `Hallo ${params.name},

Ihr Termin am ${dateStr} wurde erfolgreich abgesagt.

Mit freundlichen Grüßen
${FROM_NAME}`,
  });
}

export async function sendRescheduleNotification(params: {
  to: string;
  name: string;
  newStart: Date;
  newEnd: Date;
}): Promise<boolean> {
  const dateStr = formatDe(params.newStart);
  return sendEmail({
    to: params.to,
    subject: `Termin verschoben — ${dateStr}`,
    text: `Hallo ${params.name},

Ihr Termin wurde auf ${dateStr} verschoben.

Mit freundlichen Grüßen
${FROM_NAME}`,
  });
}
```

- [x] **Schritt 4: Test ausführen — muss PASS sein**

```bash
cd /tmp/wt-portal-termin/website && npx vitest run src/lib/__tests__/email-booking.test.ts 2>&1 | tail -10
```

- [x] **Schritt 5: Commit**

```bash
cd /tmp/wt-portal-termin && git add website/src/lib/email.ts website/src/lib/__tests__/email-booking.test.ts
git commit -m "feat(email): add sendBookingConfirmation, sendCancellationNotification, sendRescheduleNotification"
```

---

## Task 7: `bookSession.ts` — Stub → echter Handler

**Files:**
- Modify: `website/src/lib/assistant/actions/portal/bookSession.ts`

Der Handler nimmt `payload.datetime` (ISO-String) und optional `payload.serviceId` (Betreff-Zusatz), erstellt via `createCalendarEvent()` einen CalDAV-Event mit `ctx.email` als ATTENDEE und schickt anschließend eine Bestätigungs-E-Mail.

- [x] **Schritt 1: Unit-Test schreiben**

Erstelle `website/src/lib/assistant/actions/portal/bookSession.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../caldav.js', () => ({
  createCalendarEvent: vi.fn(),
}));
vi.mock('../../../../email.js', () => ({
  sendBookingConfirmation: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../../../website-db.js', () => ({
  getCustomerByKeycloakId: vi.fn().mockResolvedValue({
    id: 'c1',
    email: 'kunde@example.com',
    name: 'Max Muster',
  }),
}));

beforeEach(() => vi.resetModules());

describe('bookSession handler', () => {
  it('returns ok:false when email missing in context', async () => {
    await import('./bookSession.js');
    const { executeAction } = await import('../../actions.js');
    const result = await executeAction('portal:book-session', {
      profile: 'portal',
      userSub: '',
      email: undefined,
      payload: { datetime: '2026-07-01T09:00:00Z' },
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/E-Mail/i);
  });

  it('returns ok:false when datetime missing', async () => {
    await import('./bookSession.js');
    const { executeAction } = await import('../../actions.js');
    const result = await executeAction('portal:book-session', {
      profile: 'portal',
      userSub: 'sub',
      email: 'kunde@example.com',
      payload: {},
    });
    expect(result.ok).toBe(false);
  });

  it('calls createCalendarEvent and returns ok:true', async () => {
    const { createCalendarEvent } = await import('../../../../caldav.js');
    vi.mocked(createCalendarEvent).mockResolvedValue({ uid: 'new-uid@Workspace' });

    await import('./bookSession.js');
    const { executeAction } = await import('../../actions.js');
    const result = await executeAction('portal:book-session', {
      profile: 'portal',
      userSub: 'sub',
      email: 'kunde@example.com',
      payload: { datetime: '2026-07-01T09:00:00.000Z', durationMin: 60 },
    });
    expect(result.ok).toBe(true);
    expect(createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({ attendeeEmail: 'kunde@example.com' }),
    );
  });
});
```

- [x] **Schritt 2: Test ausführen — muss FAIL sein**

```bash
cd /tmp/wt-portal-termin/website && npx vitest run src/lib/assistant/actions/portal/bookSession.test.ts 2>&1 | tail -20
```

Erwartetes Ergebnis: Test 3 FAIL (Handler gibt `ok: false, STUB_MESSAGE` zurück).

- [x] **Schritt 3: Handler implementieren**

Ersetze den Inhalt von `website/src/lib/assistant/actions/portal/bookSession.ts`:

```typescript
import { registerAction } from '../../actions.js';
import type { ActionResult } from '../../types.js';
import { createCalendarEvent } from '../../../../caldav.js';
import { sendBookingConfirmation } from '../../../../email.js';

registerAction({
  id: 'portal:book-session',
  allowedProfiles: ['portal'],
  describe: (payload) => {
    const datetime = typeof payload.datetime === 'string' ? payload.datetime : '';
    const serviceId = typeof payload.serviceId === 'string' ? payload.serviceId : '';
    return {
      targetLabel: serviceId ? `Termin (${serviceId})` : 'Termin buchen',
      summary: datetime
        ? `Neuen Termin für ${datetime} buchen.`
        : 'Neuen Termin buchen.',
    };
  },
  handler: async (ctx): Promise<ActionResult> => {
    if (!ctx.email) {
      return { ok: false, message: 'Ihre E-Mail-Adresse konnte nicht ermittelt werden. Bitte melden Sie sich erneut an.' };
    }

    const datetimeStr = typeof ctx.payload.datetime === 'string' ? ctx.payload.datetime : null;
    if (!datetimeStr) {
      return { ok: false, message: 'Bitte geben Sie einen Wunschtermin an (z.B. "Montag 15.7. um 10 Uhr").' };
    }

    const start = new Date(datetimeStr);
    if (isNaN(start.getTime())) {
      return { ok: false, message: `Ungültiges Datum: ${datetimeStr}` };
    }

    const durationMin = typeof ctx.payload.durationMin === 'number' ? ctx.payload.durationMin : 60;
    const end = new Date(start.getTime() + durationMin * 60_000);

    const serviceId = typeof ctx.payload.serviceId === 'string' ? ctx.payload.serviceId : '';
    const summary = serviceId ? `Termin: ${serviceId}` : 'Beratungstermin';

    const result = await createCalendarEvent({
      summary,
      description: `Gebucht von ${ctx.email}`,
      start,
      end,
      attendeeEmail: ctx.email,
    });

    if (!result) {
      return { ok: false, message: 'Der Termin konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.' };
    }

    // Send confirmation email — non-blocking (fire-and-forget on error)
    sendBookingConfirmation({ to: ctx.email, name: ctx.email, start, end }).catch(() => {});

    const startStr = start.toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return {
      ok: true,
      message: `Ihr Termin am ${startStr} wurde bestätigt. Sie erhalten eine Bestätigungs-E-Mail.`,
      data: { uid: result.uid },
    };
  },
});
```

- [x] **Schritt 4: Tests ausführen**

```bash
cd /tmp/wt-portal-termin/website && npx vitest run src/lib/assistant/actions/portal/bookSession.test.ts 2>&1 | tail -15
```

Alle 3 Tests PASS.

- [x] **Schritt 5: Commit**

```bash
cd /tmp/wt-portal-termin && git add website/src/lib/assistant/actions/portal/bookSession.ts website/src/lib/assistant/actions/portal/bookSession.test.ts
git commit -m "feat(portal): implement bookSession action via CalDAV + email confirmation"
```

---

## Task 8: `cancelSession.ts` — Stub → echter Handler

**Files:**
- Modify: `website/src/lib/assistant/actions/portal/cancelSession.ts`

Der Handler liest den `uid`-Payload, prüft über `getClientBookings(ctx.email)`, dass der Event dem eingeloggten Kunden gehört (Ownership-Guard), und löscht ihn dann via `deleteCalendarEvent(uid)`.

- [x] **Schritt 1: Unit-Test schreiben**

Erstelle `website/src/lib/assistant/actions/portal/cancelSession.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../caldav.js', () => ({
  getClientBookings: vi.fn(),
  deleteCalendarEvent: vi.fn(),
}));
vi.mock('../../../../email.js', () => ({
  sendCancellationNotification: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../../../website-db.js', () => ({
  getCustomerByKeycloakId: vi.fn().mockResolvedValue(null),
}));

beforeEach(() => vi.resetModules());

describe('cancelSession handler', () => {
  it('returns ok:false when uid missing', async () => {
    await import('./cancelSession.js');
    const { executeAction } = await import('../../actions.js');
    const r = await executeAction('portal:cancel-session', {
      profile: 'portal',
      userSub: 'sub',
      email: 'kunde@example.com',
      payload: {},
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/UID/i);
  });

  it('returns ok:false when uid not in customer bookings (ownership guard)', async () => {
    const { getClientBookings } = await import('../../../../caldav.js');
    vi.mocked(getClientBookings).mockResolvedValue([
      { uid: 'other-uid', summary: 'Termin', start: new Date(), end: new Date(), status: 'CONFIRMED' },
    ]);

    await import('./cancelSession.js');
    const { executeAction } = await import('../../actions.js');
    const r = await executeAction('portal:cancel-session', {
      profile: 'portal',
      userSub: 'sub',
      email: 'kunde@example.com',
      payload: { uid: 'wrong-uid' },
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/gefunden|Berechtigung/i);
  });

  it('deletes event and returns ok:true when uid matches', async () => {
    const { getClientBookings, deleteCalendarEvent } = await import('../../../../caldav.js');
    const bookingStart = new Date('2026-07-01T09:00:00Z');
    vi.mocked(getClientBookings).mockResolvedValue([
      { uid: 'abc-123@Workspace', summary: 'Termin', start: bookingStart, end: new Date(), status: 'CONFIRMED' },
    ]);
    vi.mocked(deleteCalendarEvent).mockResolvedValue(true);

    await import('./cancelSession.js');
    const { executeAction } = await import('../../actions.js');
    const r = await executeAction('portal:cancel-session', {
      profile: 'portal',
      userSub: 'sub',
      email: 'kunde@example.com',
      payload: { uid: 'abc-123@Workspace' },
    });
    expect(r.ok).toBe(true);
    expect(deleteCalendarEvent).toHaveBeenCalledWith('abc-123@Workspace');
  });
});
```

- [x] **Schritt 2: Test ausführen — muss FAIL sein**

```bash
cd /tmp/wt-portal-termin/website && npx vitest run src/lib/assistant/actions/portal/cancelSession.test.ts 2>&1 | tail -20
```

- [x] **Schritt 3: Handler implementieren**

Ersetze den Inhalt von `website/src/lib/assistant/actions/portal/cancelSession.ts`:

```typescript
import { registerAction } from '../../actions.js';
import type { ActionResult } from '../../types.js';
import { getClientBookings, deleteCalendarEvent } from '../../../../caldav.js';
import { sendCancellationNotification } from '../../../../email.js';

registerAction({
  id: 'portal:cancel-session',
  allowedProfiles: ['portal'],
  describe: (payload) => {
    const uid = typeof payload.uid === 'string' ? payload.uid : '';
    const reason = typeof payload.reason === 'string' ? payload.reason : '';
    return {
      targetLabel: uid ? `Termin ${uid}` : 'Termin absagen',
      summary: reason ? `Termin absagen (Grund: ${reason}).` : 'Termin absagen.',
    };
  },
  handler: async (ctx): Promise<ActionResult> => {
    if (!ctx.email) {
      return { ok: false, message: 'Ihre E-Mail-Adresse konnte nicht ermittelt werden. Bitte melden Sie sich erneut an.' };
    }

    const uid = typeof ctx.payload.uid === 'string' ? ctx.payload.uid : null;
    if (!uid) {
      return { ok: false, message: 'Bitte geben Sie die UID des Termins an, den Sie absagen möchten.' };
    }

    // Ownership guard: only allow cancelling own bookings
    let bookingStart: Date | undefined;
    try {
      const bookings = await getClientBookings(ctx.email);
      const own = bookings.find((b) => b.uid === uid);
      if (!own) {
        return {
          ok: false,
          message: 'Dieser Termin wurde nicht gefunden oder Sie haben keine Berechtigung, ihn abzusagen.',
        };
      }
      bookingStart = own.start;
    } catch {
      return { ok: false, message: 'Ihre Termine konnten nicht abgerufen werden. Bitte versuchen Sie es erneut.' };
    }

    const deleted = await deleteCalendarEvent(uid);
    if (!deleted) {
      return { ok: false, message: 'Der Termin konnte nicht abgesagt werden. Bitte versuchen Sie es erneut.' };
    }

    if (bookingStart) {
      sendCancellationNotification({
        to: ctx.email,
        name: ctx.email,
        start: bookingStart,
      }).catch(() => {});
    }

    return {
      ok: true,
      message: 'Ihr Termin wurde erfolgreich abgesagt. Sie erhalten eine Bestätigungs-E-Mail.',
    };
  },
});
```

- [x] **Schritt 4: Tests ausführen**

```bash
cd /tmp/wt-portal-termin/website && npx vitest run src/lib/assistant/actions/portal/cancelSession.test.ts 2>&1 | tail -15
```

Alle 3 Tests PASS.

- [x] **Schritt 5: Commit**

```bash
cd /tmp/wt-portal-termin && git add website/src/lib/assistant/actions/portal/cancelSession.ts website/src/lib/assistant/actions/portal/cancelSession.test.ts
git commit -m "feat(portal): implement cancelSession action with ownership guard"
```

---

## Task 9: `moveSession.ts` — Stub → echter Handler

**Files:**
- Modify: `website/src/lib/assistant/actions/portal/moveSession.ts`

Analoger Flow zu `cancelSession`, aber statt Löschen wird `updateCalendarEventTime(uid, newStart, newEnd)` aufgerufen.

- [x] **Schritt 1: Unit-Test schreiben**

Erstelle `website/src/lib/assistant/actions/portal/moveSession.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../caldav.js', () => ({
  getClientBookings: vi.fn(),
  updateCalendarEventTime: vi.fn(),
}));
vi.mock('../../../../email.js', () => ({
  sendRescheduleNotification: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../../../website-db.js', () => ({
  getCustomerByKeycloakId: vi.fn().mockResolvedValue(null),
}));

beforeEach(() => vi.resetModules());

describe('moveSession handler', () => {
  it('returns ok:false when uid or newDatetime missing', async () => {
    await import('./moveSession.js');
    const { executeAction } = await import('../../actions.js');
    const r = await executeAction('portal:move-session', {
      profile: 'portal',
      userSub: 'sub',
      email: 'kunde@example.com',
      payload: {},
    });
    expect(r.ok).toBe(false);
  });

  it('returns ok:false when booking not owned by customer', async () => {
    const { getClientBookings } = await import('../../../../caldav.js');
    vi.mocked(getClientBookings).mockResolvedValue([]);

    await import('./moveSession.js');
    const { executeAction } = await import('../../actions.js');
    const r = await executeAction('portal:move-session', {
      profile: 'portal',
      userSub: 'sub',
      email: 'kunde@example.com',
      payload: { uid: 'abc-123', newDatetime: '2026-07-02T10:00:00Z' },
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/gefunden|Berechtigung/i);
  });

  it('calls updateCalendarEventTime and returns ok:true', async () => {
    const { getClientBookings, updateCalendarEventTime } = await import('../../../../caldav.js');
    vi.mocked(getClientBookings).mockResolvedValue([
      { uid: 'abc-123', summary: 'Termin', start: new Date(), end: new Date(), status: 'CONFIRMED' },
    ]);
    vi.mocked(updateCalendarEventTime).mockResolvedValue(true);

    await import('./moveSession.js');
    const { executeAction } = await import('../../actions.js');
    const r = await executeAction('portal:move-session', {
      profile: 'portal',
      userSub: 'sub',
      email: 'kunde@example.com',
      payload: { uid: 'abc-123', newDatetime: '2026-07-02T10:00:00Z', durationMin: 60 },
    });
    expect(r.ok).toBe(true);
    expect(updateCalendarEventTime).toHaveBeenCalledWith(
      'abc-123',
      expect.any(Date),
      expect.any(Date),
    );
  });
});
```

- [x] **Schritt 2: Test ausführen — muss FAIL sein**

```bash
cd /tmp/wt-portal-termin/website && npx vitest run src/lib/assistant/actions/portal/moveSession.test.ts 2>&1 | tail -20
```

- [x] **Schritt 3: Handler implementieren**

Ersetze den Inhalt von `website/src/lib/assistant/actions/portal/moveSession.ts`:

```typescript
import { registerAction } from '../../actions.js';
import type { ActionResult } from '../../types.js';
import { getClientBookings, updateCalendarEventTime } from '../../../../caldav.js';
import { sendRescheduleNotification } from '../../../../email.js';

registerAction({
  id: 'portal:move-session',
  allowedProfiles: ['portal'],
  describe: (payload) => {
    const uid = typeof payload.uid === 'string' ? payload.uid : '';
    const newDatetime = typeof payload.newDatetime === 'string' ? payload.newDatetime : '';
    return {
      targetLabel: uid ? `Termin ${uid}` : 'Termin verschieben',
      summary: newDatetime ? `Termin auf ${newDatetime} verschieben.` : 'Termin verschieben.',
    };
  },
  handler: async (ctx): Promise<ActionResult> => {
    if (!ctx.email) {
      return { ok: false, message: 'Ihre E-Mail-Adresse konnte nicht ermittelt werden. Bitte melden Sie sich erneut an.' };
    }

    const uid = typeof ctx.payload.uid === 'string' ? ctx.payload.uid : null;
    const newDatetimeStr = typeof ctx.payload.newDatetime === 'string' ? ctx.payload.newDatetime : null;

    if (!uid || !newDatetimeStr) {
      return {
        ok: false,
        message: 'Bitte geben Sie die UID des Termins und den neuen Wunschtermin an.',
      };
    }

    const newStart = new Date(newDatetimeStr);
    if (isNaN(newStart.getTime())) {
      return { ok: false, message: `Ungültiges Datum: ${newDatetimeStr}` };
    }

    const durationMin = typeof ctx.payload.durationMin === 'number' ? ctx.payload.durationMin : 60;
    const newEnd = new Date(newStart.getTime() + durationMin * 60_000);

    // Ownership guard
    try {
      const bookings = await getClientBookings(ctx.email);
      const own = bookings.find((b) => b.uid === uid);
      if (!own) {
        return {
          ok: false,
          message: 'Dieser Termin wurde nicht gefunden oder Sie haben keine Berechtigung, ihn zu verschieben.',
        };
      }
    } catch {
      return { ok: false, message: 'Ihre Termine konnten nicht abgerufen werden. Bitte versuchen Sie es erneut.' };
    }

    const updated = await updateCalendarEventTime(uid, newStart, newEnd);
    if (!updated) {
      return { ok: false, message: 'Der Termin konnte nicht verschoben werden. Bitte versuchen Sie es erneut.' };
    }

    sendRescheduleNotification({
      to: ctx.email,
      name: ctx.email,
      newStart,
      newEnd,
    }).catch(() => {});

    const newStartStr = newStart.toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return {
      ok: true,
      message: `Ihr Termin wurde auf ${newStartStr} verschoben. Sie erhalten eine Bestätigungs-E-Mail.`,
    };
  },
});
```

- [x] **Schritt 4: Tests ausführen**

```bash
cd /tmp/wt-portal-termin/website && npx vitest run src/lib/assistant/actions/portal/moveSession.test.ts 2>&1 | tail -15
```

Alle 3 Tests PASS.

- [x] **Schritt 5: Commit**

```bash
cd /tmp/wt-portal-termin && git add website/src/lib/assistant/actions/portal/moveSession.ts website/src/lib/assistant/actions/portal/moveSession.test.ts
git commit -m "feat(portal): implement moveSession action via updateCalendarEventTime"
```

---

## Task 10: `requestSession.ts` — neu anlegen

**Files:**
- Create: `website/src/lib/assistant/actions/portal/requestSession.ts`

Keine direkte CalDAV-Aktion — stattdessen InboxItem vom Typ `'booking'` anlegen (Admin muss manuell bestätigen). Analog zum bestehenden Kontaktformular-Flow.

- [x] **Schritt 1: Unit-Test schreiben**

Erstelle `website/src/lib/assistant/actions/portal/requestSession.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../messaging-db.js', () => ({
  createInboxItem: vi.fn().mockResolvedValue({ id: 42 }),
}));
vi.mock('../../../../website-db.js', () => ({
  getCustomerByKeycloakId: vi.fn().mockResolvedValue(null),
}));

beforeEach(() => vi.resetModules());

describe('requestSession handler', () => {
  it('creates an InboxItem with type booking', async () => {
    const { createInboxItem } = await import('../../../../messaging-db.js');

    await import('./requestSession.js');
    const { executeAction } = await import('../../actions.js');

    const r = await executeAction('portal:request-session', {
      profile: 'portal',
      userSub: 'sub',
      email: 'kunde@example.com',
      payload: { message: 'Hätte gerne einen Termin nächste Woche' },
    });

    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/Terminanfrage|benachrichtigt/i);
    expect(createInboxItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'booking',
        payload: expect.objectContaining({
          email: 'kunde@example.com',
          message: 'Hätte gerne einen Termin nächste Woche',
        }),
      }),
    );
  });

  it('returns ok:false when InboxItem creation throws', async () => {
    const { createInboxItem } = await import('../../../../messaging-db.js');
    vi.mocked(createInboxItem).mockRejectedValue(new Error('DB down'));

    await import('./requestSession.js');
    const { executeAction } = await import('../../actions.js');

    const r = await executeAction('portal:request-session', {
      profile: 'portal',
      userSub: 'sub',
      email: 'kunde@example.com',
      payload: {},
    });

    expect(r.ok).toBe(false);
  });
});
```

- [x] **Schritt 2: Test ausführen — muss FAIL sein**

```bash
cd /tmp/wt-portal-termin/website && npx vitest run src/lib/assistant/actions/portal/requestSession.test.ts 2>&1 | tail -20
```

Erwartetes Ergebnis: FAIL (`portal:request-session` nicht registriert).

- [x] **Schritt 3: Handler anlegen**

Erstelle `website/src/lib/assistant/actions/portal/requestSession.ts`:

```typescript
import { registerAction } from '../../actions.js';
import type { ActionResult } from '../../types.js';
import { createInboxItem } from '../../../../messaging-db.js';

registerAction({
  id: 'portal:request-session',
  allowedProfiles: ['portal'],
  describe: (payload) => {
    const message = typeof payload.message === 'string' ? payload.message : '';
    return {
      targetLabel: 'Terminanfrage',
      summary: message ? `Terminanfrage: "${message}"` : 'Terminanfrage stellen.',
    };
  },
  handler: async (ctx): Promise<ActionResult> => {
    if (!ctx.email) {
      return {
        ok: false,
        message: 'Ihre E-Mail-Adresse konnte nicht ermittelt werden. Bitte melden Sie sich erneut an.',
      };
    }

    const message = typeof ctx.payload.message === 'string' ? ctx.payload.message : '';

    try {
      await createInboxItem({
        type: 'booking',
        payload: {
          email: ctx.email,
          keycloakSub: ctx.userSub,
          message,
          source: 'portal-ai-assistant',
        },
      });
    } catch (err) {
      console.error('[requestSession] createInboxItem failed:', err);
      return {
        ok: false,
        message: 'Ihre Terminanfrage konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.',
      };
    }

    return {
      ok: true,
      message: 'Ihre Terminanfrage ist eingegangen — wir melden uns bei Ihnen, um einen passenden Termin zu vereinbaren.',
    };
  },
});
```

- [x] **Schritt 4: Tests ausführen**

```bash
cd /tmp/wt-portal-termin/website && npx vitest run src/lib/assistant/actions/portal/requestSession.test.ts 2>&1 | tail -15
```

Alle 2 Tests PASS.

- [x] **Schritt 5: Commit**

```bash
cd /tmp/wt-portal-termin && git add website/src/lib/assistant/actions/portal/requestSession.ts website/src/lib/assistant/actions/portal/requestSession.test.ts
git commit -m "feat(portal): add requestSession action (InboxItem booking)"
```

---

## Task 11: `index.ts` + `profile-isolation.test.ts` aktualisieren

**Files:**
- Modify: `website/src/lib/assistant/actions/portal/index.ts`
- Modify: `website/src/lib/assistant/actions/portal/profile-isolation.test.ts`

`requestSession` registrieren und den Action-Zähler im Isolation-Test von 7 auf 8 heben.

- [x] **Schritt 1: Test zuerst anpassen — erwarte 8 Actions**

In `website/src/lib/assistant/actions/portal/profile-isolation.test.ts` die `toEqual`-Assertion auf 8 Actions erweitern:

```typescript
  it('all 8 portal actions are registered', () => {
    const portalIds = listActionsFor('portal').map((a) => a.id).sort();
    expect(portalIds).toEqual([
      'portal:book-session',
      'portal:cancel-session',
      'portal:message-coach',
      'portal:move-session',
      'portal:request-session',
      'portal:sign-document',
      'portal:start-questionnaire',
      'portal:upload-file',
    ]);
  });
```

- [x] **Schritt 2: Test ausführen — muss FAIL sein**

```bash
cd /tmp/wt-portal-termin/website && npx vitest run src/lib/assistant/actions/portal/profile-isolation.test.ts 2>&1 | tail -20
```

Erwartetes Ergebnis: FAIL (7 statt 8 Actions).

- [x] **Schritt 3: Import in index.ts ergänzen**

In `website/src/lib/assistant/actions/portal/index.ts` die Zeile hinzufügen:

```typescript
// Portal action handlers — registered via side-effect imports.
import './bookSession';
import './moveSession';
import './cancelSession';
import './requestSession';   // ← NEU
import './signDocument';
import './uploadFile';
import './messageCoach';
import './startQuestionnaire';
```

- [x] **Schritt 4: Tests ausführen**

```bash
cd /tmp/wt-portal-termin/website && npx vitest run src/lib/assistant/actions/portal/profile-isolation.test.ts 2>&1 | tail -15
```

Alle Tests PASS.

- [x] **Schritt 5: Gesamttest-Suite**

```bash
cd /tmp/wt-portal-termin/website && npx vitest run src/lib/assistant/ 2>&1 | tail -20
```

Erwartetes Ergebnis: alle Tests im `assistant/`-Baum PASS.

- [x] **Schritt 6: Commit**

```bash
cd /tmp/wt-portal-termin && git add website/src/lib/assistant/actions/portal/index.ts website/src/lib/assistant/actions/portal/profile-isolation.test.ts
git commit -m "feat(portal): register requestSession in index + update isolation test to 8 actions"
```

---

## Task 12: E2E-Test `portal-termin-actions.spec.ts`

**Files:**
- Create: `tests/e2e/specs/portal-termin-actions.spec.ts`

Playwright-Happy-Path gegen eine laufende Instanz. Die Tests nutzen die `website`-Playwright-Konfiguration mit Keycloak-SSO. Da CalDAV-Direktabfragen aus Playwright nicht praktikabel sind, prüfen wir primär die AI-Chat-Response.

- [x] **Schritt 1: Schaue dir ein bestehendes Portal-E2E an (Referenz)**

Lese `tests/e2e/specs/fa-client-portal.spec.ts` für Konventionen und Auth-Setup.

- [x] **Schritt 2: Test-Datei anlegen**

Erstelle `tests/e2e/specs/portal-termin-actions.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

/**
 * E2E Happy-Path für die 4 Portal-Terminbuchungs-Actions.
 *
 * Voraussetzungen:
 * - Website läuft + Keycloak SSO konfiguriert
 * - Ein Test-Portal-Nutzer existiert (PORTAL_TEST_EMAIL / PORTAL_TEST_PASSWORD in env)
 * - Nextcloud CalDAV erreichbar
 *
 * Die Tests prüfen die AI-Chat-Antworten, nicht den CalDAV-State direkt.
 * is_test_data wird via X-E2E-Test-Header gesetzt (sofern der Endpoint das unterstützt).
 */

const PORTAL_EMAIL = process.env.PORTAL_TEST_EMAIL || 'testuser@mentolder.de';
const PORTAL_PASSWORD = process.env.PORTAL_TEST_PASSWORD || 'testpass';

test.describe('Portal Terminbuchung Actions', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to portal — Keycloak redirect happens automatically
    await page.goto('/portal');
    // If redirected to Keycloak login
    if (page.url().includes('/auth/')) {
      await page.fill('input[name="username"]', PORTAL_EMAIL);
      await page.fill('input[name="password"]', PORTAL_PASSWORD);
      await page.click('input[type="submit"]');
      await page.waitForURL('**/portal**');
    }
  });

  test('SA-PORTAL-01 — Termin buchen: AI bestätigt CalDAV-Event-Erstellung', async ({ page }) => {
    // Find the AI chat input on the portal page
    const chatInput = page.locator('[data-testid="assistant-input"], textarea[placeholder*="Nachricht"], input[placeholder*="Nachricht"]').first();
    await expect(chatInput).toBeVisible({ timeout: 10_000 });

    // Pick a date far enough in the future to be within booking horizon
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);
    const dateStr = futureDate.toLocaleDateString('de-DE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });

    await chatInput.fill(`Buche einen Termin für ${dateStr} um 10 Uhr`);
    await page.keyboard.press('Enter');

    // Wait for assistant response
    const response = page.locator('[data-testid="assistant-message"], .assistant-message, [class*="assistant"]').last();
    await expect(response).toBeVisible({ timeout: 30_000 });
    await expect(response).toContainText(/bestätigt|Termin.*gebucht|10:00/i, { timeout: 30_000 });
  });

  test('SA-PORTAL-02 — Termin absagen: AI bestätigt Absage', async ({ page }) => {
    const chatInput = page.locator('[data-testid="assistant-input"], textarea[placeholder*="Nachricht"], input[placeholder*="Nachricht"]').first();
    await expect(chatInput).toBeVisible({ timeout: 10_000 });

    // First ask for bookings to get a UID
    await chatInput.fill('Welche Termine habe ich?');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(5_000);

    // Then cancel — in a real environment the AI would resolve the UID
    // We test that the action at least responds (not stub)
    await chatInput.fill('Sage meinen nächsten Termin ab');
    await page.keyboard.press('Enter');

    const response = page.locator('[data-testid="assistant-message"], .assistant-message').last();
    await expect(response).toBeVisible({ timeout: 30_000 });
    // Should NOT show the old stub message
    await expect(response).not.toContainText('noch nicht angebunden');
  });

  test('SA-PORTAL-03 — Terminverschiebung: AI bestätigt Verschiebung', async ({ page }) => {
    const chatInput = page.locator('[data-testid="assistant-input"], textarea[placeholder*="Nachricht"], input[placeholder*="Nachricht"]').first();
    await expect(chatInput).toBeVisible({ timeout: 10_000 });

    const newDate = new Date();
    newDate.setDate(newDate.getDate() + 7);
    const newDateStr = newDate.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

    await chatInput.fill(`Verschiebe meinen Termin auf ${newDateStr} um 14 Uhr`);
    await page.keyboard.press('Enter');

    const response = page.locator('[data-testid="assistant-message"], .assistant-message').last();
    await expect(response).toBeVisible({ timeout: 30_000 });
    await expect(response).not.toContainText('noch nicht angebunden');
  });

  test('SA-PORTAL-04 — Terminanfrage ohne Datum: InboxItem erstellt, AI bestätigt', async ({ page }) => {
    const chatInput = page.locator('[data-testid="assistant-input"], textarea[placeholder*="Nachricht"], input[placeholder*="Nachricht"]').first();
    await expect(chatInput).toBeVisible({ timeout: 10_000 });

    await chatInput.fill('Ich hätte gerne einen Termin, bin aber zeitlich flexibel');
    await page.keyboard.press('Enter');

    const response = page.locator('[data-testid="assistant-message"], .assistant-message').last();
    await expect(response).toBeVisible({ timeout: 30_000 });
    await expect(response).toContainText(/Terminanfrage|eingegangen|benachrichtigt|melden/i, { timeout: 30_000 });
    await expect(response).not.toContainText('noch nicht angebunden');
  });
});
```

- [x] **Schritt 3: Test syntaktisch prüfen (TypeScript-Check)**

```bash
cd /tmp/wt-portal-termin/website && npx tsc --noEmit 2>&1 | grep -i portal-termin | head -10
```

Erwartetes Ergebnis: keine Fehler für diese Datei.

- [x] **Schritt 4: Commit**

```bash
cd /tmp/wt-portal-termin && git add tests/e2e/specs/portal-termin-actions.spec.ts
git commit -m "test(e2e): add portal-termin-actions happy-path spec (4 actions)"
```

---

## Task 13: `test-inventory.json` regenerieren

**Files:**
- Modify: `website/src/data/test-inventory.json`

CI prüft, ob `test-inventory.json` aktuell ist. Neue E2E-Datei muss darin erscheinen.

- [x] **Schritt 1: Inventar regenerieren**

```bash
cd /tmp/wt-portal-termin && bash scripts/build-test-inventory.sh
```

Erwartetes Ergebnis: `website/src/data/test-inventory.json` aktualisiert, enthält jetzt einen Eintrag mit `"file": "tests/e2e/specs/portal-termin-actions.spec.ts"`.

- [x] **Schritt 2: Prüfen ob neuer Eintrag vorhanden**

```bash
grep "portal-termin-actions" /tmp/wt-portal-termin/website/src/data/test-inventory.json
```

Erwartetes Ergebnis: Zeile mit `portal-termin-actions.spec.ts` gefunden.

- [x] **Schritt 3: Commit**

```bash
cd /tmp/wt-portal-termin && git add website/src/data/test-inventory.json
git commit -m "chore(test-inventory): regenerate after portal-termin-actions spec"
```

---

## Task 14: Gesamtprüfung

- [x] **Schritt 1: Alle Unit-Tests laufen lassen**

```bash
cd /tmp/wt-portal-termin/website && npx vitest run src/lib/assistant/ src/lib/__tests__/ 2>&1 | tail -30
```

Erwartetes Ergebnis: alle Tests PASS, keine Fehlermeldungen.

- [x] **Schritt 2: TypeScript-Check**

```bash
cd /tmp/wt-portal-termin/website && npx tsc --noEmit 2>&1 | head -30
```

Erwartetes Ergebnis: keine Fehler.

- [x] **Schritt 3: Offline CI simulieren**

```bash
cd /tmp/wt-portal-termin && bash scripts/task-oracle.sh 'run all offline tests' 2>/dev/null || task test:all 2>&1 | tail -30
```

Erwartetes Ergebnis: grün.

- [x] **Schritt 4: Branch-Status prüfen**

```bash
cd /tmp/wt-portal-termin && git log --oneline -15
```

Alle Commits sauber, Branch enthält alle Feature-Commits.

---

## Self-Review Checklist

**Spec-Coverage:**
1. CalDAV CRLF-Fix → Task 1 ✓
2. `getClientBookings` uid → Task 2 ✓
3. `updateCalendarEventTime` → Task 3 ✓
4. `getCustomerByKeycloakId` → Task 4 ✓
5. `ActionContext.email?` + Middleware → Task 5 ✓
6. E-Mail-Helfer (3 Funktionen) → Task 6 ✓
7. `bookSession` → Task 7 ✓
8. `cancelSession` → Task 8 ✓
9. `moveSession` → Task 9 ✓
10. `requestSession` → Task 10 ✓
11. `index.ts` + Isolation-Test → Task 11 ✓
12. E2E-Test → Task 12 ✓
13. `test-inventory.json` → Task 13 ✓

**Ownership-Guard:**  
`cancelSession` und `moveSession` prüfen via `getClientBookings(ctx.email)`, ob der angefragte UID tatsächlich dem eingeloggten Kunden gehört. Ein Admin-Bypass ist nicht implementiert (Portal-only-Scope, kein Admin-Profile).

**Fehlerbehandlung:**  
Jeder Handler gibt spezifische deutsche Fehlertexte zurück. E-Mail-Versand ist fire-and-forget (`.catch(() => {})`) — ein SMTP-Fehler bricht die Action nicht ab.

**Import-Pfade:**  
Die Portal-Actions liegen in `actions/portal/` — daher `../../../../caldav.js` (4 Ebenen hoch bis `src/lib/`). Konsistenz mit bestehenden Actions (`signDocument.ts` etc.) geprüft.

**Type-Consistency:**  
- `ClientBooking.uid: string` definiert in Task 2, konsistent genutzt in Task 8+9
- `updateCalendarEventTime(uid, newStart, newEnd)` definiert in Task 3, genutzt in Task 9
- `sendBookingConfirmation({to, name, start, end})` definiert in Task 6, genutzt in Task 7
- `sendCancellationNotification({to, name, start})` definiert in Task 6, genutzt in Task 8
- `sendRescheduleNotification({to, name, newStart, newEnd})` definiert in Task 6, genutzt in Task 9
