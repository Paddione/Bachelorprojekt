# datev-export

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Dieses Dokument beschreibt die Anforderungen an das deutsche Buchhaltungs- und E-Rechnungsexport-Subsystem. Es umfasst das DATEV-EXTF-Format (SKR03/04-Kontenrahmen, S/H-Kennzeichen, BU-Schlüssel), die EUR-Doppelte-Buchführung mit §15a-UStG-Korrekturen und Gewerbesteuer-Berechnung, SEPA-Zahlungsverkehr (pain.001/pain.008), die Leitweg-ID-Validierung für B2G-E-Rechnungen sowie die Erzeugung von ZUGFeRD/EN16931-XML und dessen Einbettung in PDF/A-3-Dateien.

---

## Requirements

### Requirement: EXTF Row Format

The system SHALL produce DATEV EXTF data rows with exactly 46 semicolon-separated fields, gross amounts formatted with comma as decimal separator, S/H-Kennzeichen "S" for income bookings, and Belegdatum in DDMM format.

#### Scenario: Regelbesteuerung-Buchung mit 19% USt

- **GIVEN** eine Einnahme-Buchung mit Bruttobeleg 1190,00 EUR, Buchungsdatum 15.01.2026, SKR03-Konto 8400 und taxMode „regelbesteuerung"
- **WHEN** `buildExtfRow` für diesen Datensatz aufgerufen wird
- **THEN** das Ergebnisfeld 0 enthält „1190,00" (Komma als Dezimaltrennzeichen)
- **AND** Feld 1 ist „S" (Soll/Haben-Kennzeichen), Feld 9 ist „1501" (DDMM), die Zeile hat exakt 46 Felder

#### Scenario: Kleinunternehmer-Buchung ohne BU-Schlüssel

- **GIVEN** eine Einnahme-Buchung mit taxMode „kleinunternehmer", SKR03-Konto 8195 und 0% Umsatzsteuer
- **WHEN** `buildExtfRow` für diesen Datensatz aufgerufen wird
- **THEN** Feld 8 (BU-Schlüssel) ist leer (kein Steuerautomatikkürzel)
- **AND** die Zeile enthält weiterhin exakt 46 Felder

---

### Requirement: EXTF CSV Structure

The system SHALL produce a complete DATEV EXTF CSV file with an EXTF-prefixed header line, a column-header row containing "Umsatz" and "Soll/Haben-Kennzeichen", period dates in YYYYMMDD format in the header, and CRLF line endings.

#### Scenario: Vollständige CSV mit Datensätzen

- **GIVEN** ein Datensatz und Export-Parameter mit periodStart „2026-01-01" und periodEnd „2026-01-31"
- **WHEN** `buildExtfCsv` aufgerufen wird
- **THEN** Zeile 0 beginnt mit „\"EXTF\"" und enthält „20260101" sowie „20260131", Zeile 1 enthält „Umsatz" und „Soll/Haben-Kennzeichen", Zeile 2 enthält den Bruttobetrag

#### Scenario: Leere Datensatzliste

- **GIVEN** eine leere Datensatz-Liste und gültige Export-Parameter
- **WHEN** `buildExtfCsv` aufgerufen wird
- **THEN** die CSV enthält genau zwei Zeilen (EXTF-Header + Spaltenüberschriften), keinen Datensatz-Bereich

---

### Requirement: SKR Account Resolution

The system SHALL map tax mode, booking type, and category to the correct SKR03 account number, including EU B2B, Drittland, and currency-difference accounts.

#### Scenario: Standardkonten nach Steuerart und Typ

- **GIVEN** verschiedene Kombinationen aus taxMode, type und category
- **WHEN** `skrAccountFor` mit diesen Parametern aufgerufen wird
- **THEN** Kleinunternehmer-Einnahmen ergeben 8195, Regelbesteuerung-Einnahmen 8400, allgemeine Ausgaben 4980, Vorsteuer 1576, USt-Vorauszahlung 1780, USt-Erstattung 1781

#### Scenario: EU- und Drittland-Sonderkonten (Plan F)

