# Mentolder Kernpfade: Buchung bis Rechnung

Inventur-Stand: Branch `chore/mentolder-parity-inventory-T901033`,
Basis `origin/main` (10e35fb79). Ticket: T901033.

Evidenz-Konvention: Jeder Eintrag nennt Pfad, Symbol/Route, Zeilenbereich,
Befund und Test-Referenz (oder `kein Test`). Zeilenangaben beziehen sich auf
den Branch-Stand. Vor-Evidenz aus Checkout 0ff76b4 (Ticket-Beschreibung) ist
als solche markiert und am aktuellen Stand verifiziert; Abweichungen sind
explizit notiert. Keine Aussage ohne Quelle.

## Buchungs-Pfad

Öffentlicher POST ohne Session-Auth (Rate-Limit pro IP als einzige
Vorkontrolle).

- Route: `POST /api/booking` — Handler `POST` in
  `components/website/src/pages/api/booking.ts` (Z. 29–250).
- Rate-Limit: `checkRateLimit('booking:' + ip, 5, 60_000)` (Z. 30–35),
  Helpers aus `components/website/src/lib/rate-limit.ts`; 429 bei
  Überschreitung.
- Idempotency: `resolveIdempotencyKey` aus
  `components/website/src/lib/appointment-requests.ts`; Header gewinnt gegen
  Body, ungültige Keys → 400 (Z. 39–50). Replay binnen 24 h gibt die
  Original-Antwort (`requestToken`, `state: 'offen'`) zurück (Z. 51–73).
- Pflichtfelder: `name`, `email` immer; `slotStart`/`slotEnd` außer bei
  `type === 'callback'`; `phone` bei Callback (Z. 75–88, 172–177).
- Leistungs-Snapshot: `serviceKey` wird gegen
  `getEffectiveLeistungen()` (lib/content) aufgelöst und als
  `serviceSnapshot` (Key, Name, Preis-Label, Dauer) eingefroren; unbekannte
  Leistung → 400 (Z. 90–108).
- Berlin-Vortagsregel: Slot-Datum muss strikt nach dem Anfrage-Datum liegen
  (`berlinDayKey`, lib/caldav-cache), sonst 409 (Z. 110–124).
- Fenster-Validierung: `isSlotInAnyWindow(BRAND, slotStart, slotEnd)` aus
  lib/website-db (Re-Export aus appointments-db); Fehlschlag → 409
  (Z. 126–140).
- Whitelist-Claiming: `isSlotWhitelisted` + atomares `claimSlot`
  (`DELETE … RETURNING`); nur freigegebene Slots werden konsumiert,
  Fenster-geprüfte Slots ohne Whitelist-Zeile bleiben implizit buchbar
  (Z. 142–170). `slotClaimed` landet im Payload für Storno-Pfade.
- Anlage: `createInboxItem({ type: 'booking', referenceId: requestToken,
  payload })` aus lib/messaging-db (Z. 202–207). Token via
  `generateRequestToken()` (lib/appointment-requests, Z. 189);
  Status-Link `/anfrage/<token>` (Z. 190). Kommandozeile Z. 188: Brand-Spalte
  bleibt NULL wie in jedem anderen Anlagepfad.
- Gast-Quittung: `sendNotify({ kind: 'eingang', … })` aus
  lib/appointment-notify mit Dedupe/Retry/Log; Notify-Log wird in
  `inbox_items.payload` zurückgeschrieben (Z. 209–224).
- Admin-Mail: `sendAdminNotification` (Betreff `[Terminanfrage: …]` bzw.
  `[Rückruf]`, Z. 226–237).
- Antwort: `{ success: true, requestToken, state: 'offen' }`, 200 (Z. 239–242).

Vor-Evidenz-Abgleich (0ff76b4): Bestätigt sind Fenster-Validierung,
Inbox-Anlage, Gast-Quittung und Admin-Mail. Abweichung: Die Ticket-Aussage
„atomares Whitelist-Claiming (not called by the inspected public POST)" ist
überholt — der aktuelle POST ruft `isSlotWhitelisted`/`claimSlot` auf
(Z. 148–170). Race-Safety gilt nur für freigegebene Slots (DELETE-Race);
implizit freigegebene Fenster-Slots haben keinen Overlap-Guard im POST —
das behauptet der Code auch nicht (Kommentar Z. 143–146).

Test-Referenz: `components/website/src/lib/__tests__/booking-availability.test.ts`
(vitest; mockt Fenster/Whitelist/Claiming). Kein direkter POST-Routen-Test
für `pages/api/booking.ts` gefunden (bounded grep über `*.test.ts`).

