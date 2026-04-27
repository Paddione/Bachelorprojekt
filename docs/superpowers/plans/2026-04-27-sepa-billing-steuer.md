# SEPA-Billing & Deutsches Steuer-Compliance-System — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stripe vollständig durch ein natives SEPA-Rechnungssystem ersetzen, das alle deutschen steuerrechtlichen Anforderungen (§ 19 UStG Kleinunternehmer ↔ Regelbesteuerung, GoBD, E-Rechnung ZUGFeRD) abbildet.

**Architecture:** Drei unabhängige Subsysteme — (A) Native Invoice Engine (PostgreSQL, PDF, ZUGFeRD), (B) Steuer-Modus-Management (25.000 €-Schwelle, Voranmeldungs-Export), (C) EÜR-Buchhaltungsmodul (Einnahmen/Ausgaben, Vorsteuerberichtigung § 15a, Gewerbesteuer-Kalkulator). Stripe-Abhängigkeit wird vollständig entfernt; Zahlungsabwicklung erfolgt via SEPA-Überweisung (IBAN auf Rechnung) und optional SEPA-Lastschrift (Mandat-Speicherung in DB). Alle Module laufen als TypeScript-Libs in `website/src/lib/`, surfaced über Astro-API-Routes und Admin-UI.

**Tech Stack:** TypeScript, Astro, Svelte, PostgreSQL (website-db), PDFKit (PDF-Generierung), bestehende `zugferd.ts`, ELSTER-Protokoll-Datenexport (XML), keine neuen externen Payment-APIs.

---

## ⚠️ Scope-Hinweis: Drei unabhängige Subsysteme

Dieser Plan deckt drei abgrenzbare Teilprojekte ab, die jeweils eigenständig liefern:

| Subsystem | Umfang | Abhängigkeiten |
|-----------|--------|----------------|
| **A — Invoice Engine** | Stripe ersetzen, SEPA-Zahlungsdetails, PDF, ZUGFeRD | DB-Schema |
| **B — Steuer-Modus** | §19-Flag, 25k-Monitoring, UStVA-Export | Invoice Engine |
| **C — EÜR-Buchhaltung** | Buchungsjournal, § 15a, GewSt-Kalkulator | Steuer-Modus |

Jedes Subsystem kann separat implementiert und in Betrieb genommen werden.

---

## Anforderungskatalog (Pflichtanforderungen)

### A — Rechnungsstellung & SEPA-Zahlungsabwicklung

| ID | Anforderung | Rechtsgrundlage | Priorität |
|----|-------------|-----------------|-----------|
| A-01 | Rechnungen werden vollständig in PostgreSQL gespeichert — keine externe API-Abhängigkeit | GoBD § 14b UStG | Kritisch |
| A-02 | Pflichtangaben Kleinunternehmer-Rechnung: Name+Anschrift Leistender/Empfänger, Steuernummer, Datum, fortlaufende Nr., Leistungsbeschreibung, Entgelt, §19-Hinweis | § 34a UStDV | Kritisch |
| A-03 | Pflichtangaben Regelbesteuerer-Rechnung: wie A-02 + USt-IdNr., Nettobetrag, Steuersatz (7%/19%), Steuerbetrag, Bruttobetrag, Leistungszeitraum | § 14 UStG | Kritisch |
| A-04 | Rechnungsnummern fortlaufend, lückenlos, nicht wiederverwendbar (RE-YYYY-NNNN) | § 14 Abs. 4 Nr. 4 UStG | Kritisch |
| A-05 | SEPA-Zahlungsdaten (IBAN, BIC, Bankname, Verwendungszweck = Rechnungsnummer) auf jeder Rechnung | § 14 Abs. 4 UStG | Kritisch |
| A-06 | SEPA-Lastschrift-Mandat: Speicherung von IBAN, BIC, Mandatsreferenz, Datum der Unterschrift, Gläubiger-ID | SEPA-Regelwerk EPC | Hoch |
| A-07 | PDF-Generierung lokal (keine externe API) — GoBD-konform archivierbar | GoBD Rn. 55–58 | Kritisch |
| A-08 | ZUGFeRD-XML (Factur-X Minimum) eingebettet in PDF — E-Rechnungspflicht B2B ab 2025 | § 14 Abs. 1 UStG n.F. | Kritisch |
| A-09 | Revisionssichere Archivierung: Rechnungen unveränderbar nach Finalisierung (DB-Flag `locked`), Originalformat aufbewahrbar | GoBD Rn. 64–82 | Kritisch |
| A-10 | Aufbewahrungsfrist 10 Jahre — DB-Feld `retain_until` | § 147 AO | Hoch |
| A-11 | Stornorechnung möglich (stornierte Rechnung verweist auf Original) | § 14c Abs. 1 UStG | Hoch |
| A-12 | E-Mail-Versand der Rechnung (PDF-Anhang + ZUGFeRD-XML) über bestehendes `email.ts` | § 14 Abs. 1 S. 4 UStG | Hoch |
| A-13 | Rechnungsstatus-Workflow: `draft → open → paid / void` | intern | Mittel |
| A-14 | Zahlungseingang manuell erfassbar (Datum, Betrag, Zahlungsreferenz) | GoBD | Mittel |
| A-15 | Angebote (Quotes) unabhängig von Rechnungen, eigene Nummerierung AN-YYYY-NNNN | intern | Niedrig |

### B — Steuer-Modus-Management (§ 19 UStG)

| ID | Anforderung | Rechtsgrundlage | Priorität |
|----|-------------|-----------------|-----------|
| B-01 | Globales Steuer-Modus-Flag in `site_settings`: `tax_mode = 'kleinunternehmer' | 'regelbesteuerung'` | § 19 UStG 2025 | Kritisch |
| B-02 | Kumulierter Jahresumsatz (Netto) wird laufend gegen 25.000 €-Schwelle überwacht | § 19 Abs. 1 S. 1 UStG 2025 | Kritisch |
| B-03 | Alert im Admin-Dashboard wenn Umsatz ≥ 20.000 € (80%-Warnschwelle) und ≥ 25.000 € (harte Grenze) | § 19 Abs. 1 UStG 2025 | Kritisch |
| B-04 | Bei Überschreitung der 25.000 €-Grenze: sofortiger Wechsel auf Regelbesteuerung — alle Folgerechnungen desselben Jahres mit USt | § 19 Abs. 1 S. 2 UStG 2025 | Kritisch |
| B-05 | Rechnungsvorlagen schalten automatisch auf korrektes Template (Kleinunternehmer vs. Regelbesteuerer) basierend auf `tax_mode` | § 14 / § 34a UStDV | Kritisch |
| B-06 | Zweite Grenze: kumulierter Jahresumsatz ≥ 100.000 € im laufenden Jahr → Pflicht zur sofortigen Regelbesteuerung auch ohne Vorjahresüberschreitung | § 19 Abs. 1 S. 4 UStG 2025 | Hoch |
| B-07 | Steuer-Modus-Wechsel wird mit Datum und auslösender Rechnungsnummer protokolliert | GoBD / Revisionssicherheit | Hoch |
| B-08 | Umsatzsteuer-Voranmeldungs-Export: Quartals-/Monatsauswertung der Nettoumsätze nach Steuersatz (0%, 7%, 19%) als CSV und als ELSTER-Vorschau | § 18 UStG | Hoch |
| B-09 | Ist-Versteuerung (§ 20 UStG): USt wird erst bei Zahlungseingang in den UStVA-Export einbezogen, nicht bei Rechnungsstellung | § 20 UStG (Grenze 800k ab 2024) | Hoch |
| B-10 | Fristen-Dashboard: Voranmeldungs-Termine (10. März/Juni/September/Dezember), Jahreserklärung, GewSt-Erklärung | § 18 UStG, § 14a GewStG | Mittel |
| B-11 | USt-IdNr. Pflichtfeld bei Wechsel zu Regelbesteuerung — Validierung gegen EU-VIES-Format | § 27a UStG | Mittel |

### C — EÜR-Buchhaltungsmodul

| ID | Anforderung | Rechtsgrundlage | Priorität |
|----|-------------|-----------------|-----------|
| C-01 | Buchungsjournal (`bookings`-Tabelle): Betriebseinnahmen + Betriebsausgaben, Datum, Betrag, Kategorie, Belegnummer | § 4 Abs. 3 EStG | Kritisch |
| C-02 | Automatische Buchung bei Rechnungsversand (Forderung) und Zahlungseingang (Einnahme) | GoBD Zeitgerechtigkeit (10 Tage) | Kritisch |
| C-03 | Vorsteuer (gezahlte USt) als eigene Buchungskategorie, getrennt vom Nettobetrag | § 4 Abs. 3 S. 3 EStG | Kritisch |
| C-04 | Umsatzsteuer-Zahllasten (abgeführte USt) als Betriebsausgabe, Erstattungen als Betriebseinnahme | EStH R 4.7 | Kritisch |
| C-05 | EÜR-Auswertung: Jahresbericht Betriebseinnahmen / Betriebsausgaben / Gewinn, exportierbar als PDF und CSV | Anlage EÜR (ESt-Erklärung) | Hoch |
| C-06 | Vorsteuerberichtigung § 15a UStG: Erfassung von Anlagegütern (AK, Anschaffungsdatum, AfA-Laufzeit in Monaten, Vorsteuer), automatische Berechnung des Berichtigungsbetrags nach Wechsel | § 15a UStG | Hoch |
| C-07 | Bagatellgrenze § 44 UStDV: Berichtigung nur wenn Vorsteuer > 1.000 € je Wirtschaftsgut | § 44 Abs. 1 UStDV | Hoch |
| C-08 | Warenlager-Vorsteuerberichtigung: Beim Wechsel volle Rückforderung der Vorsteuer auf Umlaufvermögen-Bestände | § 15a Abs. 7 UStG | Mittel |
| C-09 | GWG-Verwaltung: Sofortabschreibung bis 800 € Netto; Sammelposten 250–1.000 € über 5 Jahre | § 6 Abs. 2/2a EStG | Mittel |
| C-10 | Sonderabschreibung § 7g EStG: 40 % Sonder-AfA für Betriebe mit Gewinn ≤ 200.000 € | § 7g Abs. 5 EStG | Niedrig |
| C-11 | Gewerbesteuer-Kalkulator: Eingabe Gewerbeertrag → Hinzurechnungen/Kürzungen → Freibetrag 24.500 € → Messbetrag × Steuermesszahl 3,5 % → × Hebesatz → Steuerlast; voreingestellt Lübbecke 417 % | § 11 GewStG | Mittel |
| C-12 | Einkommensteuer-Vorauszahlungsrechner: Schätzgewinn → zvE nach GFB (12.096 € für 2025) → ESt-Betrag → Quartalsbeiträge | § 37 EStG | Niedrig |
| C-13 | Digitale Belegarchivierung: Belege (PDF/Bild) werden mit Buchung verknüpft, unveränderbar gespeichert | GoBD Rn. 85–96 | Hoch |

---

## Datenbankschema (neue Tabellen)

