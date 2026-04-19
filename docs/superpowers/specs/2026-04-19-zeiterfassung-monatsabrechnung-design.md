# Design: Monatliche Abrechnung abrechenbarer Zeiteinträge

**Datum:** 2026-04-19
**Status:** Approved

## Überblick

Abrechenbare Zeiteinträge (`time_entries.billable = true`) werden monatlich pro Kunde zu einer Stripe-Rechnung zusammengefasst. Der Admin wird im Admin-Panel benachrichtigt, kann die Positionen vollständig im Panel bearbeiten und versendet die Rechnung von dort.

---

## 1. Datenmodell

### Änderungen an `time_entries`

Zwei neue Felder:

```sql
rate_cents        INTEGER   NOT NULL DEFAULT 0
stripe_invoice_id TEXT      NULL
```

- `rate_cents`: Stundensatz in Cent zum Zeitpunkt der Buchung (z.B. 10000 = €100/h). Wird beim Erstellen eines Eintrags gesetzt und im Formular aus dem letzten Eintrag vorbelegt.
- `stripe_invoice_id`: Wird gesetzt sobald der Eintrag auf einer Stripe-Draft-Invoice landet. `NULL` = noch nicht abgerechnet. Wird beim Verwerfen einer Draft wieder auf `NULL` zurückgesetzt.

### Abfragelogik

Unbilled billable entries:
```sql
WHERE billable = true AND stripe_invoice_id IS NULL
```

Gruppierung pro Kunde via bestehende Relation:
```
time_entries → projects.customer_id → customers
```

---

## 2. Stundensatz-Persistenz

Beim Öffnen des Zeiterfassungsformulars wird `rate_cents` des letzten Eintrags vorbelegt:

```sql
SELECT rate_cents FROM time_entries ORDER BY created_at DESC LIMIT 1
```

Kein eigenes Präferenz-System nötig. Der Wert ist editierbar und wird mit dem Eintrag gespeichert.

---

## 3. Monatlicher Cron-Job

**Zeitpunkt:** 1. jeden Monats, verarbeitet den Vormonat.

**Ablauf:**

1. Query alle `billable = true AND stripe_invoice_id IS NULL` Einträge des Vormonats, gruppiert nach `customer_id`
2. Kunden ohne Einträge werden übersprungen
3. Pro Kunde:
   a. Line Items erstellen — eine Position pro Projekt:
      - Beschreibung: `<Projektname> — <Monat Jahr>`
      - Menge: Summe `minutes / 60` (auf 2 Dezimalstellen)
      - Einzelpreis: gewichteter Durchschnitt `rate_cents` der Einträge (oder pro Eintrag eine eigene Position, falls Raten abweichen)
      - Betrag: `(minutes / 60) × rate_cents`
   b. Stripe Draft Invoice erstellen:
      ```
      stripe.invoices.create({
        customer: <stripe_customer_id>,
        collection_method: 'send_invoice',
        auto_advance: false,   // bleibt Draft bis Admin versendet
        days_until_due: 14,
      })
      ```
   c. Invoice Items per `stripe.invoiceItems.create()` anhängen
   d. `stripe_invoice_id` auf alle verarbeiteten `time_entries` setzen

**Implementierung:** Kubernetes CronJob (`0 6 1 * *`) oder interner API-Endpoint `/api/admin/billing/create-monthly-invoices` der per `node-cron` getriggert wird — analog zum bestehenden Website-Stack.

---

## 4. Admin-Benachrichtigung

Ein **Badge** in der Admin-Navigation bei "Rechnungen" zeigt die Anzahl offener Draft-Invoices.

- API-Endpoint `/api/admin/billing/draft-count` fragt Stripe ab: `stripe.invoices.list({ status: 'draft' })`
- Das Badge wird client-seitig beim Laden der Admin-Seite abgerufen
- Verschwindet sobald alle Drafts versendet oder verworfen sind

---

## 5. Admin-UI: Rechnungsbearbeitung

### Bereich in `admin/rechnungen.astro`

Neuer Abschnitt **"Ausstehende Monatsrechnungen"** oben auf der Seite.

**Listenansicht:** Pro Draft-Invoice eine Zeile mit:
- Kundenname
- Abrechnungszeitraum (Vormonat)
- Gesamtbetrag
- Anzahl Positionen
- Buttons: "Bearbeiten" | "Verwerfen"

**Detailansicht (nach Klick auf "Bearbeiten"):**

Editierbare Tabelle der Line Items mit Feldern:
- Beschreibung (Freitext)
- Stunden (numerisch, 2 Dezimalstellen)
- Stundensatz €/h (numerisch)
- Betrag (berechnet, read-only)

Aktionen pro Zeile:
- Position löschen

Aktionen gesamt:
- "Position hinzufügen" (leere Zeile)
- Gesamtbetrag (live aktualisiert)
- **"Versenden"** — `finalizeInvoice` + `sendInvoice` via Stripe API
- **"Verwerfen"** — löscht Stripe Draft, setzt `stripe_invoice_id = NULL` auf allen verknüpften `time_entries`

### Synchronisation mit Stripe

Alle Änderungen im Panel werden sofort via API auf den Stripe-Entwurf gespiegelt:
- Position bearbeiten → `stripe.invoiceItems.update()`
- Position hinzufügen → `stripe.invoiceItems.create()`
- Position löschen → `stripe.invoiceItems.del()`

Stripe bleibt Source of Truth; beim Laden der Detailansicht werden Items von Stripe gelesen.

---

## 6. API-Endpoints (neu)

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/admin/billing/create-monthly-invoices` | POST | Cron-Trigger: erstellt Draft-Invoices für Vormonat |
| `/api/admin/billing/draft-count` | GET | Anzahl offener Drafts für Badge |
| `/api/admin/billing/drafts` | GET | Liste aller Draft-Invoices mit Kundendaten |
| `/api/admin/billing/drafts/[id]` | GET | Detaildaten einer Draft-Invoice (Items von Stripe) |
| `/api/admin/billing/drafts/[id]/item` | POST/PATCH/DELETE | Line Item erstellen/bearbeiten/löschen |
| `/api/admin/billing/drafts/[id]/send` | POST | Finalisieren und versenden |
| `/api/admin/billing/drafts/[id]/discard` | POST | Draft löschen, time_entries freigeben |

---

## 7. Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `website/src/lib/website-db.ts` | `rate_cents` + `stripe_invoice_id` zu `time_entries` |
| `website/src/pages/admin/zeiterfassung.astro` | Rate-Feld im Formular, Vorbelegen aus letztem Eintrag |
| `website/src/pages/api/admin/zeiterfassung/create.ts` | `rate_cents` aus Formdata lesen und speichern |
| `website/src/pages/admin/rechnungen.astro` | Badge, Draft-Liste, Detailansicht, Edit-UI |
| `website/src/lib/stripe-billing.ts` | Funktionen für Draft-Invoice-Lifecycle |
| `website/src/pages/api/admin/billing/*` | Neue API-Endpoints (s.o.) |
| `k3d/` oder interner Cron | CronJob-Manifest für monatlichen Trigger |
