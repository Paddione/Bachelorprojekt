# Plan B — Invoice lifecycle gaps

**Status:** Design approved (brainstorming complete)
**Date:** 2026-04-28
**Scope:** Four invoice lifecycle features — TEILBEZAHLT, Mahnwesen, Storno/Gutschrift, Anzahlung/Schlussrechnung
**Delivery:** One spec, four sequential PRs

## 1. Goal

Close four lifecycle gaps in the native-billing module (`website/src/lib/native-billing.ts`) so that the workspace MVP can correctly handle the full German invoicing lifecycle expected of a small DSGVO-compliant business: partial payments, dunning escalation, formal cancellation via Gutschrift, and §14.5 UStG-compliant prepayment/final-invoice flows.

## 2. Non-Goals

- Stripe-webhook-driven automatic payment recording (manual admin entry only).
- Automatic dunning email without human review (admin gate is mandatory).
- Partial Storno (cancelling individual line items).
- Multiple Anzahlungen per project (schema is forward-compatible; UI enforces max 1).
- Issuing Mahngebühren as a separate downstream invoice.
- Inkasso/SCHUFA integrations after Mahnung 3.
- I18n: all customer-facing strings remain DE-only.

## 3. Delivery sequence

| PR | Feature | Depends on |
|----|---------|------------|
| PR-A | `#10` TEILBEZAHLT — payments ledger, status `partially_paid`, EÜR-on-payment | – |
| PR-B | `#1` Mahnwesen — overdue detection, dunning escalation 1/2/3, admin send-gate | PR-A |
| PR-C | `#7` Storno/Gutschrift — counter-invoice with separate `GS-` numbering, EÜR counter-booking | PR-A |
| PR-D | `#15` Anzahlung/Schlussrechnung — §14.5 UStG compliant, max 1 prepayment per project | PR-A |

Per-brand auto-merge after CI green (existing repo workflow).

## 4. Status state machine

```
draft ──finalize──▶ open ──fully paid──▶ paid
                    │  │                  │
                    │  └─partial pay─▶ partially_paid ──remaining paid──▶ paid
                    │                     │
                    │                     ▼
                    └─due passed─▶ overdue ──Mahn1─▶ dunning_1 ──Mahn2─▶ dunning_2 ──Mahn3─▶ dunning_3
                                                                          │
                                                                          └─any payment─▶ partially_paid│paid

Any non-draft state ── admin Storno ──▶ cancelled  (creates linked Gutschrift)
```

- `partially_paid` and `overdue`/`dunning_*` are mutually exclusive states stored in a single `status` column. Outstanding balance and days-overdue are computed and shown in the UI without needing a combined state.
- `dunning_level` only ever increases. Payment after Mahnung 2 sets status to `paid`/`partially_paid` but `dunning_level` stays at 2 (audit trail).
- `cancelled` is terminal.

## 5. Data model

### 5.1 Extend `billing_invoices`

```sql
ALTER TABLE billing_invoices
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'regular'
    CHECK (kind IN ('regular','prepayment','final','gutschrift')),
  ADD COLUMN parent_invoice_id TEXT REFERENCES billing_invoices(id),
  ADD COLUMN dunning_level SMALLINT NOT NULL DEFAULT 0
    CHECK (dunning_level BETWEEN 0 AND 3),
  ADD COLUMN last_dunning_at TIMESTAMPTZ;
```

`status` remains free-form TEXT. Allowed values documented here:
`draft | open | partially_paid | paid | overdue | dunning_1 | dunning_2 | dunning_3 | cancelled`.

`paid_amount` (already exists) becomes a denormalized cache. Source of truth is `billing_invoice_payments`.

`cancels_invoice_id` (already exists) is now wired up by PR-C.

### 5.2 New `billing_invoice_payments` (PR-A)

```sql
CREATE TABLE billing_invoice_payments (
  id           BIGSERIAL PRIMARY KEY,
  invoice_id   TEXT NOT NULL REFERENCES billing_invoices(id),
  brand        TEXT NOT NULL,
  paid_at      DATE NOT NULL,
  amount       NUMERIC(12,2) NOT NULL CHECK (amount <> 0),
  method       TEXT NOT NULL,                  -- 'sepa'|'cash'|'bank'|'other'
  reference    TEXT,
  recorded_by  TEXT NOT NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON billing_invoice_payments (invoice_id);
```

`amount` may be negative for correction entries. UI never edits or deletes a payment row; corrections are negative payments with a required `notes` reason.

### 5.3 New `billing_invoice_dunnings` (PR-B)

```sql
CREATE TABLE billing_invoice_dunnings (
  id              BIGSERIAL PRIMARY KEY,
  invoice_id      TEXT NOT NULL REFERENCES billing_invoices(id),
  brand           TEXT NOT NULL,
  level           SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 3),
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ,                 -- NULL = parked, awaiting admin
  sent_by         TEXT,
  fee_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  interest_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  outstanding_at_generation NUMERIC(12,2) NOT NULL,
  pdf_path        TEXT NOT NULL,
  UNIQUE (invoice_id, level)
);
```