```sql
-- Rechnungen (ersetzt Stripe-Invoice-IDs)
CREATE TABLE invoices (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  brand         TEXT NOT NULL,
  number        TEXT NOT NULL UNIQUE,          -- RE-2026-0001
  status        TEXT NOT NULL DEFAULT 'draft', -- draft|open|paid|void|cancelled
  customer_id   TEXT NOT NULL REFERENCES customers(id),
  issue_date    DATE NOT NULL,
  due_date      DATE NOT NULL,
  service_period_start DATE,
  service_period_end   DATE,
  tax_mode      TEXT NOT NULL,                 -- kleinunternehmer|regelbesteuerung
  net_amount    NUMERIC(12,2) NOT NULL,
  tax_rate      NUMERIC(5,2)  NOT NULL DEFAULT 0,
  tax_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  gross_amount  NUMERIC(12,2) NOT NULL,
  notes         TEXT,
  payment_reference TEXT,                      -- Verwendungszweck für SEPA
  paid_at       TIMESTAMPTZ,
  paid_amount   NUMERIC(12,2),
  locked        BOOLEAN NOT NULL DEFAULT false,
  cancels_invoice_id TEXT REFERENCES invoices(id), -- für Stornorechnung
  retain_until  DATE NOT NULL,                 -- 10 Jahre ab Ausstellungsdatum
  pdf_path      TEXT,                          -- GoBD-Archiv-Pfad
  zugferd_xml   TEXT,                          -- eingebettetes ZUGFeRD-XML
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invoice_line_items (
  id          BIGSERIAL PRIMARY KEY,
  invoice_id  TEXT NOT NULL REFERENCES invoices(id),
  description TEXT NOT NULL,
  quantity    NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit        TEXT,
  unit_price  NUMERIC(12,2) NOT NULL,
  net_amount  NUMERIC(12,2) NOT NULL
);

-- Kunden (ersetzt Stripe Customer IDs)
CREATE TABLE customers (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  brand        TEXT NOT NULL,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  company      TEXT,
  address_line1 TEXT,
  city         TEXT,
  postal_code  TEXT,
  country      TEXT NOT NULL DEFAULT 'DE',
  vat_number   TEXT,
  sepa_iban    TEXT,                           -- für Lastschrift
  sepa_bic     TEXT,
  sepa_mandate_ref  TEXT,
  sepa_mandate_date DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand, email)
);

-- Steuer-Modus-Protokoll
CREATE TABLE tax_mode_changes (
  id            BIGSERIAL PRIMARY KEY,
  brand         TEXT NOT NULL,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  from_mode     TEXT NOT NULL,
  to_mode       TEXT NOT NULL,
  trigger_invoice_id TEXT REFERENCES invoices(id),
  year_revenue_at_change NUMERIC(12,2),
  notes         TEXT
);

-- EÜR-Buchungsjournal
CREATE TABLE eur_bookings (
  id            BIGSERIAL PRIMARY KEY,
  brand         TEXT NOT NULL,
  booking_date  DATE NOT NULL,
  type          TEXT NOT NULL, -- 'income'|'expense'|'vat_payment'|'vat_refund'|'pretax'
  category      TEXT NOT NULL, -- z.B. 'coaching','software','miete','vorsteuer','ust-zahlung'
  description   TEXT NOT NULL,
  net_amount    NUMERIC(12,2) NOT NULL,  -- positiv = Einnahme/Ausgabe-Brutto
  vat_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  invoice_id    TEXT REFERENCES invoices(id),
  receipt_path  TEXT,                    -- Belegarchiv
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Anlagevermögen (für § 15a und AfA)
CREATE TABLE assets (
  id               BIGSERIAL PRIMARY KEY,
  brand            TEXT NOT NULL,
  description      TEXT NOT NULL,
  purchase_date    DATE NOT NULL,
  net_purchase_price NUMERIC(12,2) NOT NULL,
  vat_paid         NUMERIC(12,2) NOT NULL,
  useful_life_months INT NOT NULL,           -- AfA-Laufzeit
  correction_start_date DATE,               -- Datum Wechsel zu Regelbesteuerung
  is_gwg           BOOLEAN NOT NULL DEFAULT false,
  receipt_path     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SEPA-Mandate
CREATE TABLE sepa_mandates (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  brand           TEXT NOT NULL,
  customer_id     TEXT NOT NULL REFERENCES customers(id),
  mandate_ref     TEXT NOT NULL UNIQUE,      -- SEPA Mandatsreferenz
  iban            TEXT NOT NULL,
  bic             TEXT,
  signed_at       DATE NOT NULL,
  creditor_id     TEXT NOT NULL,             -- Gläubiger-ID (DE+8-stellig)
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Angebote
CREATE TABLE quotes (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  brand         TEXT NOT NULL,
  number        TEXT NOT NULL UNIQUE,        -- AN-2026-0001
  status        TEXT NOT NULL DEFAULT 'draft', -- draft|sent|accepted|declined|expired
  customer_id   TEXT NOT NULL REFERENCES customers(id),
  issue_date    DATE NOT NULL,
  valid_until   DATE,
  net_amount    NUMERIC(12,2) NOT NULL,
  tax_rate      NUMERIC(5,2)  NOT NULL DEFAULT 0,
  gross_amount  NUMERIC(12,2) NOT NULL,
  notes         TEXT,
  converted_to_invoice_id TEXT REFERENCES invoices(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Dateistruktur

| Datei | Verantwortlichkeit |
|-------|-------------------|
| `src/lib/native-billing.ts` | Invoice-CRUD, Customer-CRUD, Quote-CRUD; ersetzt `stripe-billing.ts` |
| `src/lib/invoice-pdf.ts` | PDF-Generierung mit PDFKit; ZUGFeRD einbetten |
| `src/lib/tax-monitor.ts` | Steuer-Modus-Flag, 25k-Schwelle, Protokollierung, UStVA-Export |
| `src/lib/eur-bookkeeping.ts` | Buchungsjournal, EÜR-Report, § 15a-Kalkulator, GewSt-Kalkulator |
| `src/lib/sepa.ts` | SEPA-Mandat-Verwaltung, IBAN-Validierung, Zahlungsreferenz-Generierung |
| `src/lib/zugferd.ts` | **Bestehendes File** — wird erweitert für Regelbesteuerung (taxAmount, Steuersatz-Zeilen) |
| `src/pages/api/admin/billing/*.ts` | API-Routes — **bestehende ersetzen** (Stripe→Native) |
| `src/pages/api/admin/tax-monitor/*.ts` | Neue Routes: Status, Wechsel, UStVA-Export |
| `src/pages/api/admin/bookkeeping/*.ts` | Neue Routes: Buchungen, Reports, § 15a, GewSt |
| `src/pages/admin/einstellungen/rechnungen.astro` | **Erweitern** um Steuer-Modus, Gläubiger-ID |
| `src/components/admin/TaxMonitorWidget.svelte` | Dashboard-Widget: Jahresumsatz vs. 25k, Alert |
| `src/components/admin/EurReport.svelte` | EÜR-Auswertung + Download |
| `src/components/admin/VorsteuerkorrekturtTab.svelte` | § 15a-Assistent |
| `src/components/portal/InvoicePaymentInfo.svelte` | Kundenportal: IBAN/Verwendungszweck statt Stripe-Link |
| `src/components/admin/inhalte/RechnungsvorlagenSection.svelte` | **Neu** — Rechnungs-Textvorlagen (Anschreiben, §19-Text, Schlusstext, E-Mail) im InhalteEditor |
| `src/components/admin/InhalteEditor.svelte` | **Erweitern** — neuen primären Tab „Rechnungen" hinzufügen |
| `src/pages/api/admin/inhalte/rechnungsvorlagen/save.ts` | **Neu** — speichert Rechnungs-Textvorlagen als `site_settings`-Keys |

---

## Subsystem A — Native Invoice Engine (Stripe-Ablösung)

### Task A-1: Datenbankschema — Customers + Invoices + Line Items

**Files:**
- Modify: `src/lib/website-db.ts` (am Ende, neue `initBillingTables()`)
- Test: `src/lib/native-billing.test.ts` (neu)

- [ ] **Schritt A-1.1: Failing Test schreiben**

```typescript
// src/lib/native-billing.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { initBillingTables, createCustomer, getCustomerByEmail } from './native-billing';

beforeAll(async () => { await initBillingTables(); });

it('creates and retrieves a customer', async () => {
  const c = await createCustomer({ brand: 'test', name: 'Max Mustermann', email: 'max@test.de' });
  expect(c.id).toBeTruthy();
  const found = await getCustomerByEmail('test', 'max@test.de');
  expect(found?.name).toBe('Max Mustermann');
});
```

- [ ] **Schritt A-1.2: Test ausführen — erwartet FAIL**

```bash
cd website && npx vitest run src/lib/native-billing.test.ts
# Erwartet: Cannot find module './native-billing'
```

- [ ] **Schritt A-1.3: `initBillingTables()` in `website-db.ts` hinzufügen**

Am Ende von `website-db.ts` folgende Funktion einfügen (nach `seedInvoiceCounter`):

```typescript
let billingTablesReady = false;
export async function initBillingTables(): Promise<void> {
  if (billingTablesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      brand         TEXT NOT NULL,
      name          TEXT NOT NULL,
      email         TEXT NOT NULL,
      company       TEXT,
      address_line1 TEXT,
      city          TEXT,
      postal_code   TEXT,
      country       TEXT NOT NULL DEFAULT 'DE',
      vat_number    TEXT,
      sepa_iban     TEXT,
      sepa_bic      TEXT,
      sepa_mandate_ref  TEXT,
      sepa_mandate_date DATE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (brand, email)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      brand         TEXT NOT NULL,
      number        TEXT NOT NULL UNIQUE,
      status        TEXT NOT NULL DEFAULT 'draft',
      customer_id   TEXT NOT NULL REFERENCES customers(id),
      issue_date    DATE NOT NULL,
      due_date      DATE NOT NULL,
      service_period_start DATE,
      service_period_end   DATE,
      tax_mode      TEXT NOT NULL,
      net_amount    NUMERIC(12,2) NOT NULL,
      tax_rate      NUMERIC(5,2)  NOT NULL DEFAULT 0,
      tax_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
      gross_amount  NUMERIC(12,2) NOT NULL,
      notes         TEXT,
      payment_reference TEXT,
      paid_at       TIMESTAMPTZ,
      paid_amount   NUMERIC(12,2),
      locked        BOOLEAN NOT NULL DEFAULT false,
      cancels_invoice_id TEXT REFERENCES invoices(id),
      retain_until  DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '10 years'),
      pdf_path      TEXT,
      zugferd_xml   TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_line_items (
      id          BIGSERIAL PRIMARY KEY,
      invoice_id  TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity    NUMERIC(10,2) NOT NULL DEFAULT 1,
      unit        TEXT,
      unit_price  NUMERIC(12,2) NOT NULL,
      net_amount  NUMERIC(12,2) NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quotes (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      brand         TEXT NOT NULL,
      number        TEXT NOT NULL UNIQUE,
      status        TEXT NOT NULL DEFAULT 'draft',
      customer_id   TEXT NOT NULL REFERENCES customers(id),
      issue_date    DATE NOT NULL,
      valid_until   DATE,
      net_amount    NUMERIC(12,2) NOT NULL,
      tax_rate      NUMERIC(5,2)  NOT NULL DEFAULT 0,
      gross_amount  NUMERIC(12,2) NOT NULL,
      notes         TEXT,
      converted_to_invoice_id TEXT REFERENCES invoices(id),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  billingTablesReady = true;
}
```

- [ ] **Schritt A-1.4: `src/lib/native-billing.ts` Stub erstellen**

```typescript
// src/lib/native-billing.ts
import { pool, initBillingTables } from './website-db';

export { initBillingTables };

export interface Customer {
  id: string; brand: string; name: string; email: string;
  company?: string; addressLine1?: string; city?: string;
  postalCode?: string; country: string; vatNumber?: string;
  sepaIban?: string; sepaBic?: string;
}

export async function createCustomer(p: {
  brand: string; name: string; email: string; company?: string;
  addressLine1?: string; city?: string; postalCode?: string;
  vatNumber?: string;
}): Promise<Customer> {
  await initBillingTables();
  const r = await pool.query<Customer>(
    `INSERT INTO customers (brand, name, email, company, address_line1, city, postal_code, vat_number)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (brand, email) DO UPDATE
       SET name=EXCLUDED.name, company=EXCLUDED.company,
           address_line1=EXCLUDED.address_line1, city=EXCLUDED.city,
           postal_code=EXCLUDED.postal_code, vat_number=EXCLUDED.vat_number
     RETURNING *`,
    [p.brand, p.name, p.email, p.company??null, p.addressLine1??null,
     p.city??null, p.postalCode??null, p.vatNumber??null]
  );
  return mapCustomer(r.rows[0]);
}

export async function getCustomerByEmail(brand: string, email: string): Promise<Customer | null> {
  await initBillingTables();
  const r = await pool.query(`SELECT * FROM customers WHERE brand=$1 AND email=$2`, [brand, email]);
  return r.rows[0] ? mapCustomer(r.rows[0]) : null;
}

function mapCustomer(row: Record<string, unknown>): Customer {
  return {
    id: row.id as string, brand: row.brand as string,
    name: row.name as string, email: row.email as string,
    company: (row.company as string) ?? undefined,
    addressLine1: (row.address_line1 as string) ?? undefined,
    city: (row.city as string) ?? undefined,
    postalCode: (row.postal_code as string) ?? undefined,
    country: (row.country as string) ?? 'DE',
    vatNumber: (row.vat_number as string) ?? undefined,
    sepaIban: (row.sepa_iban as string) ?? undefined,
    sepaBic: (row.sepa_bic as string) ?? undefined,
  };
}
```

- [ ] **Schritt A-1.5: Test ausführen — erwartet PASS**

```bash
cd website && npx vitest run src/lib/native-billing.test.ts
# Erwartet: 1 passed
```

- [ ] **Schritt A-1.6: Commit**

```bash
git add website/src/lib/website-db.ts website/src/lib/native-billing.ts website/src/lib/native-billing.test.ts
git commit -m "feat(billing): add native billing DB schema and customer CRUD"
```

---

### Task A-2: Invoice CRUD in `native-billing.ts`

**Files:**
- Modify: `src/lib/native-billing.ts`
- Test: `src/lib/native-billing.test.ts`

- [ ] **Schritt A-2.1: Failing Test**

```typescript
// In native-billing.test.ts anfügen:
import { createInvoice, getInvoice, finalizeInvoice, markInvoicePaid } from './native-billing';

it('creates, finalizes and marks invoice paid', async () => {
  const customer = await createCustomer({ brand:'test', name:'Erika M', email:'erika@test.de'});
  const inv = await createInvoice({
    brand: 'test', customerId: customer.id,
    issueDate: '2025-09-01', dueDays: 14,
    taxMode: 'kleinunternehmer',
    lines: [{ description: 'Coaching 1h', quantity: 1, unitPrice: 60 }],
  });
  expect(inv.number).toMatch(/^RE-\d{4}-\d{4}$/);
  expect(inv.netAmount).toBe(60);
  expect(inv.taxAmount).toBe(0);
  expect(inv.status).toBe('draft');

  const finalized = await finalizeInvoice(inv.id);
  expect(finalized.status).toBe('open');
  expect(finalized.locked).toBe(true);

  const paid = await markInvoicePaid(inv.id, { paidAt: '2025-09-15', paidAmount: 60 });
  expect(paid.status).toBe('paid');
});
```

- [ ] **Schritt A-2.2: Test ausführen — FAIL erwartet**

```bash
cd website && npx vitest run src/lib/native-billing.test.ts
# Erwartet: createInvoice is not a function
```

- [ ] **Schritt A-2.3: Implementierung hinzufügen**

In `native-billing.ts` einfügen:

```typescript
export interface InvoiceLine {
  description: string; quantity: number; unitPrice: number; unit?: string;
}

export interface Invoice {
  id: string; brand: string; number: string; status: string;
  customerId: string; issueDate: string; dueDate: string;
  taxMode: string; netAmount: number; taxRate: number;
  taxAmount: number; grossAmount: number; notes?: string;
  paymentReference?: string; paidAt?: string; paidAmount?: number;
  locked: boolean; cancelledInvoiceId?: string;
}

export async function createInvoice(p: {
  brand: string; customerId: string; issueDate: string; dueDays: number;
  taxMode: 'kleinunternehmer' | 'regelbesteuerung';
  taxRate?: number; lines: InvoiceLine[]; notes?: string;
  servicePeriodStart?: string; servicePeriodEnd?: string;
}): Promise<Invoice> {
  await initBillingTables();
  const number = await getNextInvoiceNumber(p.brand);
  const issueDate = new Date(p.issueDate);
  const dueDate = new Date(issueDate);
  dueDate.setDate(dueDate.getDate() + p.dueDays);

  const netAmount = p.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const taxRate   = p.taxMode === 'kleinunternehmer' ? 0 : (p.taxRate ?? 19);
  const taxAmount = Math.round(netAmount * taxRate) / 100;
  const grossAmount = netAmount + taxAmount;
  const paymentRef = number.replace('RE-', 'RG');

  const r = await pool.query(
    `INSERT INTO invoices (brand, number, customer_id, issue_date, due_date,
       service_period_start, service_period_end, tax_mode, net_amount, tax_rate,
       tax_amount, gross_amount, notes, payment_reference)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [p.brand, number, p.customerId, p.issueDate,
     dueDate.toISOString().split('T')[0],
     p.servicePeriodStart??null, p.servicePeriodEnd??null,
     p.taxMode, netAmount, taxRate, taxAmount, grossAmount,
     p.notes??null, paymentRef]
  );
  const inv = r.rows[0];
  await Promise.all(p.lines.map(l =>
    pool.query(
      `INSERT INTO invoice_line_items (invoice_id,description,quantity,unit,unit_price,net_amount)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [inv.id, l.description, l.quantity, l.unit??null, l.unitPrice, l.quantity*l.unitPrice]
    )
  ));
  return mapInvoice(inv);
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  await initBillingTables();
  const r = await pool.query(`SELECT * FROM invoices WHERE id=$1`, [id]);
  return r.rows[0] ? mapInvoice(r.rows[0]) : null;
}

export async function finalizeInvoice(id: string): Promise<Invoice> {
  const r = await pool.query(
    `UPDATE invoices SET status='open', locked=true, updated_at=now() WHERE id=$1 RETURNING *`, [id]
  );
  return mapInvoice(r.rows[0]);
}

export async function markInvoicePaid(id: string, p: { paidAt: string; paidAmount: number }): Promise<Invoice> {
  const r = await pool.query(
    `UPDATE invoices SET status='paid', paid_at=$2, paid_amount=$3, updated_at=now() WHERE id=$1 RETURNING *`,
    [id, p.paidAt, p.paidAmount]
  );
  return mapInvoice(r.rows[0]);
}

function mapInvoice(row: Record<string, unknown>): Invoice {
  return {
    id: row.id as string, brand: row.brand as string,
    number: row.number as string, status: row.status as string,
    customerId: row.customer_id as string,
    issueDate: String(row.issue_date).split('T')[0],
    dueDate:   String(row.due_date).split('T')[0],
    taxMode:   row.tax_mode as string,
    netAmount: Number(row.net_amount),
    taxRate:   Number(row.tax_rate),
    taxAmount: Number(row.tax_amount),
    grossAmount: Number(row.gross_amount),
    notes: (row.notes as string) ?? undefined,
    paymentReference: (row.payment_reference as string) ?? undefined,
    paidAt: row.paid_at ? String(row.paid_at).split('T')[0] : undefined,
    paidAmount: row.paid_amount ? Number(row.paid_amount) : undefined,
    locked: Boolean(row.locked),
    cancelledInvoiceId: (row.cancels_invoice_id as string) ?? undefined,
  };
}
```

- [ ] **Schritt A-2.4: Test ausführen — PASS erwartet**

```bash
cd website && npx vitest run src/lib/native-billing.test.ts
# Erwartet: 2 passed
```

- [ ] **Schritt A-2.5: Commit**

```bash
git add website/src/lib/native-billing.ts website/src/lib/native-billing.test.ts
git commit -m "feat(billing): invoice CRUD — create, finalize, mark paid"
```

---

### Task A-3: PDF-Generierung mit PDFKit

**Files:**
- Create: `src/lib/invoice-pdf.ts`
- Test: `src/lib/invoice-pdf.test.ts`

- [ ] **Schritt A-3.1: PDFKit installieren**

```bash
cd website && npm install pdfkit && npm install --save-dev @types/pdfkit
```

- [ ] **Schritt A-3.2: Failing Test**

```typescript
// src/lib/invoice-pdf.test.ts
import { describe, it, expect } from 'vitest';
import { generateInvoicePdf } from './invoice-pdf';

it('generates a non-empty PDF buffer', async () => {
  const buf = await generateInvoicePdf({
    invoice: {
      id:'1', brand:'test', number:'RE-2025-0001', status:'open',
      customerId:'c1', issueDate:'2025-09-01', dueDate:'2025-09-15',
      taxMode:'kleinunternehmer', netAmount:60, taxRate:0, taxAmount:0, grossAmount:60,
      paymentReference:'RG20250001', locked:true,
    },
    lines: [{ description:'Coaching 1h', quantity:1, unitPrice:60, netAmount:60 }],
    customer: { id:'c1', brand:'test', name:'Max Mustermann', email:'max@test.de', country:'DE' },
    seller: {
      name:'Gerald Korczewski', address:'Musterstr. 1', postalCode:'32312',
      city:'Lübbecke', country:'DE', vatId:'', taxNumber:'33/023/05100',
      iban:'DE89370400440532013000', bic:'COBADEFFXXX', bankName:'Commerzbank',
    },
  });
  expect(buf.length).toBeGreaterThan(1000);
  expect(buf.slice(0,4).toString()).toBe('%PDF');
});
```

- [ ] **Schritt A-3.3: Test ausführen — FAIL**

```bash
cd website && npx vitest run src/lib/invoice-pdf.test.ts
```

- [ ] **Schritt A-3.4: `invoice-pdf.ts` implementieren**

```typescript
// src/lib/invoice-pdf.ts
import PDFDocument from 'pdfkit';
import type { Invoice } from './native-billing';

export interface InvoicePdfLine {
  description: string; quantity: number; unitPrice: number; netAmount: number; unit?: string;
}
export interface InvoicePdfCustomer {
  name: string; company?: string; addressLine1?: string; city?: string; postalCode?: string; country: string; vatNumber?: string; email: string;
}
export interface InvoicePdfSeller {
  name: string; address: string; postalCode: string; city: string; country: string;
  vatId: string; taxNumber: string; iban: string; bic: string; bankName: string;
}

export async function generateInvoicePdf(p: {
  invoice: Invoice; lines: InvoicePdfLine[];
  customer: InvoicePdfCustomer; seller: InvoicePdfSeller;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 60, info: { Title: p.invoice.number } });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { invoice: inv, lines, customer, seller } = p;
    const isKlein = inv.taxMode === 'kleinunternehmer';
    const fmt = (n: number) => n.toFixed(2).replace('.', ',') + ' €';
    const fmtDate = (d: string) => d.split('-').reverse().join('.');

    // Absender (klein oben links)
    doc.fontSize(7).fillColor('#666')
       .text(`${seller.name} · ${seller.address} · ${seller.postalCode} ${seller.city}`, 60, 100, { width: 300 });

    // Empfänger
    doc.fontSize(10).fillColor('#000').moveDown(0.5);
    if (customer.company) doc.text(customer.company);
    doc.text(customer.name);
    if (customer.addressLine1) doc.text(customer.addressLine1);
    if (customer.postalCode && customer.city) doc.text(`${customer.postalCode} ${customer.city}`);
    if (customer.vatNumber) doc.text(`USt-IdNr.: ${customer.vatNumber}`);

    // Rechnungskopf
    doc.fontSize(14).fillColor('#000').text('RECHNUNG', 60, 240, { align: 'right', width: 475 });
    doc.fontSize(9).fillColor('#444')
       .text(`Rechnungsnummer: ${inv.number}`, { align: 'right', width: 475 })
       .text(`Datum: ${fmtDate(inv.issueDate)}`, { align: 'right', width: 475 })
       .text(`Zahlungsziel: ${fmtDate(inv.dueDate)}`, { align: 'right', width: 475 });
    if (inv.servicePeriodStart && inv.servicePeriodEnd) {
      doc.text(`Leistungszeitraum: ${fmtDate(inv.servicePeriodStart)} – ${fmtDate(inv.servicePeriodEnd)}`,
        { align: 'right', width: 475 });
    }

    // Tabellenkopf
    doc.moveDown(2).fontSize(8).fillColor('#555');
    const yHead = doc.y;
    doc.text('Beschreibung', 60, yHead, { width: 260 });
    doc.text('Menge', 320, yHead, { width: 60, align: 'right' });
    doc.text('Einzel', 390, yHead, { width: 70, align: 'right' });
    doc.text('Gesamt', 460, yHead, { width: 75, align: 'right' });
    doc.moveTo(60, doc.y + 4).lineTo(535, doc.y + 4).strokeColor('#ccc').stroke();

    // Positionen
    doc.moveDown(0.5).fontSize(9).fillColor('#000');
    for (const l of lines) {
      const y = doc.y;
      doc.text(l.description, 60, y, { width: 260 });
      doc.text(String(l.quantity), 320, y, { width: 60, align: 'right' });
      doc.text(fmt(l.unitPrice), 390, y, { width: 70, align: 'right' });
      doc.text(fmt(l.netAmount), 460, y, { width: 75, align: 'right' });
      doc.moveDown(0.3);
    }

    // Summen
    doc.moveTo(60, doc.y + 4).lineTo(535, doc.y + 4).strokeColor('#ccc').stroke().moveDown(0.5);
    doc.fontSize(9);
    if (!isKlein) {
      doc.text(`Nettobetrag`, 390, doc.y, { width: 145, align: 'right' }).moveUp();
      doc.text(fmt(inv.netAmount), 460, doc.y, { width: 75, align: 'right' }).moveDown(0.3);
      doc.text(`Umsatzsteuer ${inv.taxRate} %`, 390, doc.y, { width: 145, align: 'right' }).moveUp();
      doc.text(fmt(inv.taxAmount), 460, doc.y, { width: 75, align: 'right' }).moveDown(0.3);
    }
    doc.fontSize(10).fillColor('#000');
    doc.text('Rechnungsbetrag', 390, doc.y, { width: 145, align: 'right' }).moveUp();
    doc.text(fmt(inv.grossAmount), 460, doc.y, { width: 75, align: 'right' }).moveDown(2);

    // Zahlungsdetails
    doc.fontSize(8).fillColor('#333');
    doc.text(`Bitte überweisen Sie den Betrag unter Angabe des Verwendungszwecks "${inv.paymentReference}" auf:`);
    doc.text(`${seller.bankName} · IBAN: ${seller.iban} · BIC: ${seller.bic}`).moveDown(0.5);

    // §19-Hinweis oder USt-IdNr.
    if (isKlein) {
      doc.fontSize(7).fillColor('#555')
         .text('Kein Ausweis der Umsatzsteuer aufgrund der Anwendung der Kleinunternehmerregelung gemäß § 19 UStG.');
    } else {
      doc.fontSize(7).fillColor('#555').text(`USt-IdNr.: ${seller.vatId}`);
    }
    if (seller.taxNumber && !seller.vatId) {
      doc.text(`Steuernummer: ${seller.taxNumber}`);
    }
    if (inv.notes) doc.moveDown(0.5).text(inv.notes);

    // Footer
    doc.fontSize(7).fillColor('#888')
       .text(`${seller.name} · ${seller.address}, ${seller.postalCode} ${seller.city}`,
         60, 760, { align: 'center', width: 475 });

    doc.end();
  });
}
```

- [ ] **Schritt A-3.5: Test ausführen — PASS**

```bash
cd website && npx vitest run src/lib/invoice-pdf.test.ts
```

- [ ] **Schritt A-3.6: Commit**

```bash
git add website/src/lib/invoice-pdf.ts website/src/lib/invoice-pdf.test.ts
git commit -m "feat(billing): native PDF generation with PDFKit (Kleinunternehmer + Regelbesteuerer)"
```

---

### Task A-4: ZUGFeRD in PDF einbetten

**Files:**
- Modify: `src/lib/zugferd.ts` (Regelbesteuerung-Erweiterung)
- Modify: `src/lib/invoice-pdf.ts` (ZUGFeRD-XML als PDF-Attachment)
- Test: `src/lib/zugferd.test.ts` (neu)

- [ ] **Schritt A-4.1: Failing Test**

```typescript
// src/lib/zugferd.test.ts
import { describe, it, expect } from 'vitest';
import { generateZugferdXmlFromNative } from './zugferd';

it('generates valid ZUGFeRD XML for Kleinunternehmer', () => {
  const xml = generateZugferdXmlFromNative({
    invoice: { number:'RE-2025-0001', issueDate:'2025-09-01', grossAmount:60, netAmount:60, taxAmount:0, taxMode:'kleinunternehmer', taxRate:0 },
    lines: [{ description:'Coaching', netAmount:60 }],
    customer: { name:'Max Mustermann', email:'max@test.de' },
    seller: { name:'Gerald', address:'Str 1', postalCode:'32312', city:'Lübbecke', country:'DE', vatId:'' },
  });
  expect(xml).toContain('urn:factur-x.eu:1p0:minimum');
  expect(xml).toContain('RE-2025-0001');
  expect(xml).not.toContain('SpecifiedTaxRegistration'); // kein USt-Ausweis
});

it('generates valid ZUGFeRD XML for Regelbesteuerung', () => {
  const xml = generateZugferdXmlFromNative({
    invoice: { number:'RE-2025-0002', issueDate:'2025-10-01', grossAmount:71.40, netAmount:60, taxAmount:11.40, taxMode:'regelbesteuerung', taxRate:19 },
    lines: [{ description:'Coaching', netAmount:60 }],
    customer: { name:'Max Mustermann', email:'max@test.de' },
    seller: { name:'Gerald', address:'Str 1', postalCode:'32312', city:'Lübbecke', country:'DE', vatId:'DE123456789' },
  });
  expect(xml).toContain('DE123456789');
  expect(xml).toContain('19.00');
});
```

- [ ] **Schritt A-4.2: Test ausführen — FAIL**

```bash
cd website && npx vitest run src/lib/zugferd.test.ts
```

- [ ] **Schritt A-4.3: `generateZugferdXmlFromNative` in `zugferd.ts` hinzufügen**

Am Ende von `zugferd.ts` einfügen:

```typescript
export interface ZugferdNativeInput {
  invoice: { number:string; issueDate:string; grossAmount:number; netAmount:number; taxAmount:number; taxMode:string; taxRate:number };
  lines: Array<{ description:string; netAmount:number }>;
  customer: { name:string; email:string };
  seller: ZugferdSellerConfig;
}

export function generateZugferdXmlFromNative(p: ZugferdNativeInput): string {
  const isKlein = p.invoice.taxMode === 'kleinunternehmer';
  const currency = 'EUR';
  const grandTotal = fmt(p.invoice.grossAmount);
  const taxBasis   = isKlein ? grandTotal : fmt(p.invoice.netAmount);
  const taxTotal   = isKlein ? '0.00' : fmt(p.invoice.taxAmount);
  const taxRate    = isKlein ? '0' : fmt(p.invoice.taxRate);

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:factur-x.eu:1p0:minimum</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(p.invoice.number)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${toZugferdDate(p.invoice.issueDate)}</udt:DateTimeString>
    </ram:IssueDateTime>${isKlein ? `
    <ram:IncludedNote>
      <ram:Content>Kein Ausweis der Umsatzsteuer gemäß § 19 UStG.</ram:Content>
    </ram:IncludedNote>` : ''}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>${esc(p.customer.email)}</ram:BuyerReference>
      <ram:SellerTradeParty>
        <ram:Name>${esc(p.seller.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(p.seller.postalCode)}</ram:PostcodeCode>
          <ram:LineOne>${esc(p.seller.address)}</ram:LineOne>
          <ram:CityName>${esc(p.seller.city)}</ram:CityName>
          <ram:CountryID>${esc(p.seller.country)}</ram:CountryID>
        </ram:PostalTradeAddress>${p.seller.vatId ? `
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${esc(p.seller.vatId)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ''}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(p.customer.name)}</ram:Name>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${currency}</ram:InvoiceCurrencyCode>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${taxTotal}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${taxBasis}</ram:BasisAmount>
        <ram:CategoryCode>${isKlein ? 'E' : 'S'}</ram:CategoryCode>
        <ram:RateApplicablePercent>${taxRate}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:TaxBasisTotalAmount>${taxBasis}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${currency}">${taxTotal}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${grandTotal}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${grandTotal}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}
```

- [ ] **Schritt A-4.4: Test ausführen — PASS**

```bash
cd website && npx vitest run src/lib/zugferd.test.ts
```

- [ ] **Schritt A-4.5: ZUGFeRD in PDF einbetten** (in `invoice-pdf.ts`)

Nach `doc.end()`, vor `resolve(Buffer.concat(chunks))`:

PDFKit unterstützt das Einbetten als File-Attachment nicht nativ per API. Das ZUGFeRD-XML wird daher als Metadaten-Kommentar in den PDF-Stream eingefügt und separat archiviert. Die vollständige PDF/A-3-konforme Einbettung erfordert eine spätere Erweiterung mit `pdf-lib` oder `hummus`. Füge vorerst XML als base64-Kommentar ein:

```typescript
// In generateInvoicePdf, nach doc.end() aber noch vor resolve:
// XML wird separat gespeichert (pdf_path + .xml) — nicht im PDF-Stream
// TODO: PDF/A-3 mit pdf-lib für vollständige ZUGFeRD-Einbettung
```

- [ ] **Schritt A-4.6: Commit**

```bash
git add website/src/lib/zugferd.ts website/src/lib/zugferd.test.ts
git commit -m "feat(billing): extend ZUGFeRD for native invoices, Regelbesteuerung tax lines"
```

---

### Task A-5: API-Routes — Stripe-Routes ersetzen

**Files:**
- Modify: `src/pages/api/admin/billing/[id]/index.ts`
- Modify: `src/pages/api/admin/billing/[id]/send.ts`
- Modify: `src/pages/api/admin/billing/[id]/discard.ts`
- Modify: `src/pages/api/admin/billing/[id]/item.ts`
- Modify: `src/pages/api/admin/billing/create-monthly-invoices.ts`
- Modify: `src/pages/api/admin/billing/drafts.ts`
- Modify: `src/pages/api/admin/billing/draft-count.ts`

- [ ] **Schritt A-5.1: `drafts.ts` — Entwurfsliste**

```typescript
// src/pages/api/admin/billing/drafts.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { pool, initBillingTables } from '../../../../lib/website-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  await initBillingTables();
  const brand = process.env.BRAND || 'mentolder';
  const r = await pool.query(
    `SELECT i.*, c.name AS customer_name, c.email AS customer_email
     FROM invoices i JOIN customers c ON c.id = i.customer_id
     WHERE i.brand=$1 AND i.status='draft' ORDER BY i.created_at DESC LIMIT 100`,
    [brand]
  );
  return new Response(JSON.stringify(r.rows), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Schritt A-5.2: `draft-count.ts`**

```typescript
// src/pages/api/admin/billing/draft-count.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { pool, initBillingTables } from '../../../../lib/website-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  await initBillingTables();
  const brand = process.env.BRAND || 'mentolder';
  const r = await pool.query(`SELECT COUNT(*)::int AS count FROM invoices WHERE brand=$1 AND status='draft'`, [brand]);
  return new Response(JSON.stringify({ count: r.rows[0].count }), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Schritt A-5.3: `[id]/send.ts` — Rechnung finalisieren und per E-Mail senden**

```typescript
// src/pages/api/admin/billing/[id]/send.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { finalizeInvoice, getInvoice } from '../../../../../lib/native-billing';
import { generateInvoicePdf, type InvoicePdfSeller } from '../../../../../lib/invoice-pdf';
import { generateZugferdXmlFromNative } from '../../../../../lib/zugferd';
import { getCustomerById } from '../../../../../lib/native-billing';
import { sendEmail } from '../../../../../lib/email';
import { pool } from '../../../../../lib/website-db';
import { getSiteSetting } from '../../../../../lib/website-db';
import { config } from '../../../../../config/index.js';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const id = params.id as string;
  const brand = process.env.BRAND || 'mentolder';

  const inv = await getInvoice(id);
  if (!inv || inv.status !== 'draft') return new Response('Not found or not draft', { status: 404 });

  const [s, customer] = await Promise.all([
    (async () => {
      const keys = ['invoice_sender_name','invoice_sender_street','invoice_sender_city',
        'invoice_bank_iban','invoice_bank_bic','invoice_bank_name',
        'invoice_vat_id','invoice_manager','invoice_payment_days'] as const;
      const vals = await Promise.all(keys.map(k => getSiteSetting(brand, k)));
      return Object.fromEntries(keys.map((k,i) => [k, vals[i]??'']));
    })(),
    getCustomerById(inv.customerId),
  ]);
  if (!customer) return new Response('Customer not found', { status: 404 });

  const seller: InvoicePdfSeller = {
    name:       s.invoice_sender_name,
    address:    s.invoice_sender_street,
    postalCode: (s.invoice_sender_city ?? '').split(' ')[0] ?? '',
    city:       (s.invoice_sender_city ?? '').split(' ').slice(1).join(' '),
    country:    'DE',
    vatId:      s.invoice_vat_id,
    taxNumber:  '',
    iban:       s.invoice_bank_iban,
    bic:        s.invoice_bank_bic,
    bankName:   s.invoice_bank_name,
  };

  const linesR = await pool.query(`SELECT * FROM invoice_line_items WHERE invoice_id=$1 ORDER BY id`, [id]);
  const lines = linesR.rows.map(l => ({
    description: l.description, quantity: Number(l.quantity),
    unitPrice: Number(l.unit_price), netAmount: Number(l.net_amount), unit: l.unit,
  }));

  const finalized = await finalizeInvoice(id);
  const xml = generateZugferdXmlFromNative({ invoice: finalized, lines, customer, seller });
  const pdf = await generateInvoicePdf({ invoice: finalized, lines, customer, seller });

  await pool.query(`UPDATE invoices SET zugferd_xml=$2, updated_at=now() WHERE id=$1`, [id, xml]);

  await sendEmail({
    to: customer.email,
    subject: `Rechnung ${finalized.number}`,
    text: `Sehr geehrte/r ${customer.name},\n\nanbei erhalten Sie Rechnung ${finalized.number} über ${finalized.grossAmount.toFixed(2)} €.\n\nMit freundlichen Grüßen\n${seller.name}`,
    attachments: [{ filename: `${finalized.number}.pdf`, content: pdf }],
  });

  return new Response(JSON.stringify({ ok: true, number: finalized.number }), {
    headers: { 'Content-Type': 'application/json' }
  });
};
```

- [ ] **Schritt A-5.4: `getCustomerById` in `native-billing.ts` hinzufügen**

```typescript
export async function getCustomerById(id: string): Promise<Customer | null> {
  await initBillingTables();
  const r = await pool.query(`SELECT * FROM customers WHERE id=$1`, [id]);
  return r.rows[0] ? mapCustomer(r.rows[0]) : null;
}
```

- [ ] **Schritt A-5.5: `[id]/discard.ts`**

```typescript
// src/pages/api/admin/billing/[id]/discard.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { pool, initBillingTables } from '../../../../../lib/website-db';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  await initBillingTables();
  const brand = process.env.BRAND || 'mentolder';
  await pool.query(`DELETE FROM invoices WHERE id=$1 AND brand=$2 AND status='draft'`, [params.id, brand]);
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Schritt A-5.6: Commit**

```bash
git add website/src/pages/api/admin/billing/
git commit -m "feat(billing): replace Stripe API routes with native PostgreSQL billing"
```

---

### Task A-6: Admin UI — Kundenportal IBAN statt Stripe-Link

**Files:**
- Modify: `src/components/portal/InvoicePaymentInfo.svelte`
- Modify: `src/components/portal/InvoicesTab.astro`

- [ ] **Schritt A-6.1: `InvoicePaymentInfo.svelte` ersetzen**

```svelte
<!-- src/components/portal/InvoicePaymentInfo.svelte -->
<script lang="ts">
  export let invoice: {
    number: string; grossAmount: number; dueDate: string;
    status: string; paymentReference?: string;
    iban?: string; bic?: string; bankName?: string;
  };
  const fmt = (n: number) => n.toFixed(2).replace('.', ',') + ' €';
  const fmtDate = (d: string) => d.split('-').reverse().join('.');
</script>

{#if invoice.status === 'open'}
<div class="sepa-box">
  <p class="sepa-label">Zahlung per SEPA-Überweisung</p>
  <table class="sepa-table">
    <tr><td>Betrag</td><td><strong>{fmt(invoice.grossAmount)}</strong></td></tr>
    <tr><td>Zahlungsziel</td><td>{fmtDate(invoice.dueDate)}</td></tr>
    <tr><td>Empfänger</td><td>{invoice.bankName ?? '—'}</td></tr>
    <tr><td>IBAN</td><td><code>{invoice.iban ?? '—'}</code></td></tr>
    <tr><td>BIC</td><td><code>{invoice.bic ?? '—'}</code></td></tr>
    <tr><td>Verwendungszweck</td><td><code>{invoice.paymentReference ?? invoice.number}</code></td></tr>
  </table>
</div>
{/if}

<style>
.sepa-box { background: rgba(255,255,255,0.04); border: 1px solid var(--line); border-radius: 8px; padding: 1rem; margin-top: 0.75rem; }
.sepa-label { font-size: 0.75rem; color: var(--mute-2); margin-bottom: 0.5rem; font-family: var(--font-mono); text-transform: uppercase; }
.sepa-table { font-size: 0.875rem; border-collapse: collapse; width: 100%; }
.sepa-table td { padding: 0.25rem 0.5rem; }
.sepa-table td:first-child { color: var(--mute); width: 40%; }
code { font-family: var(--font-mono); font-size: 0.8rem; }
</style>
```

- [ ] **Schritt A-6.2: Manuelle Browser-Verifikation**

```bash
task website:dev
# Browser: http://web.localhost/portal → Rechnungen-Tab
# Prüfe: SEPA-Box statt Stripe-Bezahlbutton erscheint
```

- [ ] **Schritt A-6.3: Commit**

```bash
git add website/src/components/portal/InvoicePaymentInfo.svelte
git commit -m "feat(billing): replace Stripe payment link with SEPA bank transfer details in portal"
```

---

### Task A-7: InhalteEditor — Rechnungen-Tab für Rechnungs-Textvorlagen

**Kontext:** Die bestehende `einstellungen/rechnungen.astro` verwaltet Strukturdaten (IBAN, BIC, Steuersatz, Absenderadresse). Dieser Task ergänzt den `/admin/inhalte`-Editor um einen primären Tab **„Rechnungen"**, der die Text-Inhalte der Rechnungsvorlage editierbar macht — analog zu den anderen InhalteEditor-Tabs (`Website`, `Newsletter`, `Fragebögen`, `Verträge`).

**Neue `site_settings`-Keys** (werden wie alle anderen Einstellungen in `site_settings` gespeichert, Brand-scoped):

| Key | Bedeutung | Standard |
|-----|-----------|---------|
| `invoice_intro_text` | Text vor den Positionen | `"für folgende Leistungen stelle ich Ihnen in Rechnung:"` |
| `invoice_kleinunternehmer_notice` | §19-Pflichthinweis (editierbar) | `"Kein Ausweis der Umsatzsteuer aufgrund der Anwendung der Kleinunternehmerregelung gemäß § 19 UStG."` |
| `invoice_outro_text` | Text unterhalb der Summen | `"Vielen Dank für Ihr Vertrauen!"` |
| `invoice_email_subject` | E-Mail-Betreff-Vorlage | `"Rechnung {{number}}"` |
| `invoice_email_body` | E-Mail-Text-Vorlage | mehrzeiliger Default-Text (Grußformel, Betrag, Verwendungszweck) |

Platzhalter in E-Mail-Templates: `{{number}}`, `{{gross_amount}}`, `{{due_date}}`, `{{payment_reference}}`, `{{customer_name}}`, `{{seller_name}}`.

**Files:**
- Create: `src/components/admin/inhalte/RechnungsvorlagenSection.svelte`
- Modify: `src/components/admin/InhalteEditor.svelte`
- Modify: `src/pages/admin/inhalte.astro` (Initialdaten laden)
- Create: `src/pages/api/admin/inhalte/rechnungsvorlagen/save.ts`
- Modify: `src/lib/invoice-pdf.ts` (§19-Text und Anschreiben aus DB lesen)
- Modify: `src/pages/api/admin/billing/[id]/send.ts` (E-Mail-Templates aus DB lesen)

---

- [ ] **Schritt A-7.1: API-Route zum Speichern der Textvorlagen erstellen**

```typescript
// src/pages/api/admin/inhalte/rechnungsvorlagen/save.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { setSiteSetting } from '../../../../../lib/website-db';

const ALLOWED_KEYS = [
  'invoice_intro_text',
  'invoice_kleinunternehmer_notice',
  'invoice_outro_text',
  'invoice_email_subject',
  'invoice_email_body',
] as const;

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const brand = process.env.BRAND || 'mentolder';
  const body = await request.json();
  await Promise.all(
    ALLOWED_KEYS.map(k => body[k] !== undefined ? setSiteSetting(brand, k, String(body[k])) : Promise.resolve())
  );
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Schritt A-7.2: `RechnungsvorlagenSection.svelte` erstellen**

```svelte
<!-- src/components/admin/inhalte/RechnungsvorlagenSection.svelte -->
<script lang="ts">
  type InitialData = {
    invoice_intro_text: string;
    invoice_kleinunternehmer_notice: string;
    invoice_outro_text: string;
    invoice_email_subject: string;
    invoice_email_body: string;
  };

  let { initialData }: { initialData: InitialData } = $props();

  let intro   = $state(initialData.invoice_intro_text);
  let notice  = $state(initialData.invoice_kleinunternehmer_notice);
  let outro   = $state(initialData.invoice_outro_text);
  let subject = $state(initialData.invoice_email_subject);
  let body    = $state(initialData.invoice_email_body);

  let saving = $state(false);
  let msg    = $state('');

  async function save() {
    saving = true; msg = '';
    try {
      const res = await fetch('/api/admin/inhalte/rechnungsvorlagen/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_intro_text: intro,
          invoice_kleinunternehmer_notice: notice,
          invoice_outro_text: outro,
          invoice_email_subject: subject,
          invoice_email_body: body,
        }),
      });
      msg = res.ok ? 'Gespeichert.' : 'Fehler beim Speichern.';
    } catch { msg = 'Verbindungsfehler.'; }
    finally { saving = false; }
  }

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm font-mono focus:outline-none focus:border-gold/50';
  const labelCls = 'block text-xs text-muted mb-1 font-mono uppercase tracking-widest';
</script>

<div class="pt-8 pb-20 space-y-6 max-w-2xl">
  <div>
    <h2 class="text-lg font-bold text-light font-serif mb-1">Rechnungsvorlagen</h2>
    <p class="text-sm text-muted">Texte, die in PDF-Rechnungen und E-Mails verwendet werden.</p>
  </div>

  <div class="space-y-4">
    <div>
      <label class={labelCls}>Anschreiben-Text (vor den Positionen)</label>
      <input type="text" bind:value={intro} class={inputCls} placeholder="für folgende Leistungen stelle ich Ihnen in Rechnung:" />
    </div>

    <div>
      <label class={labelCls}>§ 19 UStG Pflichthinweis (Kleinunternehmer)</label>
      <textarea bind:value={notice} rows={3} class={inputCls}></textarea>
      <p class="text-xs text-muted mt-1">Erscheint auf Rechnungen wenn Steuer-Modus = Kleinunternehmer.</p>
    </div>

    <div>
      <label class={labelCls}>Schlusstext (unter den Summen)</label>
      <input type="text" bind:value={outro} class={inputCls} placeholder="Vielen Dank für Ihr Vertrauen!" />
    </div>
  </div>

  <div class="border-t border-dark-lighter pt-6 space-y-4">
    <h3 class="text-sm font-semibold text-light">E-Mail-Vorlage</h3>
    <p class="text-xs text-muted">Platzhalter: <code class="font-mono text-gold/80">&#123;&#123;number&#125;&#125;</code> <code class="font-mono text-gold/80">&#123;&#123;gross_amount&#125;&#125;</code> <code class="font-mono text-gold/80">&#123;&#123;due_date&#125;&#125;</code> <code class="font-mono text-gold/80">&#123;&#123;payment_reference&#125;&#125;</code> <code class="font-mono text-gold/80">&#123;&#123;customer_name&#125;&#125;</code> <code class="font-mono text-gold/80">&#123;&#123;seller_name&#125;&#125;</code></p>
    <div>
      <label class={labelCls}>E-Mail-Betreff</label>
      <input type="text" bind:value={subject} class={inputCls} placeholder="Rechnung {{number}}" />
    </div>
    <div>
      <label class={labelCls}>E-Mail-Text</label>
      <textarea bind:value={body} rows={8} class={inputCls}></textarea>
    </div>
  </div>

  {#if msg}
    <p class="text-sm" class:text-green-400={msg === 'Gespeichert.'} class:text-red-400={msg !== 'Gespeichert.'}>{msg}</p>
  {/if}

  <button onclick={save} disabled={saving} class="px-5 py-2.5 bg-gold text-dark font-semibold rounded-lg text-sm hover:bg-gold/80 disabled:opacity-50">
    {saving ? 'Speichern…' : 'Speichern'}
  </button>
</div>
```

- [ ] **Schritt A-7.3: `inhalte.astro` — Initialdaten für Rechnungsvorlagen laden**

In `src/pages/admin/inhalte.astro` die vorhandenen `getSiteSetting`-Aufrufe um die neuen Keys erweitern und als `rechnungsvorlagen`-Prop an `InhalteEditor` übergeben:

```typescript
// In inhalte.astro (nach den bestehenden getSiteSetting-Aufrufen):
const RECHNUNG_KEYS = [
  'invoice_intro_text',
  'invoice_kleinunternehmer_notice',
  'invoice_outro_text',
  'invoice_email_subject',
  'invoice_email_body',
] as const;

const RECHNUNG_DEFAULTS: Record<typeof RECHNUNG_KEYS[number], string> = {
  invoice_intro_text: 'für folgende Leistungen stelle ich Ihnen in Rechnung:',
  invoice_kleinunternehmer_notice:
    'Kein Ausweis der Umsatzsteuer aufgrund der Anwendung der Kleinunternehmerregelung gemäß § 19 UStG.',
  invoice_outro_text: 'Vielen Dank für Ihr Vertrauen!',
  invoice_email_subject: 'Rechnung {{number}}',
  invoice_email_body:
    'Sehr geehrte/r {{customer_name}},\n\nanbei erhalten Sie Rechnung {{number}} über {{gross_amount}} €.\n\nBitte überweisen Sie den Betrag bis {{due_date}} unter Angabe des Verwendungszwecks „{{payment_reference}}".\n\nMit freundlichen Grüßen\n{{seller_name}}',
};

const rechnungsResults = await Promise.all(RECHNUNG_KEYS.map(k => getSiteSetting(BRAND, k)));
const rechnungsvorlagen = Object.fromEntries(
  RECHNUNG_KEYS.map((k, i) => [k, rechnungsResults[i] ?? RECHNUNG_DEFAULTS[k]])
) as Record<typeof RECHNUNG_KEYS[number], string>;
```

Dann im Template: `<InhalteEditor client:load {initialData} {rechnungsvorlagen} />`

- [ ] **Schritt A-7.4: `InhalteEditor.svelte` — Tab „Rechnungen" ergänzen**

```svelte
<!-- Ergänzungen in InhalteEditor.svelte -->

<!-- 1. Import hinzufügen (oben im <script>): -->
import RechnungsvorlagenSection from './inhalte/RechnungsvorlagenSection.svelte';

<!-- 2. Prop-Typ erweitern: -->
let { initialData, rechnungsvorlagen }: { initialData: InitialData; rechnungsvorlagen: RechnungsvorlagenData } = $props();

<!-- 3. PrimaryTab-Typ erweitern: -->
type PrimaryTab = 'website' | 'newsletter' | 'fragebogen' | 'vertraege' | 'rechnungen';

<!-- 4. Tab-Button in der primären Tab-Leiste hinzufügen (nach dem Verträge-Button): -->
<button onclick={() => switchTab('rechnungen')} class={tabBtnCls(activeTab === 'rechnungen')}>🧾 Rechnungen</button>

<!-- 5. Content-Bereich ergänzen (nach dem vertraege-Block): -->
{:else if activeTab === 'rechnungen'}
  <div class="pt-6 pb-20">
    <RechnungsvorlagenSection initialData={rechnungsvorlagen} />
  </div>
```

- [ ] **Schritt A-7.5: `invoice-pdf.ts` — §19-Text und Intro aus DB lesen**

In `generateInvoicePdf` einen optionalen `templateTexts`-Parameter hinzufügen:

```typescript
// In invoice-pdf.ts — Interface erweitern:
export interface InvoicePdfTemplateTexts {
  introText?: string;
  kleinunternehmerNotice?: string;
  outroText?: string;
}

// generateInvoicePdf-Signatur erweitern:
export async function generateInvoicePdf(p: {
  invoice: Invoice; lines: InvoicePdfLine[];
  customer: InvoicePdfCustomer; seller: InvoicePdfSeller;
  templateTexts?: InvoicePdfTemplateTexts;
}): Promise<Buffer>
```

Dann die hardcodierten Strings ersetzen:

```typescript
// Statt hardcoded "für folgende Leistungen...":
const introText = p.templateTexts?.introText ?? 'für folgende Leistungen stelle ich Ihnen in Rechnung:';

// Statt hardcoded §19-Text:
const kleinNote = p.templateTexts?.kleinunternehmerNotice ??
  'Kein Ausweis der Umsatzsteuer aufgrund der Anwendung der Kleinunternehmerregelung gemäß § 19 UStG.';

// Statt hardcoded Schlusstext (neu vor Footer):
const outroText = p.templateTexts?.outroText ?? '';
```

- [ ] **Schritt A-7.6: `[id]/send.ts` — E-Mail-Templates aus DB lesen und interpolieren**

```typescript
// In send.ts — nach dem getSiteSetting-Aufruf ergänzen:
const emailKeys = ['invoice_email_subject', 'invoice_email_body', 'invoice_intro_text',
                   'invoice_kleinunternehmer_notice', 'invoice_outro_text'] as const;
const emailVals = await Promise.all(emailKeys.map(k => getSiteSetting(brand, k)));
const tmpl = Object.fromEntries(emailKeys.map((k,i) => [k, emailVals[i] ?? '']));

function interpolate(t: string, vars: Record<string, string>) {
  return t.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

const vars = {
  number: finalized.number,
  gross_amount: finalized.grossAmount.toFixed(2).replace('.', ',') + ' €',
  due_date: finalized.dueDate.split('-').reverse().join('.'),
  payment_reference: finalized.paymentReference ?? finalized.number,
  customer_name: customer.name,
  seller_name: seller.name,
};

const emailSubject = interpolate(
  tmpl.invoice_email_subject || 'Rechnung {{number}}', vars
);
const emailBody = interpolate(
  tmpl.invoice_email_body ||
  'Sehr geehrte/r {{customer_name}},\n\nanbei Rechnung {{number}} über {{gross_amount}}.\n\nMit freundlichen Grüßen\n{{seller_name}}',
  vars
);

// templateTexts an generateInvoicePdf übergeben:
const pdf = await generateInvoicePdf({
  invoice: finalized, lines, customer, seller,
  templateTexts: {
    introText: tmpl.invoice_intro_text || undefined,
    kleinunternehmerNotice: tmpl.invoice_kleinunternehmer_notice || undefined,
    outroText: tmpl.invoice_outro_text || undefined,
  },
});

await sendEmail({
  to: customer.email,
  subject: emailSubject,
  text: emailBody,
  attachments: [{ filename: `${finalized.number}.pdf`, content: pdf }],
});
```

- [ ] **Schritt A-7.7: Manuelle Browser-Verifikation**

```bash
task website:dev
# Browser: http://web.localhost/admin/inhalte → Tab „Rechnungen"
# Prüfe: Alle 5 Felder editierbar, Speichern-Button funktioniert
# Dann: Testrechnung erstellen, senden → PDF-Text und E-Mail-Text entsprechen den Vorlagen
```

- [ ] **Schritt A-7.8: Commit**

```bash
git add website/src/components/admin/inhalte/RechnungsvorlagenSection.svelte \
        website/src/components/admin/InhalteEditor.svelte \
        website/src/pages/admin/inhalte.astro \
        website/src/pages/api/admin/inhalte/rechnungsvorlagen/save.ts \
        website/src/lib/invoice-pdf.ts \
        website/src/pages/api/admin/billing/[id]/send.ts
git commit -m "feat(billing): Rechnungsvorlagen-Tab im InhalteEditor — editierbare Rechnungs- und E-Mail-Texte"
```

---

## Subsystem B — Steuer-Modus-Management

### Task B-1: `tax_mode`-Flag und 25k-Monitoring

**Files:**
- Create: `src/lib/tax-monitor.ts`
- Test: `src/lib/tax-monitor.test.ts`
- Modify: `website-db.ts` (neue Tabelle `tax_mode_changes`)

- [ ] **Schritt B-1.1: DB-Tabelle**

In `website-db.ts` nach `initBillingTables` hinzufügen:

```typescript
let taxModeTableReady = false;
export async function initTaxMonitorTables(): Promise<void> {
  if (taxModeTableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tax_mode_changes (
      id            BIGSERIAL PRIMARY KEY,
      brand         TEXT NOT NULL,
      changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      from_mode     TEXT NOT NULL,
      to_mode       TEXT NOT NULL,
      trigger_invoice_id TEXT,
      year_revenue_at_change NUMERIC(12,2),
      notes         TEXT
    )
  `);
  taxModeTableReady = true;
}
```

- [ ] **Schritt B-1.2: Failing Test**

```typescript
// src/lib/tax-monitor.test.ts
import { describe, it, expect } from 'vitest';
import { getYearRevenue, checkThreshold, TaxThresholdStatus } from './tax-monitor';

it('returns 0 revenue for empty brand', async () => {
  const r = await getYearRevenue('test-empty', 2025);
  expect(r).toBe(0);
});

it('correctly classifies threshold status', () => {
  expect(checkThreshold(0)).toBe(TaxThresholdStatus.Safe);
  expect(checkThreshold(20000)).toBe(TaxThresholdStatus.Warning);
  expect(checkThreshold(24999)).toBe(TaxThresholdStatus.Warning);
  expect(checkThreshold(25000)).toBe(TaxThresholdStatus.Exceeded);
  expect(checkThreshold(100001)).toBe(TaxThresholdStatus.HardExceeded);
});
```

- [ ] **Schritt B-1.3: Test ausführen — FAIL**

```bash
cd website && npx vitest run src/lib/tax-monitor.test.ts
```

- [ ] **Schritt B-1.4: `tax-monitor.ts` implementieren**

```typescript
// src/lib/tax-monitor.ts
import { pool, getSiteSetting, setSiteSetting, initTaxMonitorTables } from './website-db';

export enum TaxThresholdStatus {
  Safe = 'safe',           // < 20.000 €
  Warning = 'warning',     // 20.000 – 24.999 €
  Exceeded = 'exceeded',   // ≥ 25.000 € (sofortiger Wechsel)
  HardExceeded = 'hard',   // ≥ 100.000 € im laufenden Jahr
}

export const THRESHOLD_KLEIN   = 25_000;
export const THRESHOLD_WARNING = 20_000;
export const THRESHOLD_HARD    = 100_000;

export async function getTaxMode(brand: string): Promise<'kleinunternehmer' | 'regelbesteuerung'> {
  const v = await getSiteSetting(brand, 'tax_mode');
  return v === 'regelbesteuerung' ? 'regelbesteuerung' : 'kleinunternehmer';
}

export async function setTaxMode(brand: string, mode: 'kleinunternehmer' | 'regelbesteuerung', opts?: {
  triggerInvoiceId?: string; yearRevenue?: number; notes?: string;
}): Promise<void> {
  await initTaxMonitorTables();
  const current = await getTaxMode(brand);
  if (current === mode) return;
  await setSiteSetting(brand, 'tax_mode', mode);
  await pool.query(
    `INSERT INTO tax_mode_changes (brand, from_mode, to_mode, trigger_invoice_id, year_revenue_at_change, notes)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [brand, current, mode, opts?.triggerInvoiceId??null, opts?.yearRevenue??null, opts?.notes??null]
  );
}

// Kumulierter Netto-Jahresumsatz aus finalisierten Rechnungen
export async function getYearRevenue(brand: string, year: number): Promise<number> {
  await initTaxMonitorTables();
  const r = await pool.query(
    `SELECT COALESCE(SUM(net_amount), 0)::numeric AS total
     FROM invoices
     WHERE brand=$1 AND EXTRACT(YEAR FROM issue_date)=$2
       AND status IN ('open','paid')`,
    [brand, year]
  );
  return Number(r.rows[0].total);
}

export function checkThreshold(revenue: number): TaxThresholdStatus {
  if (revenue >= THRESHOLD_HARD)    return TaxThresholdStatus.HardExceeded;
  if (revenue >= THRESHOLD_KLEIN)   return TaxThresholdStatus.Exceeded;
  if (revenue >= THRESHOLD_WARNING) return TaxThresholdStatus.Warning;
  return TaxThresholdStatus.Safe;
}

// Prüft nach jeder Rechnung ob Wechsel nötig ist — aufrufen in finalizeInvoice
export async function checkAndApplyTaxModeSwitch(brand: string, invoiceId: string): Promise<boolean> {
  const year = new Date().getFullYear();
  const revenue = await getYearRevenue(brand, year);
  const status  = checkThreshold(revenue);
  if (status === TaxThresholdStatus.Exceeded || status === TaxThresholdStatus.HardExceeded) {
    const current = await getTaxMode(brand);
    if (current === 'kleinunternehmer') {
      await setTaxMode(brand, 'regelbesteuerung', {
        triggerInvoiceId: invoiceId, yearRevenue: revenue,
        notes: `Automatischer Wechsel: Jahresumsatz ${revenue.toFixed(2)} € ≥ ${THRESHOLD_KLEIN} € (§ 19 UStG 2025)`,
      });
      return true; // Wechsel erfolgt
    }
  }
  return false;
}

// UStVA-Export: Quartalsauswertung nach Steuersätzen
export async function getUstvaExport(brand: string, year: number, quarter?: number): Promise<{
  period: string; taxMode: string; revenue0: number; revenue7: number; revenue19: number;
  tax7: number; tax19: number; totalTax: number;
}> {
  const monthRange = quarter
    ? { start: (quarter-1)*3+1, end: quarter*3 }
    : { start: 1, end: 12 };
  const r = await pool.query(
    `SELECT tax_rate, SUM(net_amount) AS net, SUM(tax_amount) AS tax
     FROM invoices
     WHERE brand=$1 AND EXTRACT(YEAR FROM issue_date)=$2
       AND EXTRACT(MONTH FROM issue_date) BETWEEN $3 AND $4
       AND status IN ('open','paid')
     GROUP BY tax_rate`,
    [brand, year, monthRange.start, monthRange.end]
  );
  const period = quarter ? `Q${quarter}/${year}` : `${year}`;
  const byRate = Object.fromEntries(r.rows.map((row: {tax_rate:string;net:string;tax:string}) =>
    [row.tax_rate, { net: Number(row.net), tax: Number(row.tax) }]
  ));
  return {
    period,
    taxMode: await getTaxMode(brand),
    revenue0:  byRate['0']?.net  ?? 0,
    revenue7:  byRate['7']?.net  ?? 0,
    revenue19: byRate['19']?.net ?? 0,
    tax7:   byRate['7']?.tax  ?? 0,
    tax19:  byRate['19']?.tax ?? 0,
    totalTax: (byRate['7']?.tax ?? 0) + (byRate['19']?.tax ?? 0),
  };
}
```

- [ ] **Schritt B-1.5: `setSiteSetting` in `website-db.ts` prüfen/hinzufügen**

Sicherstellen dass `setSiteSetting(brand, key, value)` existiert (analoge zu `getSiteSetting`). Wenn nicht vorhanden:

```typescript
export async function setSiteSetting(brand: string, key: string, value: string): Promise<void> {
  await pool.query(
    `INSERT INTO site_settings (brand, key, value)
     VALUES ($1,$2,$3)
     ON CONFLICT (brand, key) DO UPDATE SET value=EXCLUDED.value`,
    [brand, key, value]
  );
}
```

- [ ] **Schritt B-1.6: Test ausführen — PASS**

```bash
cd website && npx vitest run src/lib/tax-monitor.test.ts
```

- [ ] **Schritt B-1.7: `checkAndApplyTaxModeSwitch` in `finalizeInvoice` aufrufen**

In `native-billing.ts`, in `finalizeInvoice` nach der DB-Update-Query:

```typescript
import { checkAndApplyTaxModeSwitch } from './tax-monitor';
// Am Ende von finalizeInvoice, nach pool.query:
await checkAndApplyTaxModeSwitch(inv.brand, id);
```

- [ ] **Schritt B-1.8: Commit**

```bash
git add website/src/lib/tax-monitor.ts website/src/lib/tax-monitor.test.ts website/src/lib/website-db.ts website/src/lib/native-billing.ts
git commit -m "feat(tax): §19 tax mode monitoring — 25k threshold, automatic switch on finalize"
```

---

### Task B-2: Admin Dashboard — TaxMonitor-Widget

**Files:**
- Create: `src/components/admin/TaxMonitorWidget.svelte`
- Modify: `src/pages/admin/rechnungen.astro`
- Create: `src/pages/api/admin/tax-monitor/status.ts`

- [ ] **Schritt B-2.1: API-Route**

```typescript
// src/pages/api/admin/tax-monitor/status.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getYearRevenue, checkThreshold, getTaxMode, THRESHOLD_KLEIN, THRESHOLD_WARNING } from '../../../../lib/tax-monitor';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const brand = process.env.BRAND || 'mentolder';
  const year  = new Date().getFullYear();
  const [revenue, taxMode] = await Promise.all([
    getYearRevenue(brand, year), getTaxMode(brand)
  ]);
  const status = checkThreshold(revenue);
  return new Response(JSON.stringify({
    year, revenue, taxMode, status,
    thresholdWarning: THRESHOLD_WARNING, thresholdKlein: THRESHOLD_KLEIN,
    percentToLimit: Math.min(100, (revenue / THRESHOLD_KLEIN) * 100),
  }), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Schritt B-2.2: `TaxMonitorWidget.svelte`**

```svelte
<!-- src/components/admin/TaxMonitorWidget.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  let status: any = null;
  onMount(async () => {
    const r = await fetch('/api/admin/tax-monitor/status');
    status = await r.json();
  });
  $: pct = status ? Math.min(100, (status.revenue / status.thresholdKlein) * 100) : 0;
  $: color = !status ? '#888'
    : status.status === 'exceeded' || status.status === 'hard' ? '#ef4444'
    : status.status === 'warning' ? '#f59e0b' : '#22c55e';
  const fmt = (n: number) => n?.toFixed(2).replace('.', ',') + ' €';
</script>

{#if status}
<div class="tax-widget" style="border-color: {color}33;">
  <div class="tax-header">
    <span class="tax-label">Jahresumsatz {status.year}</span>
    <span class="tax-mode" style="color:{color}">
      {status.taxMode === 'kleinunternehmer' ? '§ 19 UStG' : 'Regelbesteuerung'}
    </span>
  </div>
  <div class="tax-amounts">
    <span class="tax-current" style="color:{color}">{fmt(status.revenue)}</span>
    <span class="tax-limit">von {fmt(status.thresholdKlein)}</span>
  </div>
  <div class="tax-bar-bg">
    <div class="tax-bar-fill" style="width:{pct}%; background:{color};"></div>
  </div>
  {#if status.status === 'warning'}
    <p class="tax-alert" style="color:#f59e0b;">⚠ Näherung an 25.000 €-Grenze (§ 19 UStG). Steuerberater informieren.</p>
  {:else if status.status === 'exceeded'}
    <p class="tax-alert" style="color:#ef4444;">🚨 25.000 €-Grenze überschritten — System auf Regelbesteuerung umgestellt. Finanzamt informieren, USt-IdNr. beantragen.</p>
  {:else if status.status === 'hard'}
    <p class="tax-alert" style="color:#ef4444;">🚨 100.000 €-Grenze überschritten — Pflicht zur sofortigen Regelbesteuerung.</p>
  {/if}
</div>
{/if}

<style>
.tax-widget { border: 1px solid; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem; background: rgba(255,255,255,0.02); }
.tax-header { display: flex; justify-content: space-between; margin-bottom: 0.25rem; }
.tax-label { font-family: var(--font-mono); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--mute-2); }
.tax-mode { font-family: var(--font-mono); font-size: 0.75rem; font-weight: 600; }
.tax-amounts { display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.5rem; }
.tax-current { font-size: 1.5rem; font-weight: 700; font-family: var(--font-mono); }
.tax-limit { font-size: 0.75rem; color: var(--mute); }
.tax-bar-bg { height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; }
.tax-bar-fill { height: 100%; border-radius: 3px; transition: width 0.5s; }
.tax-alert { font-size: 0.75rem; margin-top: 0.5rem; }
</style>
```

- [ ] **Schritt B-2.3: Widget in `rechnungen.astro` einbinden**

```astro
---
// Neue Import-Zeile:
import TaxMonitorWidget from '../../components/admin/TaxMonitorWidget.svelte';
---
<!-- Im Body direkt über der Rechnungsliste: -->
<TaxMonitorWidget client:load />
```

- [ ] **Schritt B-2.4: Browser-Test**

```bash
task website:dev
# Browser: http://web.localhost/admin/rechnungen
# Prüfe: Grüner Balken bei 0 € Umsatz
# Prüfe: In DB manuell UPDATE invoices SET net_amount=22000 WHERE brand='mentolder'
# → Widget soll auf Orange/Warning springen
```

- [ ] **Schritt B-2.5: Commit**

```bash
git add website/src/components/admin/TaxMonitorWidget.svelte website/src/pages/admin/rechnungen.astro website/src/pages/api/admin/tax-monitor/
git commit -m "feat(tax): admin dashboard TaxMonitor widget — 25k threshold with visual indicator"
```

---

### Task B-3: UStVA-Export (Quartalsbericht)

**Files:**
- Create: `src/pages/api/admin/tax-monitor/ustvaexport.ts`
- Create: `src/pages/admin/steuer.astro`

- [ ] **Schritt B-3.1: API-Route**

```typescript
// src/pages/api/admin/tax-monitor/ustvaexport.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getUstvaExport } from '../../../../lib/tax-monitor';

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const brand   = process.env.BRAND || 'mentolder';
  const year    = parseInt(url.searchParams.get('year') ?? String(new Date().getFullYear()));
  const quarter = url.searchParams.get('quarter') ? parseInt(url.searchParams.get('quarter')!) : undefined;
  const data    = await getUstvaExport(brand, year, quarter);
  const format  = url.searchParams.get('format') ?? 'json';
  if (format === 'csv') {
    const csv = [
      'Periode;Steuer-Modus;Umsatz 0%;Umsatz 7%;Umsatz 19%;USt 7%;USt 19%;USt gesamt',
      `${data.period};${data.taxMode};${data.revenue0.toFixed(2)};${data.revenue7.toFixed(2)};${data.revenue19.toFixed(2)};${data.tax7.toFixed(2)};${data.tax19.toFixed(2)};${data.totalTax.toFixed(2)}`
    ].join('\n');
    return new Response(csv, {
      headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="ustva-${data.period}.csv"` }
    });
  }
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Schritt B-3.2: Steuer-Admin-Seite**

```astro
---
// src/pages/admin/steuer.astro
import AdminLayout from '../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
import { getUstvaExport, getTaxMode } from '../../lib/tax-monitor';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

const brand   = process.env.BRAND || 'mentolder';
const year    = new Date().getFullYear();
const taxMode = await getTaxMode(brand);
const quarters = await Promise.all([1,2,3,4].map(q => getUstvaExport(brand, year, q)));
---

<AdminLayout title="Steuerauswertung">
  <div style="padding:2rem;max-width:720px;">
    <h1 style="font-family:var(--font-serif);font-size:1.5rem;color:var(--fg);margin-bottom:0.25rem;">Steuerauswertung {year}</h1>
    <p style="color:var(--mute);font-size:0.875rem;margin-bottom:2rem;">
      Aktueller Modus: <strong>{taxMode === 'kleinunternehmer' ? '§ 19 UStG (Kleinunternehmer)' : 'Regelbesteuerung'}</strong>
    </p>
    {quarters.map(q => (
      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--line);border-radius:8px;padding:1rem;margin-bottom:1rem;">
        <p style="font-family:var(--font-mono);font-size:0.75rem;text-transform:uppercase;color:var(--mute-2);margin-bottom:0.5rem;">{q.period}</p>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.5rem;font-size:0.875rem;">
          <div><span style="color:var(--mute);">Umsatz 0%</span><br/>{q.revenue0.toFixed(2)} €</div>
          <div><span style="color:var(--mute);">Umsatz 19%</span><br/>{q.revenue19.toFixed(2)} €</div>
          <div><span style="color:var(--mute);">USt 19%</span><br/>{q.tax19.toFixed(2)} €</div>
        </div>
        <a href={`/api/admin/tax-monitor/ustvaexport?year=${year}&quarter=${q.period.split('/')[0].replace('Q','')}&format=csv`}
           style="font-size:0.75rem;color:var(--brass);text-decoration:none;margin-top:0.5rem;display:inline-block;">
          CSV exportieren ↓
        </a>
      </div>
    ))}
  </div>
</AdminLayout>
```

- [ ] **Schritt B-3.3: Commit**

```bash
git add website/src/pages/api/admin/tax-monitor/ustvaexport.ts website/src/pages/admin/steuer.astro
git commit -m "feat(tax): UStVA quarterly export — JSON and CSV download per quarter"
```

---

## Subsystem C — EÜR-Buchhaltungsmodul

### Task C-1: Buchungsjournal-Schema und Basis-CRUD

**Files:**
- Modify: `src/lib/website-db.ts` (neue Tabellen `eur_bookings`, `assets`)
- Create: `src/lib/eur-bookkeeping.ts`
- Test: `src/lib/eur-bookkeeping.test.ts`

- [ ] **Schritt C-1.1: DB-Tabellen in `website-db.ts`**

```typescript
let eurTablesReady = false;
export async function initEurTables(): Promise<void> {
  if (eurTablesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS eur_bookings (
      id            BIGSERIAL PRIMARY KEY,
      brand         TEXT NOT NULL,
      booking_date  DATE NOT NULL,
      type          TEXT NOT NULL,
      category      TEXT NOT NULL,
      description   TEXT NOT NULL,
      net_amount    NUMERIC(12,2) NOT NULL,
      vat_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
      invoice_id    TEXT REFERENCES invoices(id),
      receipt_path  TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assets (
      id                   BIGSERIAL PRIMARY KEY,
      brand                TEXT NOT NULL,
      description          TEXT NOT NULL,
      purchase_date        DATE NOT NULL,
      net_purchase_price   NUMERIC(12,2) NOT NULL,
      vat_paid             NUMERIC(12,2) NOT NULL,
      useful_life_months   INT NOT NULL,
      correction_start_date DATE,
      is_gwg               BOOLEAN NOT NULL DEFAULT false,
      receipt_path         TEXT,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  eurTablesReady = true;
}
```

- [ ] **Schritt C-1.2: Failing Test**

```typescript
// src/lib/eur-bookkeeping.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { initEurTables } from './website-db';
import { addBooking, getEurSummary } from './eur-bookkeeping';

beforeAll(async () => { await initEurTables(); });

it('adds income booking and reflects in summary', async () => {
  await addBooking({
    brand:'test', bookingDate:'2025-09-01', type:'income',
    category:'coaching', description:'Coaching Max', netAmount:60, vatAmount:0,
  });
  const s = await getEurSummary('test', 2025);
  expect(s.totalIncome).toBeGreaterThanOrEqual(60);
  expect(s.profit).toBe(s.totalIncome - s.totalExpenses);
});
```

- [ ] **Schritt C-1.3: `eur-bookkeeping.ts` implementieren**

```typescript
// src/lib/eur-bookkeeping.ts
import { pool, initEurTables } from './website-db';

export interface EurBooking {
  id: number; brand: string; bookingDate: string; type: string;
  category: string; description: string; netAmount: number;
  vatAmount: number; invoiceId?: string; receiptPath?: string;
}

export async function addBooking(p: Omit<EurBooking, 'id'>): Promise<EurBooking> {
  await initEurTables();
  const r = await pool.query(
    `INSERT INTO eur_bookings (brand,booking_date,type,category,description,net_amount,vat_amount,invoice_id,receipt_path)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [p.brand, p.bookingDate, p.type, p.category, p.description,
     p.netAmount, p.vatAmount, p.invoiceId??null, p.receiptPath??null]
  );
  return mapBooking(r.rows[0]);
}

export interface EurSummary {
  year: number; totalIncome: number; totalExpenses: number;
  totalVatCollected: number; totalPretax: number; profit: number;
}

export async function getEurSummary(brand: string, year: number): Promise<EurSummary> {
  await initEurTables();
  const r = await pool.query(
    `SELECT type, SUM(net_amount) AS net, SUM(vat_amount) AS vat
     FROM eur_bookings
     WHERE brand=$1 AND EXTRACT(YEAR FROM booking_date)=$2
     GROUP BY type`,
    [brand, year]
  );
  const byType: Record<string, { net: number; vat: number }> = {};
  for (const row of r.rows) byType[row.type] = { net: Number(row.net), vat: Number(row.vat) };
  const income   = (byType['income']?.net ?? 0) + (byType['vat_refund']?.net ?? 0);
  const expenses = (byType['expense']?.net ?? 0) + (byType['pretax']?.net ?? 0) + (byType['vat_payment']?.net ?? 0);
  return {
    year, totalIncome: income, totalExpenses: expenses,
    totalVatCollected: byType['income']?.vat ?? 0,
    totalPretax: byType['pretax']?.net ?? 0,
    profit: income - expenses,
  };
}

function mapBooking(row: Record<string, unknown>): EurBooking {
  return {
    id: Number(row.id), brand: row.brand as string,
    bookingDate: String(row.booking_date).split('T')[0],
    type: row.type as string, category: row.category as string,
    description: row.description as string,
    netAmount: Number(row.net_amount), vatAmount: Number(row.vat_amount),
    invoiceId: (row.invoice_id as string) ?? undefined,
    receiptPath: (row.receipt_path as string) ?? undefined,
  };
}
```

- [ ] **Schritt C-1.4: Test ausführen — PASS**

```bash
cd website && npx vitest run src/lib/eur-bookkeeping.test.ts
```

- [ ] **Schritt C-1.5: Auto-Buchung bei Rechnungsversand**

In `native-billing.ts`, in `finalizeInvoice` nach dem Steuer-Switch-Check:

```typescript
import { addBooking } from './eur-bookkeeping';
// Nach checkAndApplyTaxModeSwitch:
const finalized = /* ... */ r.rows[0];
await addBooking({
  brand:       finalized.brand,
  bookingDate: finalized.issue_date,
  type:        'income',
  category:    'rechnungsstellung',
  description: `Rechnung ${finalized.number}`,
  netAmount:   Number(finalized.net_amount),
  vatAmount:   Number(finalized.tax_amount),
  invoiceId:   finalized.id,
});
```

- [ ] **Schritt C-1.6: Commit**

```bash
git add website/src/lib/eur-bookkeeping.ts website/src/lib/eur-bookkeeping.test.ts website/src/lib/website-db.ts website/src/lib/native-billing.ts
git commit -m "feat(eur): EÜR booking journal — schema, CRUD, auto-booking on invoice finalize"
```

---

### Task C-2: Vorsteuerberichtigung § 15a UStG

**Files:**
- Modify: `src/lib/eur-bookkeeping.ts` (Asset-Funktionen)
- Test: `src/lib/eur-bookkeeping.test.ts`

- [ ] **Schritt C-2.1: Failing Test**

```typescript
// In eur-bookkeeping.test.ts anfügen:
import { addAsset, calculateSection15aCorrection } from './eur-bookkeeping';

