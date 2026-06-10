# Design: Portal-Terminbuchung — 4 AI-Assistant-Actions

**Datum:** 2026-06-10
**Branch:** feature/portal-termin-actions
**Ticket:** T000575
**Scope:** 4 AI-Chat-Actions für Buchen / Absagen / Verschieben / Anfragen
**Priorität:** hoch · Aufwand: mittel

---

## 1. Motivation

Vier Portal-Actions (`portal:book-session`, `portal:cancel-session`, `portal:move-session`, `portal:request-session`) sind aktuell Stubs. Der Kunde kann per AI-Assistenten-Chat keine Termine wirklich buchen — er bekommt nur `{ ok: false }`. Das blockiert den Kernnutzen des Portals.

Die CalDAV-Basis (`caldav.ts`) ist zu ~80% fertig: `createCalendarEvent`, `deleteCalendarEvent`, `updateCalendarEventStatus` existieren. Die Actions sind der fehlende Klebstoff.

---

## 2. Was im Scope ist / was nicht

**Im Scope:**
- Die 4 Action-Handler implementieren
- `caldav.ts` um `updateCalendarEventTime()` erweitern
- `ActionContext` um `email`-Feld erweitern (oder Lookup via customers-Tabelle)
- `getClientBookings()` um `uid`-Feld erweitern
- E-Mail-Benachrichtigung für alle 3 Flows (Buchung, Absage, Verschiebung)
- In-App-Bestätigung (Response-Text der Action)
- CRLF-Bugfix in `createCalendarEvent` (RFC 5545) als Teil der caldav.ts-Änderungen

**Nicht im Scope:**
- Eigenes Kalender-UI im Portal
- Payment-Flow
- Nextcloud-UI-Direktintegration
- Mehrere Unterzeichner / Approval-Workflow für reguläre Buchungen
- Push-Notifications (PWA)

---

## 3. Architektur

```
Kunde tippt in Chat → AI-Assistent erkennt Intent
  ↓
executeAction('portal:book-session', ctx)
  ↓
bookSession.ts
  ├── Ownership: ctx.email (aus ActionContext, via customers-Lookup)
  ├── createCalendarEvent() → Nextcloud CalDAV
  ├── sendEmail(customer, 'booking-confirmation')
  └── return { ok: true, message: "Termin bestätigt: …" }
```

Analoger Flow für cancel (deleteCalendarEvent), move (updateCalendarEventTime), request (InboxItem).

---

## 4. Design-Entscheidungen

### 4.1 userSub → email

**Entscheidung:** `customers`-Tabelle joinen.

```ts
// In ActionContext oder Lookup-Funktion:
const customer = await getCustomerByKeycloakId(ctx.userSub);
const email = customer.email;
```

`keycloak_id` ist bereits in `customers` gespeichert (Keycloak-SSO-Flow). Kein externer API-Call, kein Token-Weitergabe-Problem, keine Latenz.

`ActionContext` bekommt ein optionales `email?: string`-Feld. Die Action-Dispatcher-Middleware füllt es vor der Action-Ausführung per DB-Lookup.

### 4.2 updateCalendarEventTime()

Neue Funktion in `caldav.ts`, analog zu `updateCalendarEventStatus`:

```ts
async function updateCalendarEventTime(uid: string, newStart: Date, newEnd: Date): Promise<void>
```

Ablauf: `findEventUrl(uid)` → GET `.ics` → DTSTART / DTEND patchen → PUT zurück.

### 4.3 portal:request-session

**Entscheidung:** InboxItem schreiben (wie bisheriger Buchungsflow via Freitext).

Begründung: "Anfragen" impliziert Admin-Prüfung → kein direkter CalDAV-Event (kein TENTATIVE-Status). Konsistent mit dem bestehenden `createInboxItem(type: 'booking')` Flow.

```ts
// requestSession.ts
await createInboxItem({ type: 'booking', …, note: ctx.payload.message });
return { ok: true, message: "Terminanfrage eingegangen — du wirst benachrichtigt." };
```

### 4.4 RFC 5545 CRLF

`createCalendarEvent()` in `caldav.ts` Zeile 476–487 nutzt `\n` statt `\r\n`. Fix inline als Teil dieser Änderung (kleiner Einzeiler, kein eigener Branch nötig).

### 4.5 Antwortzeit

