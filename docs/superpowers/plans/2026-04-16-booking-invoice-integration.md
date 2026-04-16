# Booking Invoice Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jeder bestätigte Termin erzeugt automatisch eine Invoice-Ninja-Rechnung (€0 für Erstgespräch/Rückruf, regulärer Preis für kostenpflichtige Services) und der Rechnungsstatus ist in der Admin-Terminübersicht sichtbar.

**Architecture:** `createCalendarEvent` gibt die CalDAV-UID zurück. Bei `approve_booking` wird immer eine Rechnung erstellt und das Mapping `caldav_uid → invoice` in der neuen `booking_invoices`-Tabelle gespeichert. `admin/termine.astro` lädt die Invoice-Daten per Batch-Query und zeigt sie pro Buchungskarte an.

**Tech Stack:** Astro (SSR), TypeScript, PostgreSQL (pg), Invoice Ninja v5 REST API, Nextcloud CalDAV

---

## File Map

| Datei | Änderung |
|---|---|
| `website/src/lib/caldav.ts` | `createCalendarEvent` gibt `{ uid: string } \| null` zurück statt `boolean` |
| `website/src/lib/invoiceninja.ts` | 4 €0-Einträge in `SERVICES` + `ServiceKey`-Typ erweitert |
| `website/src/lib/website-db.ts` | Neue Tabelle `booking_invoices` + `setBookingInvoice` + `getBookingInvoices` |
| `website/src/pages/api/mattermost/actions.ts` | `approve_booking`: UID verwenden, Fallback-ServiceKey, Invoice-Mapping speichern |
| `website/src/pages/admin/termine.astro` | Invoice-Badge pro Buchungskarte laden und rendern |

---

## Task 1: `caldav.ts` — UID aus `createCalendarEvent` zurückgeben

**Files:**
- Modify: `website/src/lib/caldav.ts`

**Kontext:** `createCalendarEvent` generiert intern eine UUID (`uid`), schreibt das CalDAV-Event als `{uid}@{BRAND_NAME}`, gibt aber nur `boolean` zurück. Das verhindert, dass Aufrufer die UID für Mappings nutzen können. Nach der Änderung gibt die Funktion `{ uid: string } | null` zurück.

- [ ] **Schritt 1: Rückgabetyp und Return-Statements anpassen**

In `website/src/lib/caldav.ts` die Funktion `createCalendarEvent` (ab Zeile 315) wie folgt ändern:

```ts
export async function createCalendarEvent(params: {
  summary: string;
  description: string;
  start: Date;
  end: Date;
  attendeeEmail?: string;
  attendeeName?: string;
}): Promise<{ uid: string } | null> {
  const uid = crypto.randomUUID();
  const formatDt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  let attendeeLine = '';
  if (params.attendeeEmail) {
    const cn = params.attendeeName || params.attendeeEmail;
    attendeeLine = `ATTENDEE;CN=${cn};RSVP=TRUE:mailto:${params.attendeeEmail}\n`;
  }

  const ical = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//${BRAND_NAME}//Booking//DE
BEGIN:VEVENT
UID:${uid}@${BRAND_NAME}
DTSTART:${formatDt(params.start)}
DTEND:${formatDt(params.end)}
SUMMARY:${params.summary}
DESCRIPTION:${params.description.replace(/\n/g, '\\n')}
${attendeeLine}STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

  try {
    const res = await fetch(`${CALDAV_BASE}/${uid}.ics`, {
      method: 'PUT',
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'text/calendar; charset=utf-8',
      },
      body: ical,
    });

    if (res.ok || res.status === 201) return { uid: `${uid}@${BRAND_NAME}` };
    console.error('[caldav] Create event failed:', res.status, await res.text());
    return null;
  } catch (err) {
    console.error('[caldav] Create event error:', err);
    return null;
  }
}
```

- [ ] **Schritt 2: TypeScript-Check ausführen**

