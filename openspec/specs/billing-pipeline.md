# billing-pipeline
<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Die Billing-Pipeline deckt die gesamte Rechnungsverarbeitung ab: von der steuerlichen Klassifikation (Inland, EU-B2B-Reverse-Charge, Drittland-Export) über Rechnungserstellung, Zahlungserfassung und Integritätssicherung bis hin zu PDF-Generierung, Stripe-Integration, EZB-Wechselkursen, USt-ID-Validierung und Kleinstunternehmer-Schwellenwertüberwachung. Alle Buchungen folgen dem EÜR-Prinzip (Zufluss-Abfluss) und unterliegen den GoBD-Unveränderlichkeitsregeln. Fremdwährungsrechnungen werden beim Erstellen mit dem tagesaktuellen EZB-Kurs in EUR umgerechnet; Kursdifferenzen beim Zahlungseingang werden als separate Buchungen erfasst.

---

## Requirements

### Requirement: Tax Classification by Customer Location

The system SHALL classify customers as domestic (category `S`, supply type `domestic`), EU B2B reverse-charge (category `AE`, supply type `eu_b2b`), or non-EU export (category `Z`, supply type `drittland_export`) based on country code and presence of a VAT ID.

#### Scenario: Inländischer Kunde wird als Standardsteuer eingestuft

- **GIVEN** ein Kunde mit Ländercode `DE` (kein VAT-ID)
- **WHEN** `resolveCustomerTaxCategory` und `deriveSupplyType` aufgerufen werden
- **THEN** gibt `resolveCustomerTaxCategory` den Wert `S` zurück
- **AND** gibt `deriveSupplyType` den Wert `domestic` zurück

#### Scenario: EU-B2B-Kunde erhält Reverse-Charge-Einstufung

- **GIVEN** ein Kunde mit Ländercode `FR` und einer gültigen VAT-ID (`FR123`)
- **WHEN** `resolveCustomerTaxCategory` und `deriveSupplyType` aufgerufen werden
- **THEN** gibt `resolveCustomerTaxCategory` den Wert `AE` zurück
- **AND** gibt `deriveSupplyType` den Wert `eu_b2b` zurück

---

### Requirement: Vorsteuer Eligibility Restricted to EU Countries

The system SHALL mark a country as vorsteuer-eligible only when it belongs to the European Union, and SHALL return false for non-EU countries.

#### Scenario: EU-Länder sind vorsteuerabzugsberechtigt

- **GIVEN** Ländercodes aus dem EU-Raum (`DE`, `FR`)
- **WHEN** `isVorsteuerEligible` aufgerufen wird
- **THEN** gibt die Funktion `true` zurück für jeden EU-Ländercode

#### Scenario: Drittland-Kunden sind nicht vorsteuerabzugsberechtigt

- **GIVEN** ein Kunde mit Ländercode `US` (Nicht-EU)
- **WHEN** `isVorsteuerEligible` aufgerufen wird
- **THEN** gibt die Funktion `false` zurück

---

### Requirement: Invoice Finalization Locks Record and Computes Integrity Hash

The system SHALL transition a draft invoice to `open` status upon finalization, set `locked=true`, store the PDF blob with its MIME type and size, compute and store a SHA-256 integrity hash, and write a `finalize` audit log entry — without emitting any EÜR bookings at this stage.

#### Scenario: Rechnung wird finalisiert und gesperrt

- **GIVEN** eine Rechnung im Status `draft` mit mindestens einer Rechnungszeile
- **WHEN** `finalizeInvoice` mit Actor-Identität, PDF-Blob und MIME-Typ aufgerufen wird
- **THEN** hat die Rechnung den Status `open` und `locked=true`
- **AND** wird ein SHA-256-Hash (64 Hex-Zeichen) gespeichert, der `verifyInvoiceIntegrity` als `ok: true` bestätigt

#### Scenario: GoBD-Schutz verhindert nachträgliche Mutation