- **GIVEN** Kategorien für EU-B2B-Leistungen, Drittland-Export und Kursdifferenzen
- **WHEN** `skrAccountFor` aufgerufen wird
- **THEN** eu_b2b_services/eu_b2b_goods ergeben 8338, drittland_export ergibt 8120, kursdifferenz_gewinn ergibt 2668, kursdifferenz_verlust ergibt 4930

---

### Requirement: EUR Double-Entry Bookkeeping and Tax Calculations

The system SHALL persist income and expense bookings per brand, return accurate profit summaries, calculate §15a UStG Vorsteuer corrections for assets with changed usage ratios, and compute Gewerbesteuer with Freibetrag and Hebesatz.

#### Scenario: §15a-Korrektur für Wirtschaftsgut in Jahr 2 von 5

- **GIVEN** ein Laptop mit Nettokaufpreis 1000 EUR, gezahlter Vorsteuer 190 EUR, Nutzungsdauer 60 Monate, gekauft am 15.01.2025
- **WHEN** `calculateSection15aCorrection` am 15.01.2026 (Jahr 2) aufgerufen wird
- **THEN** das Ergebnis ist korrekturfähig (eligible=true) und der Korrekturbetrag beträgt ca. 152 EUR (190 × 48/60)

#### Scenario: Gewerbesteuer unter und über Freibetrag

- **GIVEN** ein Gewinn von 20.000 EUR (unter Freibetrag 24.500 EUR) bzw. 50.000 EUR bei Hebesatz 417
- **WHEN** `calculateGewerbesteuer` aufgerufen wird
- **THEN** bei 20.000 EUR Gewinn beträgt die Gewerbesteuer 0 EUR; bei 50.000 EUR Gewinn beträgt der Gewerbeertrag 25.500 EUR, der Messbetrag ca. 892,50 EUR und die Gewerbesteuer ca. 3721,73 EUR

---

### Requirement: SEPA Direct Debit Mandate Validation

The system SHALL validate SEPA direct debit rows and skip rows missing IBAN or mandate reference, while deriving endToEndId from paymentReference with fallback to invoiceNumber.

#### Scenario: Vollständige Mandate-Zeile wird akzeptiert

- **GIVEN** eine Zeile mit IBAN, BIC, Mandatsreferenz, Mandatsdatum, Betrag und Zahlungsreferenz
- **WHEN** `validateMandates` aufgerufen wird
- **THEN** die Zeile erscheint in `valid` mit debtorIban korrekt übernommen und endToEndId gleich der paymentReference

#### Scenario: Zeilen ohne IBAN oder Mandatsreferenz werden übersprungen

- **GIVEN** eine Zeile ohne sepaIban (bzw. ohne sepaMandateRef)
- **WHEN** `validateMandates` aufgerufen wird
- **THEN** die Zeile erscheint in `skipped` mit reason „missing IBAN" (bzw. „missing mandate reference") und `valid` ist leer; fehlt paymentReference, wird invoiceNumber als endToEndId verwendet

---

### Requirement: SEPA pain.008 XML Generation

The system SHALL generate a valid ISO 20022 pain.008.001.02 XML document embedding creditor identity, debtor mandate details, correct NbOfTxs/CtrlSum totals, and properly XML-escaped string fields.

#### Scenario: Valides pain.008-XML mit einem Eintrag

- **GIVEN** Gläubiger-Daten (IBAN, BIC, Creditor-ID) und ein Schuldner-Eintrag mit Mandatsreferenz und Einzugsdatum
- **WHEN** `buildPain008` aufgerufen wird
- **THEN** das XML enthält die Deklaration, den Namespace `urn:iso:std:iso:20022:tech:xsd:pain.008.001.02`, `<CstmrDrctDbtInitn>`, Gläubiger-Name/IBAN/BIC/CreditorId, `<NbOfTxs>1</NbOfTxs>`, `<CtrlSum>119.00</CtrlSum>`, Mandats-ID, Mandatsdatum, Schuldner-IBAN/BIC/Name und den ReqdColltnDt

#### Scenario: Mehrere Einträge und XML-Sonderzeichen-Escaping