```bash
cd /home/patrick/Bachelorprojekt/website && npx astro check 2>&1 | grep -E "error|Error" | head -20
```

Erwartetes Ergebnis: Fehler in `actions.ts` wegen des geänderten Rückgabetyps (dort wird noch `boolean` erwartet). Das ist korrekt — wird in Task 4 behoben.

- [ ] **Schritt 3: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/lib/caldav.ts
git commit -m "feat(caldav): return uid from createCalendarEvent"
```

---

## Task 2: `invoiceninja.ts` — €0-Services ergänzen

**Files:**
- Modify: `website/src/lib/invoiceninja.ts`

**Kontext:** `SERVICES` kennt nur kostenpflichtige Leistungen. Die vier Buchungstypen `erstgespraech`, `callback`, `meeting`, `termin` aus `booking.ts` fehlen. Ohne sie greift der Fallback in `actions.ts` nicht. Rate `0` erzeugt eine Nullrechnung in Invoice Ninja.

- [ ] **Schritt 1: Vier Einträge in `SERVICES` hinzufügen**

In `website/src/lib/invoiceninja.ts` das `SERVICES`-Objekt (ab Zeile 93) erweitern:

```ts
export const SERVICES = {
  'erstgespraech':         { name: 'Kostenloses Erstgespräch',                    rate: 0,    unit: 'Einheit' },
  'callback':              { name: 'Rückruf',                                     rate: 0,    unit: 'Einheit' },
  'meeting':               { name: 'Online-Meeting',                               rate: 0,    unit: 'Einheit' },
  'termin':                { name: 'Termin vor Ort',                               rate: 0,    unit: 'Einheit' },
  'digital-cafe-einzel':   { name: '50+ digital — Einzelbegleitung',              rate: 60,   unit: 'Stunde' },
  'digital-cafe-gruppe':   { name: '50+ digital — Kleine Gruppe',                 rate: 40,   unit: 'Person/Stunde' },
  'digital-cafe-5er':      { name: '50+ digital — 5er-Paket',                     rate: 270,  unit: 'Paket' },
  'digital-cafe-10er':     { name: '50+ digital — 10er-Paket',                    rate: 500,  unit: 'Paket' },
  'coaching-session':      { name: 'Führungskräfte-Coaching — Einzelsession (90 Min.)', rate: 150, unit: 'Session' },
  'coaching-6er':          { name: 'Führungskräfte-Coaching — 6er-Paket',         rate: 800,  unit: 'Paket' },
  'coaching-intensiv':     { name: 'Führungskräfte-Coaching — Intensiv-Tag (6 Std.)', rate: 500, unit: 'Tag' },
  'beratung-tag':          { name: 'Unternehmensberatung — Tagessatz',             rate: 1000, unit: 'Tag' },
} as const;
```

- [ ] **Schritt 2: TypeScript-Check ausführen**

```bash
cd /home/patrick/Bachelorprojekt/website && npx astro check 2>&1 | grep -E "error|Error" | head -20
```

Erwartetes Ergebnis: Kein neuer Fehler durch diese Änderung.

- [ ] **Schritt 3: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/lib/invoiceninja.ts
git commit -m "feat(invoiceninja): add zero-rate service entries for free booking types"
```

---

## Task 3: `website-db.ts` — `booking_invoices`-Tabelle und Funktionen

**Files:**
- Modify: `website/src/lib/website-db.ts`

**Kontext:** Wie `booking_project_links` (Zeilen 1604–1644) brauchen wir eine Tabelle, die CalDAV-UIDs mit Invoice-Ninja-Daten verknüpft. Lazy init mit einem Guard-Flag, Batch-Lookup via `ANY($1)`.

- [ ] **Schritt 1: Interface, Init-Funktion und CRUD-Funktionen ans Dateiende anhängen**

Am Ende von `website/src/lib/website-db.ts` (nach der letzten Funktion `listBugTickets`) hinzufügen:

