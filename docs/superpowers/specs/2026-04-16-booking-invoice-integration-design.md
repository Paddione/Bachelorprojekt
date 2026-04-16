# Design: Automatische Rechnungserstellung bei Terminbestätigung

**Datum:** 2026-04-16  
**Status:** Genehmigt  
**Scope:** Website (Astro + Svelte), Invoice Ninja, CalDAV, Admin-Übersicht

---

## Ziel

Jeder vom Admin bestätigte Termin soll automatisch ein Rechnungsobjekt in Invoice Ninja erzeugen — auch Erstgespräche und andere kostenfreie Termintypen (als €0-Rechnung). Die erstellten Rechnungen sind in der Admin-Übersicht (`/admin/termine`) direkt einsehbar und per Link in Invoice Ninja abrufbar.

---

## Ausgangslage

### Was bereits funktioniert
- `actions.ts` (`approve_booking`) erstellt bereits Rechnungen in Invoice Ninja — aber **nur wenn `serviceKey` einen bekannten kostenpflichtigen Service enthält**.
- `termine.astro` zeigt Buchungen aus CalDAV, jedoch **ohne Rechnungsstatus**.
- `booking_project_links`-Tabelle verknüpft CalDAV-UIDs mit Projekten (Vorlage für das neue Mapping).

### Lücken
1. Keine Persistenz des Invoice-Mappings (Rechnungsnummer ist nur im Mattermost-Post sichtbar).
2. Buchungstypen ohne `serviceKey` (`erstgespraech`, `callback`, `meeting`, `termin`) erzeugen keine Rechnung.
3. `createCalendarEvent` gibt nur `boolean` zurück — die CalDAV-UID ist danach nicht mehr verfügbar.
4. Admin-Übersicht zeigt keinen Rechnungsstatus.

---

## Architektur & Datenfluss

```
Buchungsanfrage (POST /api/booking)
  → Mattermost "Anfragen"-Kanal (interaktiver Post mit Bestätigen/Ablehnen)
  → Admin klickt "Bestätigen"
      → actions.ts: approve_booking
          1. Nextcloud Talk-Raum erstellen
          2. CalDAV-Event erstellen  →  UID zurückbekommen
          3. Invoice Ninja: Rechnung erstellen
             - serviceKey vorhanden → SERVICES-Lookup (kostenpflichtig)
             - kein serviceKey       → Buchungstyp als Key (€0-Fallback)
          4. booking_invoices: caldav_uid + brand → invoice_id, number, amount
          5. Mattermost-Kanal, Erinnerung, Bestätigungs-E-Mail (unverändert)

Admin-Übersicht (GET /admin/termine)
  → getAllBookings() aus CalDAV
  → getBookingInvoices(uids[], brand) → Map<uid, InvoiceInfo>
  → getBookingProjects(uids[], brand)  → Map<uid, projectId>  (unverändert)
  → Pro Buchungskarte: Rechnungsbadge + Link zu Invoice Ninja
```

---

## Komponenten

### 1. `website/src/lib/caldav.ts`

**Änderung:** `createCalendarEvent` gibt `{ uid: string } | null` zurück statt `boolean`.

Die UID hat das Format `{uuid}@{BRAND_NAME}` — identisch mit dem, was `getAllBookings()` aus CalDAV-Events liest. Dadurch ist das Mapping ohne Extraschritt möglich.

```ts
// Vorher
export async function createCalendarEvent(...): Promise<boolean>

// Nachher
export async function createCalendarEvent(...): Promise<{ uid: string } | null>
```

Alle Aufrufer in `actions.ts` werden entsprechend angepasst (`eventResult?.uid`).

---

### 2. `website/src/lib/invoiceninja.ts`

**Änderung:** Vier €0-Leistungseinträge zum `SERVICES`-Objekt hinzufügen:

```ts
'erstgespraech': { name: 'Kostenloses Erstgespräch', rate: 0, unit: 'Einheit' },
'callback':      { name: 'Rückruf',                  rate: 0, unit: 'Einheit' },
'meeting':       { name: 'Online-Meeting',            rate: 0, unit: 'Einheit' },
'termin':        { name: 'Termin vor Ort',            rate: 0, unit: 'Einheit' },
```

Damit deckt `SERVICES` alle vier Buchungstypen aus `TYPE_LABELS` in `booking.ts` ab. Der bestehende `if (bServiceKey && bServiceKey in SERVICES)`-Check in `actions.ts` greift automatisch auch für diese Typen.

---

### 3. `website/src/lib/website-db.ts`

**Neue Tabelle `booking_invoices`:**

```sql
CREATE TABLE IF NOT EXISTS booking_invoices (
  caldav_uid      TEXT        NOT NULL,
  brand           TEXT        NOT NULL,
  invoice_id      TEXT        NOT NULL,
  invoice_number  TEXT        NOT NULL,
  amount          NUMERIC     NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (caldav_uid, brand)
)
```