- **GIVEN** zwei Schuldner-Einträge (Beträge 119,00 + 23,80 EUR) und ein Schuldner mit Sonderzeichen im Namen (& und <)
- **WHEN** `buildPain008` aufgerufen wird
- **THEN** `<CtrlSum>142.80</CtrlSum>` und `<NbOfTxs>2</NbOfTxs>` sind korrekt; Sonderzeichen werden als `&amp;`, `&lt;` und `&quot;` kodiert; das rohe `<GmbH>` erscheint nicht im XML; eine leere Einträge-Liste wirft einen Fehler „at least one entry"

---

### Requirement: Leitweg-ID Validation and Normalization

The system SHALL validate Leitweg-IDs according to the Grob-Fein-Prüfziffer structure (max. 46 chars, numeric check digits, alphanumeric fine-address start) and normalize them by trimming whitespace and uppercasing the fine-address segment.

#### Scenario: Gültige Leitweg-IDs verschiedener Formate

- **GIVEN** Leitweg-IDs in Grobadressierung „991-01234-44", Grob-Fein-Format „04011000-1234512345-06" und exakt 46 Zeichen Gesamtlänge
- **WHEN** `validateLeitwegId` aufgerufen wird
- **THEN** alle drei IDs gelten als gültig (ok=true)

#### Scenario: Ungültige Leitweg-IDs werden abgelehnt

- **GIVEN** eine ID ohne Prüfziffer „991-01234", eine ID mit Länge >46, eine ID mit nicht-numerischen Prüfziffern und eine ID mit Feinadresse beginnend mit Sonderzeichen
- **WHEN** `validateLeitwegId` bzw. `formatLeitwegId` aufgerufen wird
- **THEN** alle ungültigen Varianten liefern ok=false; `formatLeitwegId` trimmt Leerzeichen und wandelt die Feinadresse in Großbuchstaben um, wobei die Operation idempotent ist

---

### Requirement: E-Invoice XML Profile Generation

The system SHALL generate EN16931-compliant e-invoice XML for the profiles factur-x-minimum, xrechnung-cii, and xrechnung-ubl, including all mandatory BT-fields (BT-1/2/5/9/10/31/BG-16), correct XRechnung 3.0 CustomizationID, and reject xrechnung profiles without Leitweg-ID.

#### Scenario: XRechnung-CII mit Pflichtfeldern und Elementreihenfolge

- **GIVEN** eine Rechnungseingabe mit Leitweg-ID, Seller-USt-ID, IBAN, Fälligkeitsdatum und einer Positionszeile (1 × 100 EUR, Einheit HUR)
- **WHEN** `generateEInvoiceXml('xrechnung-cii', ...)` aufgerufen wird
- **THEN** das XML enthält BT-1 (ram:ID), BT-2 (format=102), BT-5 (EUR), BT-9 (Fälligkeitsdatum), BT-10 (BuyerReference=Leitweg-ID), BT-31 (schemeID="VA"), BT-84 (IBANID), BT-126/129/131 für die Positionszeile; die Elementreihenfolge ist: Lines → Agreement → Delivery → Settlement

#### Scenario: Ablehnung ohne Leitweg-ID und Kleinunternehmer-Steuernummer

- **GIVEN** eine XRechnung-Eingabe ohne Leitweg-ID
- **WHEN** `generateEInvoiceXml('xrechnung-cii', ...)` oder `generateEInvoiceXml('xrechnung-ubl', ...)` aufgerufen wird
- **THEN** beide Generatoren werfen einen Fehler mit /Leitweg-ID/; bei Kleinunternehmer-Eingabe mit taxNumber statt vatId enthalten alle Profile die Steuernummer unter schemeID="FC" und keinen schemeID="VA"-Eintrag

---

### Requirement: ZUGFeRD XML Generation

The system SHALL generate EN16931-compliant ZUGFeRD/Factur-X XML including the correct profile URN, suppress SpecifiedTaxRegistration for Kleinunternehmer, and embed the seller VAT-ID and tax totals for Regelbesteuerung.

#### Scenario: ZUGFeRD für Kleinunternehmer (keine USt-Registrierung)

- **GIVEN** eine Rechnung mit taxMode „kleinunternehmer", taxRate 0, kein vatId
- **WHEN** `generateZugferdXmlFromNative` aufgerufen wird
- **THEN** das XML enthält „urn:cen.eu:en16931:2017" und die Rechnungsnummer; es enthält kein `SpecifiedTaxRegistration`-Element