- **GIVEN** eine bereits finalisierte (gesperrte) Rechnung
- **WHEN** versucht wird, Rechnungszeilen oder Betragsfelder direkt per SQL zu ändern oder die Rechnung zu löschen
- **THEN** wirft die Datenbank einen Fehler mit Hinweis auf `GoBD`

---

### Requirement: Invoice Integrity Hash is Order-Independent and Sensitive to Amount Changes

The system SHALL produce an identical SHA-256 hash regardless of line-item input order, and SHALL produce a different hash whenever any monetary amount or line-item value changes.

#### Scenario: Zeilenreihenfolge beeinflusst den Hash nicht

- **GIVEN** eine Rechnung mit zwei Zeilen in unterschiedlicher Sortierung
- **WHEN** `sha256Hex(canonicalInvoiceForHash(...))` für beide Reihenfolgen berechnet wird
- **THEN** sind beide Hashwerte identisch

#### Scenario: Betragsänderung erzeugt anderen Hash

- **GIVEN** eine Rechnung mit bekanntem SHA-256-Hash
- **WHEN** ein Betrag (z. B. `netAmount`) oder ein Zeilenpreis verändert wird
- **THEN** weicht der neu berechnete Hash vom ursprünglichen ab

---

### Requirement: Payment Tracking with Status Transitions and Overshoot Prevention

The system SHALL record partial and full payments, update `paid_amount` as cumulative sum, transition invoice status to `partially_paid` or `paid` accordingly, reject payments that exceed the outstanding balance, and allow negative correction payments that revert status from `paid` to `partially_paid`.

#### Scenario: Teilzahlung setzt Status auf `partially_paid`

- **GIVEN** eine offene Rechnung über 100 EUR
- **WHEN** eine Zahlung von 40 EUR erfasst wird
- **THEN** hat die Rechnung den Status `partially_paid` und `paid_amount = 40`

#### Scenario: Überzahlung wird abgelehnt und Korrekturbuchung setzt Status zurück

- **GIVEN** eine Rechnung mit `paid_amount = 100` (vollständig bezahlt, Status `paid`)
- **WHEN** eine Überzahlung versucht wird (z. B. weitere 50 EUR auf 80 EUR Vorbelastung) oder eine negative Korrekturbuchung von −30 EUR erfasst wird
- **THEN** wirft die Überzahlungsanfrage einen Fehler mit dem Hinweis auf `overshoot` oder `exceeds outstanding`; die Korrekturbuchung setzt Status auf `partially_paid` mit `paid_amount = 70`

---

### Requirement: EÜR Bookings Emitted Proportionally on Payment

The system SHALL emit EÜR bookings only at payment time (not at finalization), splitting each payment proportionally into `net_amount` and `vat_amount` according to the invoice tax rate.

#### Scenario: Teilzahlung erzeugt proportionale EÜR-Buchung

- **GIVEN** eine finalisierte Rechnung über 119 EUR brutto (100 EUR netto + 19 % MwSt.)
- **WHEN** eine Teilzahlung von 59,50 EUR erfasst wird
- **THEN** wird genau eine EÜR-Buchung mit `net_amount ≈ 50` und `vat_amount ≈ 9,50` erstellt

#### Scenario: Keine EÜR-Buchung bei Finalisierung

- **GIVEN** eine Rechnung, die gerade finalisiert wurde
- **WHEN** die EÜR-Buchungen direkt nach `finalizeInvoice` abgefragt werden
- **THEN** existieren null Buchungen für diese Rechnung in `eur_bookings`

---

### Requirement: Foreign Currency Invoices Use ECB Rate at Creation with Kursdifferenz Bookings on Payment

The system SHALL fetch the ECB exchange rate at invoice creation for non-EUR currencies, store the rate and EUR-equivalent amounts, and emit separate `kursdifferenz_gewinn` or `kursdifferenz_verlust` bookings per payment when the payment rate differs from the invoice rate.

