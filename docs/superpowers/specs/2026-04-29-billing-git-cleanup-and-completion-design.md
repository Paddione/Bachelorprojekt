# Billing System — Git Cleanup & Feature Completion

**Status:** Design approved  
**Date:** 2026-04-29  
**Scope:** Sort out three diverged feature branches, commit orphaned work, and deliver all remaining billing modules (Plan B PR-B/C/D, Plan G PR-G2, ELSTER XML, §15a, GewSt-Kalkulator)  
**Delivery:** Four phases, ~10 PRs total

---

## 1. Goal

The billing system has partial implementations spread across three feature branches and ~12 untracked files sitting uncommitted on `main`. This design consolidates everything into a clean, sequenced set of PRs that covers the full billing lifecycle described in the system design document: invoice creation, partial payments (done), dunning, storno, prepayment/final-invoice, ZUGFeRD/XRechnung output (branch ready), DATEV/SEPA export (branch ready), supplier invoices, ELSTER XML generation, and tax-side calculators.

ELSTER ERiC transmission is deferred — the XML builder and stub UI land now; actual electronic submission is wired in once the software certificate arrives.

---

## 2. Current State

### 2.1 What is in `main`
- Plan A: GoBD compliance core (invoices, numbering, PDF, EÜR journal, tax monitor)
- PR-A Plan B: TEILBEZAHLT — payments ledger, `billing_invoice_payments`, EÜR-on-payment

### 2.2 Feature branches (all behind `main` due to Plan A/PR-A squash-merges)

| Branch | Commits ahead of main | Contents |
|--------|----------------------|---------|
| `feature/invoice-teilbezahlt` | 63 | SEPA pain.008, ECB rates, Kursdifferenz, VIES, Reverse Charge §13b, DATEV EXTF |
| `feature/billing-g1-customer-tax` | 64 | All of above up to `cf77ada` + billing-tax.ts helpers, land\_iso rename |
| `feature/zugferd-xrechnung-output` | 19 | ZUGFeRD/XRechnung PDF/A-3, Leitweg-ID, profile API — already based on current main |

`billing-g1-customer-tax` diverged from `invoice-teilbezahlt` at commit `cf77ada`. It has 6 unique commits. `invoice-teilbezahlt` has 5 unique commits after that point.

### 2.3 Orphaned files on `main` (untracked, uncommitted)

| File | Status | Destination |
|------|--------|-------------|
| `website/src/lib/billing-tax.ts` | Newer than branch version (adds `deriveSupplyType()`) | Cherry-pick onto `billing-g1-customer-tax` after rebase |
| `website/src/pages/api/admin/billing/create-monthly-invoices.ts` | Exists in branch, main version may differ | Same |
| `website/src/pages/api/admin/billing/datev-email.ts` | Exists in branch | Same |
| `website/src/pages/api/admin/billing/integrity-check.ts` | Exists in branch | Same |
| `website/src/pages/api/admin/billing/draft-count.ts` | Exists in branch | Same |
| `website/src/pages/api/admin/billing/drafts.ts` | Exists in branch | Same |
| `website/src/lib/billing-archive.ts` | Net-new, in no branch | Own PR (Phase 3) |
| `website/src/lib/invoice-dunning.ts` | Net-new, in no branch | PR-B (Phase 2) |
| `website/src/lib/invoice-storno.ts` | Net-new, in no branch | PR-C (Phase 2) |
| `website/src/pages/api/admin/billing/create-invoice.ts` | Net-new, in no branch | PR-D (Phase 2) |

---

## 3. Phase 0 — Git Cleanup

### 3.1 Snapshot orphaned files
Create `feature/billing-orphaned-work` from current `main`. Commit all untracked files into it. This makes them safe before any rebase.

### 3.2 Rebase `feature/invoice-teilbezahlt` onto main
```
git rebase main feature/invoice-teilbezahlt
```
Git drops commits whose patches are already present in main (Plan A squash = `a0d220a`, PR-A squash = `f8bf9da`). Expected result: ~55–58 commits remain covering SEPA, ECB, DATEV, VIES, Reverse Charge. Force-push to origin.