### 5.4 Extend `invoice_counters` (PR-C)

```sql
ALTER TABLE invoice_counters ADD COLUMN kind TEXT NOT NULL DEFAULT 'invoice';
-- existing UNIQUE (brand, year)  →  drop, replace with:
-- UNIQUE (brand, year, kind)
```

Gutschrift uses `kind='gutschrift'`, prefix `GS-YYYY-NNNN`. Anzahlungs- and Schlussrechnungen reuse `kind='invoice'` (`RE-YYYY-NNNN`).

### 5.5 New `site_settings` keys (PR-B)

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `invoice_dunning_fee_1` | NUMBER | 0 | Mahngebühr Mahnung 1 |
| `invoice_dunning_fee_2` | NUMBER | 5 | Mahngebühr Mahnung 2 |
| `invoice_dunning_fee_3` | NUMBER | 10 | Mahngebühr Mahnung 3 |
| `invoice_dunning_interest_pa` | NUMBER | 5 | Verzugszins p.a., % |
| `invoice_dunning_interval_days` | NUMBER | 14 | Days between escalation steps |

All editable via `admin/einstellungen/rechnungen.astro`. Endpoint extends `STRING_KEYS` / `NUMBER_KEYS` arrays in `pages/api/admin/einstellungen/rechnungen.ts`.

## 6. Components

| Layer | New | Modified |
|-------|-----|----------|
| Schema | `billing_invoice_payments`, `billing_invoice_dunnings`, `invoice_counters.kind`, `billing_invoices` (`kind`, `parent_invoice_id`, `dunning_level`, `last_dunning_at`) | – |
| Lib | `invoice-payments.ts`, `invoice-dunning.ts`, `invoice-storno.ts`, `invoice-prepayment.ts` | `native-billing.ts` (refactor `markInvoicePaid` + `finalizeInvoice` EÜR move), `eur-bookkeeping.ts` (counter-booking helpers), `invoice-pdf.ts` (Mahnung, Gutschrift, Schlussrechnung templates) |
| API | `POST /api/admin/billing/[id]/payments`, `POST /api/admin/billing/[id]/storno`, `POST /api/admin/billing/dunning/run` (cron), `POST /api/admin/billing/dunning/[id]/send`, `POST /api/admin/billing/[id]/finalize-from-prepayment` | `pages/api/billing/create-invoice.ts` accepts `kind: 'prepayment'`; `pages/api/admin/einstellungen/rechnungen.ts` adds new dunning keys |
| UI | `RechnungenSection` — payment-recording modal, dunning inbox tab, Storno button, "Schlussrechnung erstellen" button | `admin/einstellungen/rechnungen.astro` — dunning fees/interest/interval fields |
| Cron | `k3d/cronjob-dunning-detection.yaml` (daily 06:00, `X-Cron-Secret` pattern) | – |

## 7. Per-PR data flows

### 7.1 PR-A — TEILBEZAHLT

```
Admin → "Zahlung erfassen" modal (paid_at, amount, method, reference)
  POST /api/admin/billing/[id]/payments
    BEGIN
      SELECT … FOR UPDATE on billing_invoices
      INSERT billing_invoice_payments
      paid_amount := SUM(amount) over invoice
      IF paid_amount >= gross_amount: status='paid', paid_at=NOW()
      ELIF paid_amount > 0:           status='partially_paid'
      addBooking(type='income',
                 netAmount = round2(amount * net_amount / gross_amount),
                 vatAmount = round2(amount * tax_amount / gross_amount),
                 invoiceId)
    COMMIT
```

**Breaking change**: today `finalizeInvoice` emits the EÜR booking up-front (accrual). PR-A moves EÜR emission to payment-time (Ist-Besteuerung-friendly, partial-payment-correct). One-shot migration:

1. For each existing `paid` invoice with no payment row: synthesize one `billing_invoice_payments` from `paid_at`/`paid_amount`.
2. Existing EÜR bookings remain (already correct for paid invoices).
3. For each existing `open` invoice with an EÜR booking from `finalizeInvoice`: delete the booking. The next payment will re-emit it.

Migration runs in a transaction with a dry-run flag that prints the diff first.

`markInvoicePaid()` is kept as a thin shim that records a single full-gross payment.

### 7.2 PR-B — Mahnwesen