#### Scenario: USD-Rechnung speichert Kurs und EUR-Beträge bei Erstellung

- **GIVEN** eine neue Rechnung in USD mit einem gemockten EZB-Kurs von 1 USD = 1,1398 EUR
- **WHEN** `createInvoice` mit `currency: 'USD'` aufgerufen wird
- **THEN** speichert die Rechnung `currencyRate ≈ 1/1.1398`, `netAmountEur ≈ 877,35` und `grossAmountEur ≈ 1043,95`

#### Scenario: Kursdifferenz-Buchung bei abweichendem Zahlungskurs

- **GIVEN** eine finalisierte USD-Rechnung über 1000 USD, erfasst zum Kurs 0,92 EUR/USD
- **WHEN** eine Zahlung von 1000 USD zum Kurs 0,95 EUR/USD erfasst wird
- **THEN** wird eine `kursdifferenz_gewinn`-Buchung über ca. 30 EUR mit SKR-Konto `2668` erstellt

---

### Requirement: Stripe Billing Shim Translates Service Keys to Native Invoice Lines

The system SHALL resolve a `serviceKey` against the SERVICES catalogue, convert cent prices to euros for the line `unitPrice`, reject unknown service keys and free-tier (zero-price) services, and guard against missing customers.

#### Scenario: Bekannter ServiceKey erzeugt korrekte Rechnungszeile

- **GIVEN** ein gültiger `customerId` und `serviceKey` (z. B. `50plus-digital-einzel`, 6000 Cent)
- **WHEN** `createBillingInvoice` aufgerufen wird
- **THEN** wird `createInvoice` mit `lines[0].unitPrice = 60` und der Beschreibung aus `SERVICES` aufgerufen

#### Scenario: Unbekannter oder kostenloser ServiceKey wird abgelehnt

- **GIVEN** ein `serviceKey` der unbekannt ist oder dessen Preis 0 Cent beträgt
- **WHEN** `createBillingInvoice` aufgerufen wird
- **THEN** wirft die Funktion einen Fehler mit Hinweis auf `unknown serviceKey` bzw. `no chargeable price`

---

### Requirement: ECB Exchange Rate Fetching and Lookup