#### Scenario: ZUGFeRD für Regelbesteuerung mit USt-Ausweis

- **GIVEN** eine Rechnung mit taxMode „regelbesteuerung", taxRate 19, taxAmount 11,40 EUR und gültigem vatId „DE123456789"
- **WHEN** `generateZugferdXmlFromNative` aufgerufen wird
- **THEN** das XML enthält die USt-ID und den Steuerbetrag „11.40"

---

### Requirement: PDF/A-3 Factur-X Embedding

The system SHALL embed ZUGFeRD/Factur-X XML into a PDF as an attached file with AFRelationship /Alternative, filename factur-x.xml, subtype text/xml, and XMP metadata declaring the Factur-X extension schema, DocumentType INVOICE, ConformanceLevel, and PDF/A-3b conformance markers.

#### Scenario: PDF mit korrekten Attachment-Metadaten

- **GIVEN** ein minimales PDF-Dokument und valides ZUGFeRD-XML mit ConformanceLevel MINIMUM
- **WHEN** `embedFacturXIntoPdfA3` aufgerufen wird
- **THEN** der Ausgabe-Buffer enthält `/AFRelationship /Alternative`, den Dateinamen `factur-x.xml` und den Subtype `/Subtype /text#2Fxml`

#### Scenario: XMP-Marker für PDF/A-3b und Factur-X-Extension

- **GIVEN** ein minimales PDF-Dokument und ZUGFeRD-XML mit ConformanceLevel MINIMUM
- **WHEN** `embedFacturXIntoPdfA3` aufgerufen wird
- **THEN** der Ausgabe-Buffer enthält den Factur-X-Extension-Schema-URI `urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#`, `<fx:DocumentType>INVOICE</fx:DocumentType>`, `<fx:ConformanceLevel>MINIMUM</fx:ConformanceLevel>`, `pdfaid:conformance="B"` und `pdfaid:part="3"`

---

## Testszenarien

<!-- merged from Playwright e2e tests -->

### Requirement: Steuer-Modus & §19 UStG-Monitoring (End-to-End)
<!-- e2e: systemtest-06-steuer.spec.ts -->

The system SHALL allow an administrator to walk all 12 steps of the Rechnungswesen Steuer-Modus system test, including threshold crossings at 20 k/25 k/100 k EUR (auto-marked as "teilweise" from seed agent_notes), and submit the test successfully.

#### Scenario: Alle Schritte des Steuer-Modus-Systemtests durchlaufen *(E2E)*
- **GIVEN** ein eingeloggter Administrator und eine befüllte Testumgebung mit Seed-Daten für §19 UStG-Schwellenwerte
- **WHEN** der Playwright-Runner `walkSystemtestByTemplate(page, 6)` aufgerufen wird und alle 12 Schritte (inkl. der Teilschritte 4/5/6 mit Schwellenwertüberschreitungen) automatisch ausgeführt werden
- **THEN** alle Schritte werden erfolgreich durchlaufen und der Systemtest wird ohne Fehler abgeschlossen (Submit erfolgreich)

---

### Requirement: Buchhaltung & EÜR (End-to-End)
<!-- e2e: systemtest-08-buchhaltung.spec.ts -->

The system SHALL allow an administrator to walk all 14 steps of the Buchhaltung EÜR system test, including Belege and Steuerauswertungen, with step 13 (requiring a real file upload) auto-marked as "teilweise", and submit the test successfully.

#### Scenario: Alle Schritte des Buchhaltungs-Systemtests durchlaufen *(E2E)*
- **GIVEN** ein eingeloggter Administrator und eine befüllte Testumgebung für EÜR, Belege und Steuerauswertungen
- **WHEN** der Playwright-Runner `walkSystemtestByTemplate(page, 8)` aufgerufen wird und alle 14 Schritte (Schritt 13 mit Belegupload wird als „teilweise" markiert) automatisch ausgeführt werden
- **THEN** alle Schritte werden erfolgreich durchlaufen und der Systemtest wird ohne Fehler abgeschlossen (Submit erfolgreich)