```ts
// ── Booking Invoices ──────────────────────────────────────────────────────────

export interface BookingInvoiceInfo {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
}

let bookingInvoicesReady = false;
async function initBookingInvoices(): Promise<void> {
  if (bookingInvoicesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS booking_invoices (
      caldav_uid      TEXT        NOT NULL,
      brand           TEXT        NOT NULL,
      invoice_id      TEXT        NOT NULL,
      invoice_number  TEXT        NOT NULL,
      amount          NUMERIC     NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (caldav_uid, brand)
    )
  `);
  bookingInvoicesReady = true;
}

export async function setBookingInvoice(
  caldavUid: string,
  brand: string,
  invoiceId: string,
  invoiceNumber: string,
  amount: number
): Promise<void> {
  await initBookingInvoices();
  await pool.query(
    `INSERT INTO booking_invoices (caldav_uid, brand, invoice_id, invoice_number, amount)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (caldav_uid, brand) DO UPDATE
       SET invoice_id = EXCLUDED.invoice_id,
           invoice_number = EXCLUDED.invoice_number,
           amount = EXCLUDED.amount`,
    [caldavUid, brand, invoiceId, invoiceNumber, amount]
  );
}

export async function getBookingInvoices(
  caldavUids: string[],
  brand: string
): Promise<Map<string, BookingInvoiceInfo>> {
  if (caldavUids.length === 0) return new Map();
  await initBookingInvoices();
  const result = await pool.query(
    `SELECT caldav_uid, invoice_id, invoice_number, amount
     FROM booking_invoices
     WHERE caldav_uid = ANY($1) AND brand = $2`,
    [caldavUids, brand]
  );
  return new Map(
    result.rows.map((r: {
      caldav_uid: string;
      invoice_id: string;
      invoice_number: string;
      amount: string;
    }) => [
      r.caldav_uid,
      {
        invoiceId: r.invoice_id,
        invoiceNumber: r.invoice_number,
        amount: parseFloat(r.amount),
      },
    ])
  );
}
```

- [ ] **Schritt 2: TypeScript-Check ausführen**

```bash
cd /home/patrick/Bachelorprojekt/website && npx astro check 2>&1 | grep -E "error|Error" | head -20
```

Erwartetes Ergebnis: Kein Fehler durch diese Änderung.

- [ ] **Schritt 3: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/lib/website-db.ts
git commit -m "feat(db): add booking_invoices table and helper functions"
```

---

## Task 4: `actions.ts` — `approve_booking` updaten

**Files:**
- Modify: `website/src/pages/api/mattermost/actions.ts`

**Kontext:** Drei Änderungen in einem Block:
1. `createCalendarEvent`-Rückgabe auf `{ uid }` umstellen (behebt den TypeScript-Fehler aus Task 1)
2. Fallback-ServiceKey-Logik: `context.type` verwenden wenn kein `bServiceKey` angegeben
3. Invoice-Mapping in `booking_invoices` speichern

- [ ] **Schritt 1: Import von `setBookingInvoice` hinzufügen**

`actions.ts` importiert aktuell nichts aus `website-db`. Nach Zeile 8 (dem invoiceninja-Import) eine neue Zeile einfügen:

```ts
// Bestehende Zeilen 8–9 (unverändert):
import { getOrCreateClient, createInvoice, SERVICES } from '../../../lib/invoiceninja';
import type { ServiceKey } from '../../../lib/invoiceninja';

// Neue Zeile 10 einfügen:
import { setBookingInvoice } from '../../../lib/website-db';
```

- [ ] **Schritt 2: `type` aus Booking-Context destructuren**

Im `approve_booking`-Block (Zeile 92) wird derzeit destructured:
```ts
const { name: bName, email: bEmail, phone: bPhone, typeLabel, slotStart, slotEnd, slotDisplay, date: bDate, serviceKey: bServiceKey } = context;
```