### 3.3 Rebase `feature/billing-g1-customer-tax`
Rebase its 6 unique commits onto the new tip of rebased `feature/invoice-teilbezahlt`. Then cherry-pick the updated-file group from the orphaned snapshot (billing-tax.ts with `deriveSupplyType`, datev-email, integrity-check, draft-count, drafts, create-monthly-invoices). Force-push (local-only branch, no remote risk).

### 3.4 `feature/zugferd-xrechnung-output` — no action
Already based on current `main` (`013511f`). Leave as-is.

### 3.5 Remove stale worktrees
```
git worktree remove .worktrees/billing-g1-customer-tax
git worktree remove .worktrees/zugferd-xrechnung
```

---

## 4. Phase 1 — Merge Existing Branches (3 PRs)

### PR-1: `feature/invoice-teilbezahlt` → main

Net-new after rebase:

| Feature | Key files |
|---------|-----------|
| ECB EUR exchange rate lookup | `website/src/lib/ecb-rates.ts` |
| `currency` + `supply_type` on `billing_invoices` | migration in `native-billing.ts` |
| Kursdifferenz booking on payment | `eur-bookkeeping.ts` |
| SEPA pain.008.001.02 XML export | `website/src/lib/sepa-pain008.ts` |
| SEPA mandate validation + creditor env vars | `k3d/secrets.yaml`, `k3d/website.yaml` |
| VIES qualifizierte Bestätigung | `website/src/lib/vies.ts` |
| Reverse charge enforcement + §13b PDF notice | `invoice-pdf.ts`, `native-billing.ts` |
| DATEV EXTF export | `website/src/lib/datev-extf.ts` |
| SKR mappings EU B2B / export / Kursdifferenz | `eur-bookkeeping.ts` |

### PR-2: `feature/billing-g1-customer-tax` → main (after PR-1)

| Feature | Key files |
|---------|-----------|
| `billing_customers.country` → `land_iso` migration | DB migration in `native-billing.ts` |
| `typ` column + widened UNIQUE constraint | same |
| `billing-tax.ts`: `resolveCustomerTaxCategory()`, `isVorsteuerEligible()`, `deriveSupplyType()` | `website/src/lib/billing-tax.ts` |
| `CreateInvoiceModal` auto-fill tax category | frontend component |
| `InvoicePdfCustomer.landIso` type fix | `invoice-pdf.ts` |
| Updated admin endpoints (datev-email, integrity-check, draft-count, drafts) | `pages/api/admin/billing/` |

### PR-3: `feature/zugferd-xrechnung-output` → main (independent; after PR-1)

| Feature | Key files |
|---------|-----------|
| E-invoice profile dispatcher | `website/src/lib/einvoice-dispatcher.ts` |
| `leitweg_id` on `billing_customers` | DB migration |
| Leitweg-ID validation (KoSIT 2.0.2) | `website/src/lib/leitweg-id.ts` |
| XRechnung 3.0 CII D16B generator | `website/src/lib/xrechnung-cii.ts` |
| XRechnung 3.0 UBL 2.1 generator | `website/src/lib/xrechnung-ubl.ts` |
| Mustang conformance fixes (BT-23/34/49, BG-6) | einvoice-sidecar Java |
| PDF/A-3 post-processor (XMP + OutputIntent) | `website/src/lib/pdfa3-embedder.ts` |
| API `GET /api/billing/invoice/:id/pdf?profile=…` | `pages/api/billing/invoice/[id]/pdf.ts` |
| Admin UI: Leitweg-ID field per customer | admin customer form |

---

## 5. Phase 2 — Finish Plan B Invoice Lifecycle (3 PRs)

### PR-B: Mahnwesen (depends on PR-1)

**Schema** — already specified in the invoice lifecycle gaps design:
```sql
CREATE TABLE billing_invoice_dunnings (
  id, invoice_id, brand, level, generated_at, sent_at, sent_by,
  fee_amount, interest_amount, outstanding_at_generation, pdf_path,
  UNIQUE (invoice_id, level)
);
```
`billing_invoices` gains: `dunning_level SMALLINT DEFAULT 0`, `last_dunning_at TIMESTAMPTZ`.