## Verfügbarkeit und Claiming

Implementierung in `components/website/src/lib/appointments-db.ts`
(468 Z., aus website-db extrahiert, vgl. Dateikopf Z. 1–7); öffentliche
Aufrufer importieren über Re-Exporte in
`components/website/src/lib/website-db.ts` (Z. 256–266).

- `slot_whitelist`: Tabelle mit PK `(brand, slot_start)`, FK auf
  `public.brands(id)` (Z. 318–334). CRUD: `getWhitelistedSlots` (nur
  Zukunfts-Slots, Z. 336–348), `addSlotToWhitelist` (Z. 350–358),
  `removeSlotFromWhitelist` (Z. 360–366).
- `isSlotWhitelisted(brand, start)` (Z. 368–375): Existenzprobe ohne
  Zeitfilter, damit Validierung auch für gerade begonnene Slots greift.
- `claimSlot(brand, start)` (Z. 379–386): `DELETE … WHERE brand + slot_start
  RETURNING 1`; genau ein Gewinner bei Nebenläufigkeit (atomar auf
  Zeilenebene). Befund: Race-Safety nur für Whitelist-Slots; keine Aussage
  über Fenster-Slots ohne Whitelist-Zeile.
- `free_time_windows`: Tabelle mit FK auf `public.brands(id)` (Z. 397–415).
  CRUD: `getFreeTimeWindows` (Z. 417–432), `addFreeTimeWindow` (Z. 434–443),
  `removeFreeTimeWindow` (Z. 445–451).
- `isSlotInAnyWindow(brand, slotStart, slotEnd)` (Z. 453–468): Berlin-
  Kalendertag (`berlinDayKey`) + Wandzeit-Vergleich (`berlinWallMinutes`,
  DST-sicher); Slot muss vollständig in einem Fenster liegen.
- Buchung→Rechnung-Brücke: `booking_invoice_links(caldav_uid, brand,
  invoice_id, invoice_number, amount)` (Z. 192–212), `setBookingInvoice`
  (Z. 214–231, Upsert), `getBookingInvoices` (Z. 239–263).
- Buchung→Projekt-Brücke: `booking_project_links(caldav_uid, brand,
  project_id, leistung_key)` (Z. 166–187), `setBookingProject` /
  `getBookingProjects` / `getBookingLeistungen` (Z. 265–309).

Aufrufer der Slot-Funktionen außerhalb von appointments-db (bounded grep):
`pages/api/booking.ts`, `pages/api/owner/bookings/phone.ts`,
`pages/api/owner/bookings/[uid]/reschedule.ts`,
`pages/api/owner/anfragen/[id]/annehmen.ts`,
`pages/api/anfrage/[token]/umbuchung.ts` (Details: Rest-Flows-Dokument).

Test-Referenz: `components/website/src/lib/appointments-db.test.ts`
(vitest, u. a. Kalender-Queries); `__tests__/booking-availability.test.ts`
(Availability/Claiming mit gemockter DB).

## Rechnung- und Zahlungs-Pfad

Zwei getrennte Rechnungssysteme — nicht verwechseln:

### A. Massage-Rechnungen (`public.massage_invoices`)

Modul `components/website/src/lib/invoices.ts` (425 Z.). Statusmodell
`offen | bezahlt | storniert` (Z. 22), `canTransition` (Z. 163–165).

- `buildSnapshot` (Z. 74–108): friert Kunden-/Leistungs-/Steuerdaten ein.
- `validatePflichtangaben` (Z. 111–130): GoBD-Pflichtangaben gegen
  `Creditor`; `createInvoice` wirft `RangeError` bei Lücken (Z. 332–347).
- `nextInvoiceNumber(brand, year)` (Z. 312–315): Sequenz via `bumpSequence`
  in Transaktion (`withTx`).
- `createInvoice(brand, input)` (Z. 332–347): Snapshot + Creditor-Prüfung +
  INSERT mit Status `offen`, alles in einer Transaktion.
- `markPaid(id, method, paidBy)` (Z. 348–362): Methoden `sepa | cash | bank |
  other`; `lockInvoice` (FOR UPDATE) + Transitionsprüfung.
- `markStorniert(id, reason)` (Z. 363–375): Begründungspflicht.
- `correctInvoice(id, corrected, correctedBy)` (Z. 376–404): Storno +
  Nachfolger mit `cancels_invoice_id`-Verweis in einer Transaktion.