**Neue Funktionen:**

```ts
// Speichert oder überschreibt ein Invoice-Mapping für eine Buchung
export async function setBookingInvoice(
  caldavUid: string,
  brand: string,
  invoiceId: string,
  invoiceNumber: string,
  amount: number
): Promise<void>

// Batch-Lookup für alle UIDs einer Seite
export interface BookingInvoiceInfo {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
}
export async function getBookingInvoices(
  caldavUids: string[],
  brand: string
): Promise<Map<string, BookingInvoiceInfo>>
```

Schema-Init wird lazy (wie `booking_project_links`) mit einem `bookingInvoicesReady`-Flag durchgeführt.

---

### 4. `website/src/pages/api/mattermost/actions.ts` — `approve_booking`

**Änderungen:**

1. CalDAV-Aufruf: Rückgabe als `{ uid }` statt `boolean` speichern.
2. Invoice-Erstellung: Fallback-Logik ergänzen — wenn kein `bServiceKey`, wird der Buchungstyp (`type`) als Key verwendet (z.B. `'erstgespraech'`).
3. Mapping speichern: Nach erfolgreich erstellter Rechnung + vorhandener CalDAV-UID → `setBookingInvoice` aufrufen.
4. Statuszeile: `:receipt: Rechnung #X erstellt (0 EUR)` auch für €0-Rechnungen.

**Pseudocode (Schritt 5, invoice):**
```ts
const effectiveServiceKey = (bServiceKey && bServiceKey in SERVICES)
  ? bServiceKey
  : context.type; // 'erstgespraech' | 'callback' | 'meeting' | 'termin'

if (effectiveServiceKey in SERVICES) {
  const inClient = await getOrCreateClient({ name: bName, email: bEmail, phone: bPhone });
  if (inClient) {
    const invoice = await createInvoice({
      clientId: inClient.id,
      serviceKey: effectiveServiceKey as ServiceKey,
      sendEmail: false, // €0-Rechnungen nicht automatisch versenden
    });
    if (invoice && eventUid) {
      await setBookingInvoice(eventUid, brand, invoice.id, invoice.number, invoice.amount);
      statusParts.push(`:receipt: Rechnung #${invoice.number} erstellt (${invoice.amount} EUR)`);
    }
  }
}
```

`sendEmail` wird für €0-Rechnungen auf `false` gesetzt, um keinen unerwarteten E-Mail-Versand auszulösen. Kostenpflichtige Rechnungen behalten `sendEmail: true`.

---

### 5. `website/src/pages/admin/termine.astro`

**Änderungen:**

- `bookingInvoiceMap` laden (analog zu `bookingProjectMap`):
  ```ts
  bookingInvoiceMap = await getBookingInvoices(uids, brand);
  ```
- Pro Buchungskarte: Invoice-Badge wenn vorhanden, sonst leerer Zustand:
  ```
  [Rechnung #R-0042 · 0 EUR →]   (Link zu Invoice Ninja)
  [Rechnung #R-0043 · 150 EUR →]
  ```
- Link-URL: `${process.env.INVOICENINJA_PUBLIC_URL}/invoices/{invoiceId}/edit`
- Wenn kein Eintrag in `bookingInvoiceMap`: kein Badge (Buchungen vor dem Rollout).

---

## Fehlerbehandlung

| Szenario | Verhalten |
|---|---|
| Invoice Ninja nicht konfiguriert (kein Token) | Kein Fehler, `statusParts`-Hinweis wie bisher, kein DB-Eintrag |
| Rechnung erstellt, CalDAV schlägt fehl | Rechnung existiert in IN, kein UID-Mapping möglich (Warnung im Log, kein Crash) |
| `getBookingInvoices` schlägt fehl | Admin-Übersicht zeigt Buchungen ohne Invoice-Badge (non-fatal, try/catch) |
| Doppelter Approve-Klick | `ON CONFLICT ... DO UPDATE` überschreibt vorhandenes Mapping |

---

## Betroffene Dateien

| Datei | Art der Änderung |
|---|---|
| `website/src/lib/caldav.ts` | Rückgabetyp `createCalendarEvent`: `boolean` → `{ uid: string } \| null` |
| `website/src/lib/invoiceninja.ts` | 4 €0-Einträge in `SERVICES` |
| `website/src/lib/website-db.ts` | Tabelle `booking_invoices` + 2 Funktionen |
| `website/src/pages/api/mattermost/actions.ts` | Fallback-ServiceKey, CalDAV-UID speichern, Invoice-Mapping |
| `website/src/pages/admin/termine.astro` | Invoice-Badge pro Buchungskarte |

---

## Nicht im Scope

- Manuelle Rechnungserstellung aus der Admin-Übersicht (separates Feature)
- Rechnungsstornierung bei Terminabsage
- Rechnungsversand-Steuerung aus der Admin-UI