`type` hinzufügen:
```ts
const { name: bName, email: bEmail, phone: bPhone, type: bType, typeLabel, slotStart, slotEnd, slotDisplay, date: bDate, serviceKey: bServiceKey } = context;
```

- [ ] **Schritt 3: `createCalendarEvent`-Aufruf und UID-Extraktion anpassen**

Den bestehenden Block (Zeilen 114–122):
```ts
const eventCreated = await createCalendarEvent({
  summary: `${typeLabel}: ${bName}`,
  description: `Termin mit ${bName} (${bEmail})\\nTyp: ${typeLabel}${room ? `\\nMeeting: ${room.url}` : ''}`,
  start: meetingStart,
  end: meetingEnd,
  attendeeEmail: bEmail,
  attendeeName: bName,
});
statusParts.push(eventCreated ? ':calendar: Kalendereintrag erstellt' : ':warning: Kalendereintrag fehlgeschlagen');
```

Ersetzen durch:
```ts
const calEvent = await createCalendarEvent({
  summary: `${typeLabel}: ${bName}`,
  description: `Termin mit ${bName} (${bEmail})\\nTyp: ${typeLabel}${room ? `\\nMeeting: ${room.url}` : ''}`,
  start: meetingStart,
  end: meetingEnd,
  attendeeEmail: bEmail,
  attendeeName: bName,
});
const eventUid = calEvent?.uid ?? null;
statusParts.push(calEvent ? ':calendar: Kalendereintrag erstellt' : ':warning: Kalendereintrag fehlgeschlagen');
```

- [ ] **Schritt 4: Invoice-Block ersetzen**

Den bestehenden Block (Zeilen 166–179):
```ts
// 5. Create invoice if a paid service was booked
if (bServiceKey && bServiceKey in SERVICES) {
  const inClient = await getOrCreateClient({ name: bName, email: bEmail, phone: bPhone });
  if (inClient) {
    const invoice = await createInvoice({
      clientId: inClient.id,
      serviceKey: bServiceKey as ServiceKey,
      sendEmail: true,
    });
    if (invoice) {
      statusParts.push(`:receipt: Rechnung #${invoice.number} erstellt (${invoice.amount} EUR)`);
    } else {
      statusParts.push(':warning: Rechnung konnte nicht erstellt werden');
    }
  }
}
```

Ersetzen durch:
```ts
// 5. Create invoice for every confirmed booking (free types get €0 invoice)
const brand = process.env.BRAND_NAME?.toLowerCase() || 'mentolder';
const effectiveServiceKey = (bServiceKey && bServiceKey in SERVICES)
  ? bServiceKey as ServiceKey
  : (bType && bType in SERVICES ? bType as ServiceKey : null);

if (effectiveServiceKey) {
  const inClient = await getOrCreateClient({ name: bName, email: bEmail, phone: bPhone });
  if (inClient) {
    const isPaid = SERVICES[effectiveServiceKey].rate > 0;
    const invoice = await createInvoice({
      clientId: inClient.id,
      serviceKey: effectiveServiceKey,
      sendEmail: isPaid,
    });
    if (invoice) {
      if (eventUid) {
        try {
          await setBookingInvoice(eventUid, brand, invoice.id, invoice.number, invoice.amount);
        } catch (err) {
          console.warn('[approve_booking] Failed to save invoice mapping (non-fatal):', err);
        }
      }
      statusParts.push(`:receipt: Rechnung #${invoice.number} erstellt (${invoice.amount} EUR)`);
    } else {
      statusParts.push(':warning: Rechnung konnte nicht erstellt werden');
    }
  } else {
    statusParts.push(':information_source: InvoiceNinja-Kunde nicht erstellt (API nicht konfiguriert)');
  }
}
```

- [ ] **Schritt 5: TypeScript-Check ausführen**

```bash
cd /home/patrick/Bachelorprojekt/website && npx astro check 2>&1 | grep -E "error|Error" | head -20
```

Erwartetes Ergebnis: Keine Fehler. Der Fehler aus Task 1 (falscher `boolean`-Typ) ist jetzt behoben.

- [ ] **Schritt 6: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/pages/api/mattermost/actions.ts
git commit -m "feat(actions): always create invoice on booking approval, persist caldav-invoice mapping"
```