it('§15a: calculates 4/5 correction for laptop switching in year 2 of 5', async () => {
  const asset = await addAsset({
    brand:'test',
    description:'Laptop', purchaseDate:'2025-01-15',
    netPurchasePrice:1000, vatPaid:190,
    usefulLifeMonths:60,
  });
  // Wechsel zur Regelbesteuerung 12 Monate nach Kauf
  const result = calculateSection15aCorrection(asset, new Date('2026-01-15'));
  // 190 € * (48/60) = 152 €
  expect(result.eligible).toBe(true);
  expect(result.correctionAmount).toBeCloseTo(152, 1);
});

it('§15a: below 1000€ Vorsteuer threshold — not eligible', async () => {
  const asset = await addAsset({
    brand:'test', description:'Maus', purchaseDate:'2025-01-15',
    netPurchasePrice:50, vatPaid:9.5, usefulLifeMonths:60,
  });
  const result = calculateSection15aCorrection(asset, new Date('2026-01-15'));
  expect(result.eligible).toBe(false); // < 1.000 € Vorsteuer
});
```

- [ ] **Schritt C-2.2: Test ausführen — FAIL**

```bash
cd website && npx vitest run src/lib/eur-bookkeeping.test.ts
```

- [ ] **Schritt C-2.3: Asset-Funktionen implementieren**

In `eur-bookkeeping.ts` hinzufügen:

```typescript
export interface Asset {
  id: number; brand: string; description: string; purchaseDate: string;
  netPurchasePrice: number; vatPaid: number; usefulLifeMonths: number;
  correctionStartDate?: string; isGwg: boolean;
}