**Components:**
- `invoice-dunning.ts` (exists as orphaned file) — overdue detection, fee/interest calc, dunning row insert
- `pages/api/admin/billing/dunning/run.ts` — POST cron endpoint (X-Cron-Secret)
- `pages/api/admin/billing/dunning/[id]/send.ts` — admin send-gate → email PDF
- `k3d/cronjob-dunning-detection.yaml` — daily 06:00 Europe/Berlin, `concurrencyPolicy: Forbid`
- Mahnung PDF template in `invoice-pdf.ts` (level, fee, interest, payment reference)
- Admin UI: Mahnwesen inbox tab — rows where `sent_at IS NULL`
- `admin/einstellungen/rechnungen.astro` — dunning fee/interest/interval settings

**Verzugszins formula:** linear simple interest per dunning level, not cumulative. Recalculated each Mahnung.

### PR-C: Storno/Gutschrift (depends on PR-A in main)

**Schema:**
```sql
ALTER TABLE invoice_counters ADD COLUMN kind TEXT NOT NULL DEFAULT 'invoice';
-- new UNIQUE (brand, year, kind)
```
Gutschrift uses `kind='gutschrift'`, prefix `GS-YYYY-NNNN`.

**Components:**
- `invoice-storno.ts` (exists as orphaned file) — counter-invoice creation, GS- numbering, EÜR counter-booking
- `pages/api/admin/billing/[id]/storno.ts` — row-lock + 409 on race
- Gutschrift PDF template (ZUGFeRD credit-note semantics)
- Storno button in admin invoice view (blocked for `draft` and `cancelled`)

**Counter-booking rule:** only emit if `original.paid_amount > 0`. Unpaid storno has no income to reverse.

### PR-D: Anzahlung/Schlussrechnung (depends on PR-A in main)

**Schema additions to `billing_invoices`:**
```sql
ADD COLUMN kind TEXT NOT NULL DEFAULT 'regular'
  CHECK (kind IN ('regular','prepayment','final','gutschrift')),
ADD COLUMN parent_invoice_id TEXT REFERENCES billing_invoices(id),
ADD COLUMN last_dunning_at TIMESTAMPTZ;
```

**Components:**
- `create-invoice.ts` (orphaned) accepts `kind: 'prepayment'` — Anzahlungsrechnung header + §14.5 hint text
- `pages/api/admin/billing/[id]/finalize-from-prepayment.ts` — Schlussrechnung builder
- Schlussrechnung PDF: Anzahlungsabschnitt block (§14.5 UStG layout with full/partial prepayment deduction)
- API constraint: max 1 final invoice per prepayment (checked before insert)

**§14.5 math:** Schlussrechnung subtracts full prepayment gross regardless of whether prepayment was partially paid. EÜR books only the residual net+VAT on the final invoice.

---

## 6. Phase 3 — Remaining Features (4 PRs)

### PR: billing-archive (independent)

`billing-archive.ts` is already complete. Wire it into:
- `finalizeInvoice` send path
- Dunning PDF send (`dunning/[id]/send.ts`)
- Storno Gutschrift PDF creation

Env vars `NEXTCLOUD_URL` and `NEXTCLOUD_ADMIN_PASS` already exist in secrets.

### PR: Plan G PR-G2 — Supplier Invoices (depends on PR-2 for `land_iso`)

**New tables:**
```sql
CREATE TABLE billing_suppliers (
  id, brand, name, email, land_iso, ustidnr, steuernummer,
  iban, bic, bank_name, address, typ TEXT DEFAULT 'Lieferant',
  created_at, updated_at
);
CREATE TABLE supplier_invoices (
  id, brand, supplier_id, invoice_number, invoice_date,
  leistungsdatum, net_amount, vat_amount, gross_amount,
  vat_rate DECIMAL(5,2), currency CHAR(3) DEFAULT 'EUR',
  description TEXT, pdf_path TEXT, status TEXT DEFAULT 'open',
  paid_at DATE, created_at, locked BOOLEAN DEFAULT false
);
```