---

## Task 5: `admin/termine.astro` — Invoice-Badge anzeigen

**Files:**
- Modify: `website/src/pages/admin/termine.astro`

**Kontext:** Analog zu `bookingProjectMap` wird `bookingInvoiceMap` geladen. Pro Buchungskarte erscheint ein klickbares Badge mit Rechnungsnummer und Betrag, das direkt zur Invoice-Ninja-Bearbeitungsansicht führt.

- [ ] **Schritt 1: Imports erweitern**

Zeile 6 in `termine.astro`:
```ts
import { getBookingProjects, listProjects } from '../../lib/website-db';
import type { Project } from '../../lib/website-db';
```

Erweitern:
```ts
import { getBookingProjects, listProjects, getBookingInvoices } from '../../lib/website-db';
import type { Project, BookingInvoiceInfo } from '../../lib/website-db';
```

- [ ] **Schritt 2: Variablen-Deklarationen erweitern**

Im Frontmatter-Block, nach:
```ts
let bookingProjectMap: Map<string, string> = new Map();
```

Ergänzen:
```ts
let bookingInvoiceMap: Map<string, BookingInvoiceInfo> = new Map();
const IN_PUBLIC_URL = process.env.INVOICENINJA_PUBLIC_URL || '';
```

- [ ] **Schritt 3: Lade-Block erweitern**

Den bestehenden Block:
```ts
const uids = bookings.map(b => b.uid).filter(Boolean);
bookingProjectMap = await getBookingProjects(uids, brand);
```

Erweitern:
```ts
const uids = bookings.map(b => b.uid).filter(Boolean);
[bookingProjectMap, bookingInvoiceMap] = await Promise.all([
  getBookingProjects(uids, brand),
  getBookingInvoices(uids, brand),
]);
```

- [ ] **Schritt 4: Invoice-Badge in anstehende Buchungskarten einbauen**

Im `upcomingBookings`-Block das `map(b => (...))` auf Block-Body umstellen und `inv` vorberechnen. Die gesamte `{upcomingBookings.map(...)}` Expression ersetzen durch:

```astro
{upcomingBookings.map(b => {
  const inv = bookingInvoiceMap.get(b.uid);
  return (
    <div class="p-4 bg-dark-light rounded-xl border border-dark-lighter" data-booking-uid={b.uid}>
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p class="text-light font-medium">{b.summary}</p>
          <p class="text-sm text-muted mt-0.5">
            {formatBookingDate(b.start)} · {formatTime(b.start)} – {formatTime(b.end)}
          </p>
          <p class="text-sm text-accent mt-0.5">{b.attendeeName} &lt;{b.attendeeEmail}&gt;</p>
        </div>
        <div class="flex items-center gap-3 shrink-0 flex-wrap">
          {projects.length > 0 && (
            <select
              class="booking-project-select text-xs bg-dark border border-dark-lighter rounded-lg px-2 py-1 text-light focus:border-gold focus:ring-1 focus:ring-gold/20 outline-none cursor-pointer"
              data-booking-uid={b.uid}
            >
              <option value="">— Kein Projekt —</option>
              {projects.map(p => (
                <option value={p.id} selected={bookingProjectMap.get(b.uid) === p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          {inv && (IN_PUBLIC_URL
            ? <a
                href={`${IN_PUBLIC_URL}/invoices/${inv.invoiceId}/edit`}
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs px-2 py-0.5 rounded-full bg-gold/10 text-gold border border-gold/20 hover:bg-gold/20 transition-colors whitespace-nowrap"
              >
                #{inv.invoiceNumber} · {inv.amount.toFixed(0)} EUR →
              </a>
            : <span class="text-xs px-2 py-0.5 rounded-full bg-gold/10 text-gold border border-gold/20 whitespace-nowrap">
                #{inv.invoiceNumber} · {inv.amount.toFixed(0)} EUR
              </span>
          )}
          <span class={`text-xs px-2 py-0.5 rounded-full ${b.status === 'TENTATIVE' ? 'bg-gold/20 text-gold' : 'bg-accent/20 text-accent'}`}>
            {b.status === 'TENTATIVE' ? 'Anfrage' : 'Bestätigt'}
          </span>
        </div>
      </div>
    </div>
  );
})}
```