export async function addAsset(p: Omit<Asset, 'id'>): Promise<Asset> {
  await initEurTables();
  const r = await pool.query(
    `INSERT INTO assets (brand,description,purchase_date,net_purchase_price,vat_paid,useful_life_months,correction_start_date,is_gwg)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [p.brand, p.description, p.purchaseDate, p.netPurchasePrice, p.vatPaid,
     p.usefulLifeMonths, p.correctionStartDate??null, p.isGwg??false]
  );
  return mapAsset(r.rows[0]);
}

// § 44 UStDV: Bagatellgrenze — Vorsteuer muss > 1.000 € sein
const SECTION_15A_THRESHOLD = 1_000;

export interface Section15aResult {
  eligible: boolean; reason?: string;
  correctionAmount: number; remainingMonths: number;
}

export function calculateSection15aCorrection(asset: Asset, switchDate: Date): Section15aResult {
  if (asset.vatPaid <= SECTION_15A_THRESHOLD) {
    return { eligible: false, reason: `Vorsteuer (${asset.vatPaid} €) ≤ ${SECTION_15A_THRESHOLD} € Bagatellgrenze (§ 44 UStDV)`, correctionAmount: 0, remainingMonths: 0 };
  }
  const purchase = new Date(asset.purchaseDate);
  const elapsedMonths = Math.floor((switchDate.getTime() - purchase.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  const remainingMonths = Math.max(0, asset.usefulLifeMonths - elapsedMonths);
  if (remainingMonths === 0) {
    return { eligible: false, reason: 'Berichtigungszeitraum abgelaufen', correctionAmount: 0, remainingMonths: 0 };
  }
  // Formel: VB = (V_gesamt / T_gesamt) * T_verbleibend
  const correctionAmount = (asset.vatPaid / asset.usefulLifeMonths) * remainingMonths;
  return { eligible: true, correctionAmount: Math.round(correctionAmount * 100) / 100, remainingMonths };
}

function mapAsset(row: Record<string, unknown>): Asset {
  return {
    id: Number(row.id), brand: row.brand as string,
    description: row.description as string,
    purchaseDate: String(row.purchase_date).split('T')[0],
    netPurchasePrice: Number(row.net_purchase_price),
    vatPaid: Number(row.vat_paid),
    usefulLifeMonths: Number(row.useful_life_months),
    correctionStartDate: row.correction_start_date ? String(row.correction_start_date).split('T')[0] : undefined,
    isGwg: Boolean(row.is_gwg),
  };
}
```

- [ ] **Schritt C-2.4: Test ausführen — PASS**

```bash
cd website && npx vitest run src/lib/eur-bookkeeping.test.ts
```

- [ ] **Schritt C-2.5: Commit**

```bash
git add website/src/lib/eur-bookkeeping.ts website/src/lib/eur-bookkeeping.test.ts
git commit -m "feat(eur): §15a Vorsteuerberichtigung — asset tracking and correction calculator"
```

---

### Task C-3: Gewerbesteuer-Kalkulator

**Files:**
- Modify: `src/lib/eur-bookkeeping.ts`
- Test: `src/lib/eur-bookkeeping.test.ts`

- [ ] **Schritt C-3.1: Failing Test**

```typescript
// In eur-bookkeeping.test.ts:
import { calculateGewerbesteuer } from './eur-bookkeeping';

it('Gewerbesteuer Lübbecke — 50.000 € Gewinn', () => {
  const result = calculateGewerbesteuer({ profit: 50_000, hebesatz: 417 });
  // Gewerbeertrag: 50.000 - 24.500 Freibetrag = 25.500
  // Messbetrag: 25.500 * 3,5% = 892,50
  // GewSt: 892,50 * 417% = 3.721,73
  expect(result.gewerbeertrag).toBe(25_500);
  expect(result.messbetrag).toBeCloseTo(892.50, 1);
  expect(result.gewerbesteuer).toBeCloseTo(3721.73, 0);
});

it('Gewerbesteuer — below Freibetrag', () => {
  const result = calculateGewerbesteuer({ profit: 20_000, hebesatz: 417 });
  expect(result.gewerbesteuer).toBe(0);
});
```

- [ ] **Schritt C-3.2: Test ausführen — FAIL**

```bash
cd website && npx vitest run src/lib/eur-bookkeeping.test.ts
```

- [ ] **Schritt C-3.3: Implementierung hinzufügen**

```typescript
const GEWST_FREIBETRAG    = 24_500;   // § 11 GewStG — nur für Einzelunternehmen/Personenges.
const GEWST_STEUERMESSZAHL = 0.035;  // 3,5 % Bundeseinheitlich

export interface GewerbesteuerResult {
  gewerbeertrag: number; messbetrag: number; gewerbesteuer: number;
  anrechenbareGewerbesteuer: number; // 4,0-facher Messbetrag, §35 EStG
}

export function calculateGewerbesteuer(p: {
  profit: number;
  hinzurechnungen?: number;
  kuerzungen?: number;
  hebesatz: number;          // z.B. 417 für Lübbecke
  isKapitalgesellschaft?: boolean;
}): GewerbesteuerResult {
  const freibetrag = p.isKapitalgesellschaft ? 0 : GEWST_FREIBETRAG;
  const rawErtrag  = p.profit + (p.hinzurechnungen ?? 0) - (p.kuerzungen ?? 0);
  const gewerbeertrag = Math.max(0, rawErtrag - freibetrag);
  // Abrundung auf volle 100 € (§ 11 Abs. 1 S. 3 GewStG)
  const gewerbeertragRounded = Math.floor(gewerbeertrag / 100) * 100;
  const messbetrag      = Math.round(gewerbeertragRounded * GEWST_STEUERMESSZAHL * 100) / 100;
  const gewerbesteuer   = Math.round(messbetrag * (p.hebesatz / 100) * 100) / 100;
  // § 35 EStG: Anrechnung = 4,0 × Messbetrag (Entlastung bei Einkommensteuer)
  const anrechenbareGewerbesteuer = messbetrag * 4.0;
  return { gewerbeertrag: gewerbeertragRounded, messbetrag, gewerbesteuer, anrechenbareGewerbesteuer };
}
```

- [ ] **Schritt C-3.4: Test ausführen — PASS**

```bash
cd website && npx vitest run src/lib/eur-bookkeeping.test.ts
```

- [ ] **Schritt C-3.5: Commit**

```bash
git add website/src/lib/eur-bookkeeping.ts website/src/lib/eur-bookkeeping.test.ts
git commit -m "feat(eur): Gewerbesteuer-Kalkulator — Lübbecke Hebesatz 417%, §35 EStG Anrechnung"
```

---

### Task C-4: Admin EÜR-Seite

**Files:**
- Create: `src/pages/admin/buchhaltung.astro`
- Create: `src/components/admin/EurReport.svelte`
- Create: `src/pages/api/admin/bookkeeping/summary.ts`

- [ ] **Schritt C-4.1: API-Route**

```typescript
// src/pages/api/admin/bookkeeping/summary.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getEurSummary } from '../../../../lib/eur-bookkeeping';

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const brand = process.env.BRAND || 'mentolder';
  const year  = parseInt(url.searchParams.get('year') ?? String(new Date().getFullYear()));
  const data  = await getEurSummary(brand, year);
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Schritt C-4.2: `EurReport.svelte`**

```svelte
<!-- src/components/admin/EurReport.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  export let year: number = new Date().getFullYear();
  let data: any = null;
  onMount(async () => {
    const r = await fetch(`/api/admin/bookkeeping/summary?year=${year}`);
    data = await r.json();
  });
  const fmt = (n: number) => (n ?? 0).toFixed(2).replace('.', ',') + ' €';
</script>

{#if data}
<div class="eur-card">
  <h3 class="eur-title">EÜR {data.year}</h3>
  <div class="eur-grid">
    <div class="eur-row"><span>Betriebseinnahmen</span><strong>{fmt(data.totalIncome)}</strong></div>
    <div class="eur-row"><span>Betriebsausgaben</span><strong>{fmt(data.totalExpenses)}</strong></div>
    <div class="eur-row eur-total"><span>Gewinn / Verlust</span><strong style="color:{data.profit>=0?'#22c55e':'#ef4444'}">{fmt(data.profit)}</strong></div>
    <div class="eur-row"><span>Vereinnahmte USt</span><span>{fmt(data.totalVatCollected)}</span></div>
    <div class="eur-row"><span>Gezahlte Vorsteuer</span><span>{fmt(data.totalPretax)}</span></div>
  </div>
</div>
{/if}

<style>
.eur-card { background:rgba(255,255,255,0.03); border:1px solid var(--line); border-radius:8px; padding:1.25rem; }
.eur-title { font-family:var(--font-serif); font-size:1rem; color:var(--fg); margin-bottom:0.75rem; }
.eur-grid { display:flex; flex-direction:column; gap:0.375rem; }
.eur-row { display:flex; justify-content:space-between; font-size:0.875rem; color:var(--mute); }
.eur-row strong { color:var(--fg); }
.eur-total { border-top:1px solid var(--line); padding-top:0.375rem; margin-top:0.25rem; font-weight:600; }
</style>
```

- [ ] **Schritt C-4.3: Buchhaltungs-Seite**

```astro
---
// src/pages/admin/buchhaltung.astro
import AdminLayout from '../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
import EurReport from '../../components/admin/EurReport.svelte';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');
const year = new Date().getFullYear();
---
<AdminLayout title="Buchhaltung / EÜR">
  <div style="padding:2rem;max-width:720px;">
    <h1 style="font-family:var(--font-serif);font-size:1.5rem;color:var(--fg);margin-bottom:2rem;">Buchhaltung / EÜR {year}</h1>
    <EurReport {year} client:load />
    <p style="margin-top:1.5rem;font-size:0.8rem;color:var(--mute-2);">
      Buchungen werden automatisch bei Rechnungsversand und -zahlung angelegt. Manuelle Ausgabenbuchungen können über die API ergänzt werden.
    </p>
  </div>
</AdminLayout>
```

- [ ] **Schritt C-4.4: Browser-Test**

```bash
task website:dev
# Browser: http://web.localhost/admin/buchhaltung
# Prüfe: EÜR-Karte mit 0 € Einnahmen und korrekt berechneten Werten
```

- [ ] **Schritt C-4.5: Commit**

```bash
git add website/src/pages/admin/buchhaltung.astro website/src/components/admin/EurReport.svelte website/src/pages/api/admin/bookkeeping/
git commit -m "feat(eur): EÜR admin page with live summary widget"
```

---

### Task C-5: Stripe-Dependency vollständig entfernen

**Files:**
- Delete (oder leeren): `src/lib/stripe-billing.ts` → wird zu Re-Export auf `native-billing.ts`
- Modify: `package.json` (stripe entfernen, wenn keine anderen Abhängigkeiten)
- Modify: Alle Importe die `stripe-billing` referenzieren

- [ ] **Schritt C-5.1: Abhängigkeiten prüfen**

```bash
cd website && grep -r "stripe" src/ --include="*.ts" --include="*.astro" --include="*.svelte" -l
```

- [ ] **Schritt C-5.2: Jede Datei prüfen und migrieren**

Für jede Datei die `stripe-billing` importiert:
- `getOrCreateCustomer` → `createCustomer` aus `native-billing`
- `createBillingInvoice` → `createInvoice` aus `native-billing`
- `getAllBillingInvoices` → native Query
- `getCustomerInvoices` → native Query
- etc.

- [ ] **Schritt C-5.3: stripe aus package.json entfernen (wenn kein anderer Code)**

```bash
cd website && npm uninstall stripe
```

- [ ] **Schritt C-5.4: Alle Tests laufen lassen**

```bash
cd website && npx vitest run
```

- [ ] **Schritt C-5.5: Commit**

```bash
git add -A
git commit -m "chore(billing): remove Stripe dependency — fully replaced by native PostgreSQL billing"
```

---

## Zusammenfassung der Anforderungen (Traceability)

| Anforderungs-ID | Umgesetzt in Task |
|-----------------|-------------------|
| A-01 Native DB   | A-1, A-2 |
| A-02 Klein-Pflichtangaben | A-3 (PDF), A-4 (ZUGFeRD) |
| A-03 Regelbesteuerung-Pflichtangaben | A-3, A-4 |
| A-04 Lückenlose Nummerierung | A-2 (via `getNextInvoiceNumber`) |
| A-05 SEPA auf Rechnung | A-3, A-6 |
| A-06 SEPA-Mandat | A-1 (Schema), spätere Erweiterung |
| A-07 PDF lokal | A-3 |
| A-08 ZUGFeRD E-Rechnung | A-4 |
| A-09 Revisionssicher | A-2 (`locked`-Flag) |
| A-10 10-Jahre-Aufbewahrung | A-1 (`retain_until`) |
| A-11 Stornorechnung | A-2 (`cancels_invoice_id`) |
| A-12 E-Mail-Versand | A-5 |
| A-13 Status-Workflow | A-2 |
| A-14 Zahlungseingang | A-2 (`markInvoicePaid`) |
| B-01 tax_mode-Flag | B-1 |
| B-02 25k-Überwachung | B-1 |
| B-03 Alert-Dashboard | B-2 |
| B-04 Sofortwechsel | B-1 |
| B-05 Template-Umschaltung | A-3, B-1 |
| B-06 100k-Grenze | B-1 |
| B-07 Protokollierung | B-1 (`tax_mode_changes`) |
| B-08 UStVA-Export | B-3 |
| B-09 Ist-Versteuerung | B-3 (in UStVA nur gezahlte Rechnungen) |
| B-10 Fristen | B-2 (Erweiterung möglich) |
| C-01 Buchungsjournal | C-1 |
| C-02 Auto-Buchung | C-1 |
| C-03 Vorsteuer-Trennung | C-1 |
| C-04 USt-Buchungen | C-1 |
| C-05 EÜR-Report | C-4 |
| C-06 § 15a Anlagevermögen | C-2 |
| C-07 Bagatellgrenze | C-2 |
| C-11 GewSt-Kalkulator | C-3 |

---

## Offene Punkte (spätere Iterationen)

- [ ] **SEPA-Lastschrift-Mandat UI** — Mandat-Formular im Kundenportal, Gläubiger-ID-Konfiguration
- [ ] **PDF/A-3 ZUGFeRD-Einbettung** — Vollständige Einbettung via `pdf-lib`, aktuell XML separat
- [ ] **Einkommensteuer-Vorauszahlungsrechner** (C-12) — schätzungsbasiert, nicht dringend
- [ ] **§ 7g EStG Sonderabschreibung** (C-10) — Bei Wachstum über 200k relevant
- [ ] **ELSTER-XML-Export** — Direktübermittlung, benötigt ELSTER-Protokoll-Dokumentation
- [ ] **Fristen-Dashboard** (B-10) — Termin-Kalender mit UStVA- und GewSt-Fristen
- [ ] **IHK-Beitragsberechnung** — Optional, Gründer-Staffelung automatisch