**EÜR linkage:** supplier invoice payment → `addBooking(type='expense', category='betriebsausgabe')` with Vorsteuer split (if `isVorsteuerEligible` for the supplier's land\_iso).

**Admin UI:** Lieferanten CRUD tab + supplier invoice entry form + expense list with Vorsteuer column.

### PR: ELSTER XML (depends on PR-1 for tax data)

**UStVA XML builder** — aggregates from `eur_bookkeeping` + `billing_invoices` by Kennzahlen:
- KZ 81: Umsätze 19 %
- KZ 86: Umsätze 7 %
- KZ 41: innergemeinschaftliche Lieferungen
- KZ 43: Drittland-Ausfuhren
- KZ 66: abziehbare Vorsteuer

**EÜR Anlage XML builder** — Betriebseinnahmen / Betriebsausgaben / Gewinn per Anlage EÜR schema.

**ZM (Zusammenfassende Meldung) XML** — EU B2B VAT IDs + amounts, triggered when cumulative EU B2B > €50k.

**ERiC stub** (`website/src/lib/elster-eric.ts`):
```typescript
export async function submitToElster(xml: string, certPath: string) {
  if (!certPath || !existsSync(certPath)) {
    return { status: 'pending_cert', message: 'ELSTER-Softwarezertifikat nicht konfiguriert' };
  }
  // ERiC JNI call — wired in after cert arrives
}
```

**Admin UI:** ELSTER dashboard — period selector, Meldungstyp selector, XML preview/download button, submit button (disabled + tooltip until cert configured), Quittungs-PDF storage table.

### PR: §15a Vorsteuerberichtigung + GewSt-Kalkulator (independent)

**§15a Vorsteuerberichtigung:**

New table:
```sql
CREATE TABLE capital_goods (
  id, brand, description, acquisition_date DATE,
  acquisition_cost DECIMAL(12,2), input_vat DECIMAL(12,2),
  afa_months INT, created_at
);
```
- On tax mode switch: iterate capital goods where `acquisition_date > NOW() - (afa_months || ' months')::interval`
- Bagatellgrenze §44 UStDV: skip if `input_vat <= 1000`
- Correction amount: `input_vat * remaining_months / afa_months`
- Direction: switch Kleinunternehmer → Regelbesteuerung = positive booking (Vorsteuer reclaim); switch Regelbesteuerung → Kleinunternehmer = negative booking (Vorsteuer repayment)
- Emit as `addBooking(type='vat_correction')` with signed amount per above

**GewSt-Kalkulator** (pure frontend, no DB):
- Input: Gewerbeertrag, Hinzurechnungen, Kürzungen, Hebesatz (default 417 % Lübbecke)
- Freibetrag: €24,500
- Steuermesszahl: 3.5 %
- Output: Messbetrag, Steuerlast, quartärliche Vorauszahlung
- Admin UI: standalone calculator page with live recalculation

---

## 7. PR Dependency Graph

```
main (013511f)
│
├─ PR-1: feature/invoice-teilbezahlt  (SEPA, ECB, DATEV, VIES, Reverse Charge)
│   └─ PR-2: feature/billing-g1-customer-tax  (billing-tax.ts, land_iso)
│       └─ PR-G2: Supplier invoices
│
├─ PR-3: feature/zugferd-xrechnung-output  (ZUGFeRD, XRechnung, PDF/A-3)
│
├─ PR-B: Mahnwesen  (invoice-dunning.ts, CronJob)          ← needs PR-1
├─ PR-C: Storno/Gutschrift  (invoice-storno.ts)            ← needs PR-A (already in main)
├─ PR-D: Anzahlung/Schlussrechnung                         ← needs PR-A (already in main)
│
├─ PR: billing-archive  (independent)
├─ PR: ELSTER XML  (needs PR-1)
└─ PR: §15a + GewSt-Kalkulator  (independent)
```

---

## 8. What Is Explicitly Out of Scope

- ELSTER ERiC electronic transmission — deferred until software certificate arrives
- Automatic Vorsteuer pre-fill on UStVA from supplier invoices (data stored; integration later)
- Multiple Anzahlungen per project (schema forward-compatible; UI enforces max 1)
- Mahngebühren as separate downstream invoice
- Inkasso/SCHUFA after Mahnung 3
- Supplier dunning flows
- Multi-currency supplier invoices (EUR only)
- §7g Sonderabschreibung, §6 GWG Sammelposten (lower priority, not needed for thesis demo)