- [ ] **Schritt 5: Invoice-Badge in vergangene Buchungskarten einbauen**

Im `pastBookings`-Block analog vorgehen. Die `{pastBookings.map(...)}` Expression ersetzen durch:

```astro
{pastBookings.map(b => {
  const inv = bookingInvoiceMap.get(b.uid);
  return (
    <div class="p-4 bg-dark-light rounded-xl border border-dark-lighter opacity-60" data-booking-uid={b.uid}>
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p class="text-light font-medium">{b.summary}</p>
          <p class="text-sm text-muted mt-0.5">
            {formatBookingDate(b.start)} · {formatTime(b.start)} – {formatTime(b.end)}
          </p>
          <p class="text-sm text-muted mt-0.5">{b.attendeeName} &lt;{b.attendeeEmail}&gt;</p>
        </div>
        <div class="flex items-center gap-3 shrink-0 flex-wrap">
          {projects.length > 0 && (
            <select
              class="booking-project-select text-xs bg-dark border border-dark-lighter rounded-lg px-2 py-1 text-light focus:border-gold focus:ring-1 focus:ring-gold/20 outline-none cursor-pointer"
              data-booking-uid={b.uid}
            >
              <option value="">— Kein Projekt —</option>
              {projects.map(p => (
                <option value={p.id} selected={bookingProjectMap.get(b.uid) === p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          {inv && (IN_PUBLIC_URL
            ? <a
                href={`${IN_PUBLIC_URL}/invoices/${inv.invoiceId}/edit`}
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs px-2 py-0.5 rounded-full bg-dark-lighter text-muted border border-dark-lighter hover:text-light transition-colors whitespace-nowrap"
              >
                #{inv.invoiceNumber} · {inv.amount.toFixed(0)} EUR →
              </a>
            : <span class="text-xs px-2 py-0.5 rounded-full bg-dark-lighter text-muted border border-dark-lighter whitespace-nowrap">
                #{inv.invoiceNumber} · {inv.amount.toFixed(0)} EUR
              </span>
          )}
          <span class="text-xs px-2 py-0.5 rounded-full bg-dark-lighter text-muted">
            {b.status === 'CANCELLED' ? 'Abgesagt' : 'Vergangen'}
          </span>
        </div>
      </div>
    </div>
  );
})}
```

- [ ] **Schritt 6: TypeScript-Check ausführen**

```bash
cd /home/patrick/Bachelorprojekt/website && npx astro check 2>&1 | grep -E "error|Error" | head -20
```

Erwartetes Ergebnis: Keine Fehler.

- [ ] **Schritt 7: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/pages/admin/termine.astro
git commit -m "feat(admin/termine): show invoice badge per booking"
```

---

## Task 6: Abschluss — Build-Check und PR

**Files:** keine neuen

- [ ] **Schritt 1: Vollständigen Astro-Build ausführen**

```bash
cd /home/patrick/Bachelorprojekt/website && npx astro build 2>&1 | tail -20
```

Erwartetes Ergebnis: `✓ Completed in ...ms` ohne Fehler.

- [ ] **Schritt 2: Skill `superpowers:finishing-a-development-branch` aufrufen**

Für den PR-Workflow.