```
Daily CronJob 06:00 → POST /api/admin/billing/dunning/run (X-Cron-Secret)
  for each invoice in (open|partially_paid|overdue|dunning_1|dunning_2)
                       where due_date < CURRENT_DATE
                         and gross_amount - paid_amount > 0:
    days_overdue = CURRENT_DATE - due_date
    next_level   = dunning_level + 1   (cap 3)
    eligible     = days_overdue >= interval AND
                   (dunning_level == 0 OR
                    CURRENT_DATE >= last_dunning_at::date + interval)
    if eligible:
      outstanding = gross_amount - paid_amount
      fee         = setting(invoice_dunning_fee_<next_level>)
      interest    = outstanding * days_overdue * interest_pa / 100 / 365
      pdf         = render Mahnung template (level, fee, interest, payment ref)
      INSERT billing_invoice_dunnings (sent_at=NULL)
      UPDATE invoice
        SET status='dunning_<n>', dunning_level=n, last_dunning_at=NOW()

Admin Mahnwesen-Inbox (admin/rechnungen?tab=mahnungen):
  rows from billing_invoice_dunnings WHERE sent_at IS NULL
  click [Senden] → POST /api/admin/billing/dunning/[id]/send
    email PDF (existing SMTP path)
    UPDATE sent_at=NOW(), sent_by=admin
```

Verzugszinsen formula: linear simple interest, recalculated each Mahnung. Not cumulative across levels.

EÜR: dunning fees and interest are NOT booked at generation time. When a payment exceeds the original gross, the surplus is booked as `income / dunning_fees` (matches Ist-Besteuerung — only realized income counts).

After `dunning_3`, no further automatic escalation. Admin handles offline (Inkasso/lawyer).

### 7.3 PR-C — Storno/Gutschrift

```
Admin clicks "Stornieren" on a finalized invoice (status in
  open|paid|partially_paid|overdue|dunning_1|dunning_2|dunning_3):
  POST /api/admin/billing/[id]/storno  { reason }
    BEGIN
      SELECT … FOR UPDATE on original
      number  = getNextCounter(brand, year, kind='gutschrift') → 'GS-2026-NNNN'
      INSERT billing_invoices:
        kind='gutschrift', cancels_invoice_id=orig.id,
        net=-orig.net, tax=-orig.tax, gross=-orig.gross,
        status='open', notes='Storno für ' || orig.number || ': ' || reason
      mirror line items with negated quantities
      UPDATE original SET status='cancelled'
      render Gutschrift PDF (ZUGFeRD credit-note semantics)
      IF orig.paid_amount > 0:
        addBooking(type='income',
                   netAmount=-round2(orig.paid_amount * orig.net_amount  / orig.gross_amount),
                   vatAmount=-round2(orig.paid_amount * orig.tax_amount / orig.gross_amount),
                   category='storno',
                   invoiceId=gutschrift.id,
                   description='Storno ' || orig.number)
    COMMIT
```

Forbidden:
- Storno on `draft` (admin deletes instead).
- Storno on `cancelled` invoices.
- Storno on `gutschrift` invoices (no double-cancel).

Counter-booking rule: only emit if `original.paid_amount > 0`. For unpaid Storno there is nothing to counter — the original income was never booked under PR-A semantics.

A `final` invoice can be stornoed without touching its `prepayment` parent. Full project rollback = two separate Stornos.

### 7.4 PR-D — Anzahlung/Schlussrechnung

```
Step 1: Anzahlungsrechnung (deposit invoice)
  POST /api/admin/billing/create-invoice
    body: { ..., kind: 'prepayment' }
  → Standard create flow; PDF uses Anzahlungsrechnung header + §14.5 hint text
  → EÜR booked at payment-time (PR-A behavior)

Step 2: Schlussrechnung (final invoice from prepayment)
  POST /api/admin/billing/[id]/finalize-from-prepayment
    body: { final_lines, final_net }
    Validation:
      prepayment.kind == 'prepayment'
      prepayment.status IN ('paid','partially_paid')
      no existing 'final' invoice with parent_invoice_id == prepayment.id
    INSERT billing_invoices:
      kind='final', parent_invoice_id=prepayment.id
      lines = final_lines (full project value)
      net   = full_net
      tax   = full_net * tax_rate
      gross_amount = (full_net + full_tax) - prepayment.gross_amount  (residual due)
    PDF auto-renders Anzahlungsabschnitt:
      "Gesamtleistung netto: 5000.00 €"
      "USt 19 %: 950.00 €"
      "Gesamtbetrag brutto: 5950.00 €"
      "abzgl. Anzahlung RE-2026-0042 netto: 1000.00 €"
      "abzgl. USt aus Anzahlung 19 %: 190.00 €"
      "Restbetrag: 4760.00 €"
    EÜR at payment-time on the final invoice books only the residual net+USt.
    (Prepayment net+USt already booked when prepayment was paid; no double-counting.)
```

Constraint enforced at API: max 1 final invoice per prepayment. Schema permits more (forward-compat) but UI/API rejects.