- `getInvoice` / `listInvoices(brand)` / `findInvoiceByAppointmentToken`
  (Z. 405–425): Lesen, jeweils mit `is_test_data = false`-Filter.
- Anlage-Route: `POST /api/owner/rechnungen/erstellen`
  (`components/website/src/pages/api/owner/rechnungen/erstellen.ts`, POST
  Z. 62), Guard `requireOwner` (lib/owner-guard, Z. 14), Duplikat-Schutz via
  `findInvoiceByAppointmentToken` (Z. 89). Brand-Fallback
  `process.env.BRAND || 'mentolder'` (Z. 11).

Test-Referenz: `kein Test` — kein `invoices.test.ts` vorhanden (bounded:
gleichnamiger Test fehlt; `native-billing-mocked-invoices.test.ts`
betrifft Pfad B).

### B. Native Billing (`billing_invoices` / `billing_invoice_payments`)

Zahlungs-Modul `components/website/src/lib/invoice-payments.ts` (179 Z.),
Statusmodell `draft | open | partially_paid | paid | cancelled`.

- `recordPayment` (Z. 30–164): Transaktion mit `BEGIN` (Z. 37),
  Rechnungs-Lock `SELECT … FOR UPDATE` (Z. 38–40), Status-Guard gegen
  `draft`/`cancelled` (Z. 46–49), Überzahlungs-Guard (Z. 63–66),
  Korrektur-Guard (Z. 67–70), Zahlungs-INSERT (Z. 72–78), Status-Update
  (Z. 89–94), `COMMIT` (Z. 100). Methoden: `sepa | cash | bank | other |
  legacy` (Z. 21). EÜR-Buchung via `addBooking` (lib/eur-bookkeeping)
  best-effort nach Commit (Z. 102–121); Kursdifferenz bei Fremdwährung
  (Z. 123–148). `paid_amount` kommt aus der Payments-Summe (View-Migration
  T000375, Z. 51–61).
- `listPayments(invoiceId)` (Z. 166–179): Zahlungen je Rechnung.
- Anlage-Route (Stripe-Pfad): `POST /api/billing/create-invoice`
  (`components/website/src/pages/api/billing/create-invoice.ts`, POST Z. 11)
  via `getOrCreateCustomer` / `createBillingInvoice` / `createBillingQuote`
  aus lib/stripe-billing; Brand `process.env.BRAND || 'mentolder'`.

Test-Referenz: `components/website/src/lib/invoice-payments.test.ts`
(vitest; 4 describes: Validierung ohne DB, Transaktions-Fehlerpfade,
Happy Paths, Kursdifferenz).

### C. Angrenzende Rechnungs-Module

- Storno: `createCreditNote(invoiceId, reason, actor?)`
  (`components/website/src/lib/invoice-storno.ts`, Z. 16–144),
  `generateCreditNotePdf` (Z. 145+). Test: `invoice-storno.test.ts`.
- Mahnwesen: `runDunningDetection(brand)` (Z. 100),
  `listPendingDunnings(brand)` (Z. 198), `sendDunning(id, actorEmail)`
  (Z. 224) in `components/website/src/lib/invoice-dunning.ts`.
  Test: `invoice-dunning.test.ts`.
- PDF: `generateInvoicePdf` (Z. 193), `generateDunningPdf` (Z. 60) in
  `components/website/src/lib/invoice-pdf.ts`. Test: `invoice-pdf.test.ts`.
- HTML: `renderInvoiceHtml` (Z. 254), `renderDunningHtml` (Z. 362) in
  `components/website/src/lib/invoice-html.ts`. Test: `invoice-html.test.ts`.
- Typen/Hash/Profile: `invoice-types.ts`, `invoice-hash.ts`,
  `einvoice-profile.ts`, `einvoice-types.ts` mit gleichnamigen Tests.

## Test-Referenzen

| Pfad | Test | Art |
|---|---|---|
| Buchungs-POST | `lib/__tests__/booking-availability.test.ts` | vitest, gemockte DB |
| Buchungs-POST (Route direkt) | `kein Test` | bounded grep über `*.test.ts` |
| Verfügbarkeit/Claiming | `lib/appointments-db.test.ts` | vitest |
| Massage-Rechnungen (Pfad A) | `kein Test` | kein `invoices.test.ts` |
| Native-Billing-Zahlungen (Pfad B) | `lib/invoice-payments.test.ts` | vitest, 4 describes |
| Storno/Mahnung/PDF/HTML | `invoice-storno/dunning/pdf/html.test.ts` | vitest, je Modul |