≤5s pro Action. Playwright-PDF ist nicht beteiligt. CalDAV-Calls gegen lokalen Nextcloud-Service sind typischerweise <500ms. E-Mail via Mailpit/SMTP ist async-tolerant.

---

## 5. Neue / geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `website/src/lib/caldav.ts` | `updateCalendarEventTime()` neu; CRLF-Fix in `createCalendarEvent` |
| `website/src/lib/assistant/types.ts` | `ActionContext.email?: string` ergänzen |
| `website/src/lib/assistant/actions.ts` | Middleware: `email`-Feld via `getCustomerByKeycloakId(userSub)` vor `executeAction` füllen |
| `website/src/lib/assistant/actions/portal/bookSession.ts` | Stub → echter CalDAV-Call + E-Mail |
| `website/src/lib/assistant/actions/portal/cancelSession.ts` | Stub → echter CalDAV-Delete + E-Mail |
| `website/src/lib/assistant/actions/portal/moveSession.ts` | Stub → `updateCalendarEventTime` + E-Mail |
| `website/src/lib/assistant/actions/portal/requestSession.ts` | **neu** — InboxItem + Bestätigung |
| `website/src/lib/assistant/actions/portal/index.ts` | `requestSession` importieren + registrieren |
| `website/src/lib/email.ts` | 3 neue Helfer: `sendBookingConfirmation`, `sendCancellationNotification`, `sendRescheduleNotification` |
| `website/src/lib/customers-db.ts` | `getCustomerByKeycloakId(sub)` ergänzen (oder schon vorhanden prüfen) |
| `tests/e2e/specs/portal-termin-actions.spec.ts` | **neu** — Happy-Path E2E |
| `website/src/data/test-inventory.json` | regenerieren |

---

## 6. E-Mail-Templates

Alle plain-text (kein HTML-Template), inline in den Helpern:

**Buchungsbestätigung:**
```
Betreff: Terminbestätigung — [Datum]
Ihr Termin am [Datum] um [Uhrzeit] ist bestätigt.
```

**Absagebestätigung:**
```
Betreff: Terminabsage bestätigt
Ihr Termin am [Datum] wurde erfolgreich abgesagt.
```

**Verschiebungsbestätigung:**
```
Betreff: Termin verschoben — [neues Datum]
Ihr Termin wurde auf [neues Datum] um [Uhrzeit] verschoben.
```

---

## 7. getClientBookings — uid-Erweiterung

`getClientBookings(email)` gibt derzeit `CalEvent[]` ohne `uid`. Da `deleteCalendarEvent(uid)` und `updateCalendarEventTime(uid, …)` den UID brauchen:

```ts
interface ClientBooking extends CalEvent {
  uid: string; // VEVENT UID aus dem .ics
}
```

`uid` wird beim Parsen aus `VEVENT` bereits eingelesen (Zeile ~150 in caldav.ts) — nur in den Return-Typ übertragen.

---

## 8. E2E-Tests

**`tests/e2e/specs/portal-termin-actions.spec.ts`:**

1. Chat-Nachricht "Buche Termin am [nächster verfügbarer Slot]" → AI antwortet mit Bestätigung
2. CalDAV enthält Event mit ATTENDEE = Kunden-Email
3. Chat-Nachricht "Sage Termin am [Datum] ab" → AI bestätigt Absage
4. CalDAV-Event nicht mehr vorhanden
5. Chat-Nachricht "Verschiebe Termin auf [andere Uhrzeit]" → AI bestätigt
6. CalDAV-Event hat neues DTSTART/DTEND
7. Chat-Nachricht "Ich hätte gerne einen Termin" (keine konkrete Zeit) → InboxItem erstellt, AI bestätigt Anfrage

**Playwright-Projekt:** `website` (auth via Keycloak SSO, Portal-Route).

---

## 9. DSGVO

Termindaten leben ausschließlich in Nextcloud CalDAV. Löschung per `deleteCalendarEvent(uid)` (DSGVO-Auskunfts-/Löschpflicht). Kein separater DB-Store für Termine. Audit-Log: bestehender `workflow_status`-Track `'buchung'` bleibt unverändert.

---

## 10. Nicht im Scope (explizit)

- Portal-Seite `/portal/termine` (eigenes Kalender-UI) — separates Ticket
- Push-Notifications (PWA)
- Payment-Integration
- Mehrfach-Unterzeichner / Approval-Workflow für Buchungen
- Nextcloud-UI-Direktintegration