If prepayment is `partially_paid`: Schlussrechnung still subtracts the **full prepayment gross** (per §14.5 — references the Anzahlungsrechnung amount, not the cash flow).

## 8. Error handling, concurrency, idempotency

- **Payments**: SELECT…FOR UPDATE on invoice row + transactional booking emit.
- **Cron dunning**: idempotent via `UNIQUE (invoice_id, level)`; second run for same level → caught & logged. CronJob `concurrencyPolicy: Forbid` already prevents overlapping pods.
- **Storno**: row lock on original; race-loser sees `status='cancelled'` and returns 409.
- **Cron API auth**: `X-Cron-Secret` header validated against `CRON_SECRET` env (existing `monthly-billing` pattern).
- **Cron pod TZ**: must be `Europe/Berlin`. Spec mandates verification at deploy time (otherwise overdue arithmetic drifts by up to 24 h).

## 9. Edge cases

| Case | Handling |
|------|----------|
| Payment > outstanding | Reject 400 — admin must split or use Storno. |
| Payment correction | Negative payment row with required `notes` reason. Negative EÜR booking emitted automatically. |
| Invoice paid before cron sees it (race) | Dunning generation re-checks `outstanding > 0` under SELECT-FOR-UPDATE. Race-loser becomes a no-op. |
| Storno on invoice with parked dunnings | Allowed. Original → `cancelled`; UI hides parked dunnings whose invoice is `cancelled`. |
| Storno on `final` with paid `prepayment` | Storno only the final. Prepayment is independent. |
| Schlussrechnung with `partially_paid` prepayment | Allowed; subtract full prepayment gross. |
| Customer pays original gross, ignores fees | Status → `paid`. Fee+interest lost (out of scope: separate Mahngebühren-Rechnung). |
| Time-zone of cron "today" | Uses Postgres `CURRENT_DATE`; cluster TZ is `Europe/Berlin`. |

## 10. Testing

### Unit (vitest)

Extends `native-billing.test.ts`:

- Status-transition matrix: legal & illegal transitions per state machine.
- Payment recompute math: rounding, mixed methods, negative corrections.
- Verzugszins formula: 0 days, 365 days, leap-year boundary.
- §14.5 Schlussrechnung math: USt symmetry (prepayment USt + final USt == project USt).
- Storno counter-booking rule: paid vs unpaid original.

### Integration (BATS via `task test:unit`)

- Cron job idempotency: run twice, identical DB state.
- CronJob YAML kubeval.

### E2E (Playwright)

New spec `tests/e2e/specs/fa-21-invoice-lifecycle.spec.ts`:

- **PR-A**: record partial payment → status `partially_paid` → record rest → status `paid`.
- **PR-B**: time-travel `due_date` via DB UPDATE → POST cron endpoint → assert dunning row + parked status; admin "Senden" → email-mock receives PDF.
- **PR-C**: Storno paid invoice → Gutschrift PDF renders → EÜR has both bookings → totals net to zero.
- **PR-D**: prepayment → record payment → finalize-from-prepayment → assert §14.5 lines in PDF.

### Manual smoke on live `mentolder` (per repo memory)

Each PR includes a smoke checklist run on `mentolder` post-deploy:

- Create test invoice, partial-pay, observe status flip.
- Trigger dunning manually (admin endpoint), observe inbox row.
- Storno test invoice, observe Gutschrift PDF + EÜR neutrality.
- Anzahlung → Schlussrechnung, verify §14.5 PDF block.

## 11. Configuration changes

### CronJob

`k3d/cronjob-dunning-detection.yaml`:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: dunning-detection
  namespace: workspace
spec:
  schedule: "0 6 * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: trigger
              image: curlimages/curl:8.7.1
              command: [sh, -c]
              args:
                - |
                  curl -sf -X POST \
                    -H "X-Cron-Secret: $CRON_SECRET" \
                    http://website.website.svc.cluster.local:4321/api/admin/billing/dunning/run
              env:
                - name: CRON_SECRET
                  valueFrom:
                    secretKeyRef:
                      name: workspace-secrets
                      key: CRON_SECRET
```

Add to `k3d/kustomization.yaml` resources list.

## 12. Open questions

None at design time. Anything unresolved gets surfaced during writing-plans.

## 13. References

- §14.5 UStG — Schlussrechnung must list and subtract prior Anzahlungen (net + USt).
- §286 BGB — Verzug after due date or 30 days post-receipt.
- §288 BGB — Verzugszinsen rates (B2C: 5pp over Basiszins; B2B: 9pp). Stored as configurable per-brand setting; default 5 % p.a. as a conservative baseline.
- GoBD — every booking traceable, no edit/delete on booked rows (drives the append-only payments ledger).
- Existing `monthly-billing` CronJob (`k3d/cronjob-monthly-billing.yaml`) — pattern reference for `X-Cron-Secret` mechanism.