The system SHALL fetch the ECB eurofxref XML feed and return an EUR-per-unit map (inverted from the feed's unit-per-EUR rates), return `1` for EUR itself, and propagate HTTP errors and network failures as thrown errors.

#### Scenario: Erfolgreicher EZB-Abruf liefert invertierte Kursmap

- **GIVEN** ein gemockter EZB-XML-Feed mit `USD rate="1.1398"`, `GBP rate="0.8598"`, `CHF rate="0.9312"`
- **WHEN** `fetchEcbRates` aufgerufen wird
- **THEN** enthält das zurückgegebene Objekt `USD ≈ 1/1.1398`, `GBP ≈ 1/0.8598`, `CHF ≈ 1/0.9312` und `EUR = 1`

#### Scenario: HTTP-Fehler und unbekannte Währung werden abgelehnt

- **GIVEN** der EZB-Endpunkt antwortet mit HTTP 503 oder `eurPer` wird mit einer unbekannten Währung aufgerufen
- **WHEN** `fetchEcbRates` bzw. `eurPer('ZZZ', ...)` aufgerufen wird
- **THEN** wirft die Funktion einen Fehler mit Status-Code-Hinweis (`ECB rate fetch failed: 503`) bzw. `No ECB rate for ZZZ`

---

### Requirement: VAT ID Validation via VIES

The system SHALL validate EU VAT IDs via the VIES REST API, extract the two-letter country prefix from any VAT ID, return `valid=true` with name and `requestIdentifier` for valid IDs, return `valid=false` without metadata for invalid IDs, and throw on HTTP errors.

#### Scenario: Gültige VIES-Antwort liefert Validierungsnachweis

- **GIVEN** ein gemockter VIES-Endpunkt antwortet mit `isValid: true`, Name und `requestIdentifier`
- **WHEN** `checkViesVatId({ vatId: 'DE123456789', requesterVatId: 'DE987654321' })` aufgerufen wird
- **THEN** gibt die Funktion `valid: true`, `name: 'ACME GMBH'` und den `requestIdentifier` zurück

#### Scenario: Ungültige VAT-ID und HTTP-Fehler werden korrekt behandelt

- **GIVEN** der VIES-Endpunkt antwortet mit `isValid: false` oder HTTP 503
- **WHEN** `checkViesVatId` aufgerufen wird
- **THEN** gibt die Funktion bei `isValid: false` das Ergebnis `{ valid: false }` ohne Metadaten zurück; bei HTTP 503 wird ein Fehler mit `VIES` im Text geworfen

---

### Requirement: Kleinunternehmer Tax Threshold Monitoring

The system SHALL classify annual revenue against the Kleinunternehmer thresholds (Safe below warning level, Warning between 20 000 and 24 999 EUR, Exceeded at 25 000 EUR, HardExceeded above 100 000 EUR) and return zero for brands with no recorded revenue.

#### Scenario: Schwellenwert-Klassifikation nach Jahresumsatz

- **GIVEN** jährliche Umsatzwerte von 0, 20 000, 24 999, 25 000 und 100 001 EUR
- **WHEN** `checkThreshold` für jeden Wert aufgerufen wird
- **THEN** gibt die Funktion `Safe`, `Warning`, `Warning`, `Exceeded` bzw. `HardExceeded` zurück

#### Scenario: Kein Umsatz für leere Brand

- **GIVEN** eine Brand ohne Rechnungen in der Datenbank
- **WHEN** `getYearRevenue` für ein beliebiges Jahr aufgerufen wird
- **THEN** gibt die Funktion `0` zurück

---

### Requirement: Quote Length Validation Against 280-Character Verbatim Limit

The system SHALL reject any candidate text that contains a verbatim run of more than 280 characters copied from the source, using case-insensitive and whitespace-tolerant matching, and SHALL accept paraphrased or shorter quotations without error.

#### Scenario: Wortwörtliches Zitat über 280 Zeichen wird abgelehnt

- **GIVEN** ein Quelltext der einen 281-Zeichen-Abschnitt enthält und ein Kandidatentext der diesen Abschnitt unverändert enthält
- **WHEN** `validateQuoteLength({ source, candidate })` aufgerufen wird
- **THEN** gibt die Funktion `{ ok: false, violation: { kind: 'quote_too_long', matchedChars: 281 } }` zurück

#### Scenario: Paraphrase und kürzer-als-280-Zeichen-Zitat werden akzeptiert

- **GIVEN** ein Kandidatentext der kürzer als die Quelle ist oder ein wortwörtliches Zitat mit genau 280 Zeichen
- **WHEN** `validateQuoteLength` aufgerufen wird
- **THEN** gibt die Funktion `{ ok: true }` zurück

---

### Requirement: Time Entry Date Falls Back to CURRENT_DATE When Omitted

The system SHALL persist a `time_entries` row with `entry_date` set to
`CURRENT_DATE` when `createTimeEntry()` is called without an explicit
`entryDate`, and SHALL persist the given date when one is provided. The
column DEFAULT alone is NOT sufficient, because the INSERT statement always
supplies an explicit parameter value for `entry_date`; a NULL parameter value
bypasses the column DEFAULT and violates the NOT NULL constraint instead.

#### Scenario: Zeiteintrag ohne entryDate erhält CURRENT_DATE

- **GIVEN** ein Aufruf von `createTimeEntry({ projectId, minutes })` ohne
  `entryDate`
- **WHEN** der INSERT gegen `time_entries` ausgeführt wird
- **THEN** enthält die INSERT-Query `COALESCE($8::date, CURRENT_DATE)` für
  den `entry_date`-Parameterslot
- **AND** der Insert schlägt NICHT mit einer NOT-NULL-Constraint-Verletzung
  fehl

#### Scenario: Zeiteintrag mit explizitem entryDate übernimmt das Datum unverändert

- **GIVEN** ein Aufruf von `createTimeEntry({ projectId, minutes, entryDate: '2026-05-01' })`
- **WHEN** der INSERT gegen `time_entries` ausgeführt wird
- **THEN** wird `entry_date` auf `2026-05-01` gesetzt (COALESCE reicht einen
  Nicht-NULL-Wert unverändert durch)

## Testszenarien

<!-- merged from Playwright e2e tests -->

### Requirement: Service Catalog Page is Publicly Accessible
<!-- e2e: fa-09-billing.spec.ts | e2e: fa-21-billing.spec.ts -->

The system SHALL render the `/leistungen` service catalog page with a visible heading, at least one service category, and pricing information for unauthenticated users.

#### Scenario: Leistungsseite lädt mit Überschrift *(E2E)*
- **GIVEN** ein nicht authentifizierter Nutzer
- **WHEN** `/leistungen` aufgerufen wird
- **THEN** ist ein `<h1>`-Element mit dem Text „Leistungen" sichtbar

#### Scenario: Servicekategorien sind auf der Leistungsseite sichtbar *(E2E)*
- **GIVEN** ein nicht authentifizierter Nutzer auf `/leistungen`
- **WHEN** die Seite vollständig geladen ist
- **THEN** existiert mindestens eine `<h2>`- oder `<h3>`-Überschrift und der Inhalt enthält Begriffe wie „Digital Cafe", „Coaching" oder „Beratung"

#### Scenario: Preisangaben sind auf der Leistungsseite vorhanden *(E2E)*
- **GIVEN** ein nicht authentifizierter Nutzer auf `/leistungen`
- **WHEN** der Seiteninhalt geprüft wird
- **THEN** enthält der Body-Text Preishinweise (€-Zeichen, Stundenangaben oder das Wort „pauschal")

#### Scenario: Buchungs-Links verweisen auf die Terminseite *(E2E)*
- **GIVEN** ein nicht authentifizierter Nutzer auf `/leistungen`
- **WHEN** alle Buchungslinks ermittelt werden
- **THEN** enthält mindestens ein Link `href*="/termin"`

---

### Requirement: Billing API Rejects Incomplete Input
<!-- e2e: fa-09-billing.spec.ts | e2e: fa-21-billing.spec.ts -->

The system SHALL return HTTP 400 when `POST /api/billing/create-invoice` is called without a valid payload.

#### Scenario: Rechnungserstellungs-API lehnt leere Anfrage ab *(E2E)*
- **GIVEN** kein gültiger Request-Body
- **WHEN** `POST /api/billing/create-invoice` mit leerem JSON-Objekt aufgerufen wird
- **THEN** antwortet der Endpunkt mit HTTP 400

---

### Requirement: Admin and Portal Billing Pages Are Auth-Gated
<!-- e2e: fa-21-billing.spec.ts | e2e: fa-admin-billing-system.spec.ts -->

The system SHALL redirect unauthenticated users away from all admin billing pages (`/admin/rechnungen`, `/admin/steuer`, `/admin/buchhaltung`) and from per-invoice print pages (`/admin/billing/:id/drucken`, `/portal/billing/:id/drucken`).

#### Scenario: Portal-Rechnungsbereich leitet nicht authentifizierte Nutzer um *(E2E)*
- **GIVEN** ein nicht authentifizierter Nutzer
- **WHEN** `/portal` aufgerufen wird
- **THEN** ist die aktuelle URL nicht mehr `/portal` (Umleitung zur Login-Seite)

#### Scenario: Admin-Seiten leiten nicht authentifizierte Nutzer um *(E2E)*
- **GIVEN** ein nicht authentifizierter Nutzer
- **WHEN** eine der Seiten `/admin/rechnungen`, `/admin/steuer` oder `/admin/buchhaltung` aufgerufen wird
- **THEN** wird der Nutzer auf eine andere URL umgeleitet (nicht die ursprüngliche Admin-Seite)

#### Scenario: Druckansicht leitet nicht authentifizierte Nutzer um *(E2E)*
- **GIVEN** ein nicht authentifizierter Nutzer
- **WHEN** `/admin/billing/00000000.../drucken` oder `/portal/billing/00000000.../drucken` aufgerufen wird
- **THEN** stimmt die aktuelle URL nicht mit dem `/drucken`-Muster überein

---

### Requirement: Admin Billing and Bookkeeping APIs Require Authentication
<!-- e2e: fa-admin-billing-system.spec.ts -->

The system SHALL return HTTP 401 or 403 for all admin billing and bookkeeping API endpoints when called without a valid session, including draft listing, invoice retrieval, send/discard/monthly-creation actions, bookkeeping summary, tax-monitor status, UStVA-export, and ZUGFeRD download.

#### Scenario: Entwurfsliste erfordert Authentifizierung *(E2E)*
- **GIVEN** keine aktive Session
- **WHEN** `GET /api/admin/billing/drafts` oder `GET /api/admin/billing/draft-count` aufgerufen wird
- **THEN** antwortet der Endpunkt mit HTTP 401 oder 403

#### Scenario: Einzel-Rechnungs-API erfordert Authentifizierung *(E2E)*
- **GIVEN** keine aktive Session
- **WHEN** `GET /api/admin/billing/:id` aufgerufen wird
- **THEN** antwortet der Endpunkt mit HTTP 401, 403 oder 404

#### Scenario: Rechnungsaktionen erfordern Authentifizierung *(E2E)*
- **GIVEN** keine aktive Session
- **WHEN** `POST /api/admin/billing/:id/send`, `POST /api/admin/billing/:id/discard` oder `POST /api/admin/billing/create-monthly-invoices` aufgerufen wird
- **THEN** antwortet der Endpunkt mit HTTP 401, 403 oder 404

#### Scenario: Buchhaltungs-Zusammenfassung erfordert Authentifizierung *(E2E)*
- **GIVEN** keine aktive Session
- **WHEN** `GET /api/admin/bookkeeping/summary` aufgerufen wird
- **THEN** antwortet der Endpunkt mit HTTP 401 oder 403

#### Scenario: Steuer-Monitor-Endpunkte erfordern Authentifizierung *(E2E)*
- **GIVEN** keine aktive Session
- **WHEN** `GET /api/admin/tax-monitor/status` oder `GET /api/admin/tax-monitor/ustvaexport` aufgerufen wird
- **THEN** antwortet der Endpunkt mit HTTP 401 oder 403

#### Scenario: ZUGFeRD-Download erfordert Authentifizierung *(E2E)*
- **GIVEN** keine aktive Session
- **WHEN** `GET /api/billing/invoice/:id/zugferd` aufgerufen wird
- **THEN** antwortet der Endpunkt mit HTTP 401, 403 oder 404

---

### Requirement: Invoice Lifecycle — Partial and Full Payment via UI and API
<!-- e2e: fa-21-billing.spec.ts -->

The system SHALL transition an invoice from `open` to `partially_paid` after a partial payment and to `paid` after the remaining balance is settled; the admin invoice list SHALL reflect these status changes.

#### Scenario: Teilzahlung dann Vollzahlung schaltet Status korrekt um *(E2E)*
- **GIVEN** ein authentifizierter Admin und eine finalisierte Rechnung über 100 EUR
- **WHEN** zunächst 40 EUR via `POST /api/admin/billing/:id/payments` erfasst werden und danach 60 EUR
- **THEN** zeigt die Zeile in `/admin/rechnungen` nach der ersten Zahlung „Teilbezahlt" und nach der zweiten Zahlung „Bezahlt"

#### Scenario: Überzahlung via API wird abgelehnt *(E2E)*
- **GIVEN** ein authentifizierter Admin und eine finalisierte Rechnung über 100 EUR mit 80 EUR Vorbelastung
- **WHEN** eine weitere Zahlung von 50 EUR via `POST /api/admin/billing/:id/payments` versucht wird
- **THEN** antwortet der Endpunkt mit HTTP 400 und die Antwort enthält den Text „exceeds outstanding"

---

### Requirement: E-Rechnung Sidecar Service Endpoints
<!-- e2e: fa-30-einvoice.spec.ts -->

The system SHALL expose an `einvoice-sidecar` service (reachable via `EINVOICE_URL`) that validates its `/embed` and `/validate` endpoints and renders its landing page without server errors.

#### Scenario: Einvoice-Sidecar-Dienst ist erreichbar *(E2E)*
- **GIVEN** `EINVOICE_URL` ist gesetzt (ClusterIP via Port-Forward)
- **WHEN** `GET $EINVOICE_URL` aufgerufen wird
- **THEN** liefert der Dienst einen HTTP-Status außerhalb des 5xx-Bereichs (200, 301, 302, 400 oder 404)

#### Scenario: `/embed`-Endpunkt lehnt unvollständige Anfrage ab *(E2E)*
- **GIVEN** `EINVOICE_URL` ist gesetzt, kein gültiger PDF+XML-Payload
- **WHEN** `POST $EINVOICE_URL/embed` mit leerem JSON aufgerufen wird
- **THEN** antwortet der Endpunkt mit HTTP 400 oder 422

#### Scenario: `/validate`-Endpunkt liefert JSON-Antwort *(E2E)*
- **GIVEN** `EINVOICE_URL` ist gesetzt
- **WHEN** `POST $EINVOICE_URL/validate` mit leerem JSON aufgerufen wird
- **THEN** antwortet der Endpunkt mit HTTP 200, 400 oder 422 und der `Content-Type`-Header enthält `application/json`

#### Scenario: Einvoice-Sidecar-Landingpage rendert ohne Serverfehler *(E2E)*
- **GIVEN** `EINVOICE_URL` ist gesetzt
- **WHEN** die Landing-URL im Browser geöffnet wird
- **THEN** ist der `<body>` sichtbar und enthält weder „Internal Server Error" noch „502 Bad Gateway"

---

### Requirement: System-Test 7 — Rechnungserstellung und ZUGFeRD-Archivierung
<!-- e2e: systemtest-07-rechnungen.spec.ts -->

The system SHALL complete all steps of System-Test 7 (invoice creation, ZUGFeRD embedding, archiving) when executed with valid admin credentials.

#### Scenario: System-Test 7 wird vollständig durchlaufen *(E2E)*
- **GIVEN** das Admin-Passwort ist in der Umgebungsvariable gesetzt
- **WHEN** alle 16 Schritte des System-Tests 7 via `walkSystemtestByTemplate` ausgeführt werden
- **THEN** werden alle Schritte ohne kritischen Fehler abgeschlossen und das Formular eingereicht

---

### Requirement: System-Test 8 — Buchhaltung und EÜR-Auswertungen
<!-- e2e: systemtest-08-buchhaltung.spec.ts -->

The system SHALL complete all steps of System-Test 8 (EÜR bookings, voucher upload, tax evaluations) when executed with valid admin credentials.

#### Scenario: System-Test 8 wird vollständig durchlaufen *(E2E)*
- **GIVEN** das Admin-Passwort ist in der Umgebungsvariable gesetzt
- **WHEN** alle 14 Schritte des System-Tests 8 via `walkSystemtestByTemplate` ausgeführt werden
- **THEN** werden alle Schritte ohne kritischen Fehler abgeschlossen und das Formular eingereicht

<!-- merged from change delta billing-pipeline.md on 2026-07-01 -->