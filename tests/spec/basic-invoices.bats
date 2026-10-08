#!/usr/bin/env bats
# tests/spec/basic-invoices.bats
#
# Guards for T901027: basic-invoices (Basis-Rechnungen, Zahlungsstatus,
# Export; Owner-only). Style: tests/spec/client-directory.bats.
# IDs T901027-1..5 feed components/website/src/data/test-inventory.json
# via scripts/build-test-inventory.sh.

LIB_TS="${BATS_TEST_DIRNAME}/../../components/website/src/lib/invoices.ts"
MIGRATION="${BATS_TEST_DIRNAME}/../../components/website/src/db/migrations/20261008_invoices.sql"
LIST_ASTRO="${BATS_TEST_DIRNAME}/../../components/website/src/pages/owner/rechnungen.astro"
DETAIL_ASTRO="${BATS_TEST_DIRNAME}/../../components/website/src/pages/owner/rechnungen/[id].astro"
ERSTELLEN_TS="${BATS_TEST_DIRNAME}/../../components/website/src/pages/api/owner/rechnungen/erstellen.ts"
STATUS_TS="${BATS_TEST_DIRNAME}/../../components/website/src/pages/api/owner/rechnungen/[id]/zahlungsstatus.ts"
KORRIGIEREN_TS="${BATS_TEST_DIRNAME}/../../components/website/src/pages/api/owner/rechnungen/[id]/korrigieren.ts"
EXPORT_TS="${BATS_TEST_DIRNAME}/../../components/website/src/pages/api/owner/rechnungen/export.ts"

# ── Case 1: every invoice route is owner-guarded (fail-closed) ───────────────

@test "T901027-1: all rechnungen routes reference the owner guard (requireOwner)" {
  for f in "$LIST_ASTRO" "$DETAIL_ASTRO" "$ERSTELLEN_TS" "$STATUS_TS" "$KORRIGIEREN_TS" "$EXPORT_TS"; do
    [ -f "$f" ] || { echo "missing route file: $f"; return 1; }
    grep -q "owner-guard\|requireOwner\|isOwnerSession" "$f" || { echo "owner guard missing from $f"; return 1; }
  done
}

# ── Case 2: invoice numbers are unique and sequential per calendar year ──────

@test "T901027-2: migration enforces per-year uniqueness and lib formats numbers" {
  [ -f "$MIGRATION" ] || { echo "missing migration file: $MIGRATION"; return 1; }
  [ -f "$LIB_TS" ] || { echo "missing lib file: $LIB_TS"; return 1; }
  grep -q "UNIQUE" "$MIGRATION" || { echo "UNIQUE constraint missing from migration"; return 1; }
  grep "UNIQUE" "$MIGRATION" | grep -q "invoice_year" || { echo "year column missing from UNIQUE in migration"; return 1; }
  grep "UNIQUE" "$MIGRATION" | grep -q "invoice_number" || { echo "number column missing from UNIQUE in migration"; return 1; }
  def_line=$(grep -n "function formatInvoiceNumber" "$LIB_TS" | head -1 | cut -d: -f1)
  use_line=$(grep -n "formatInvoiceNumber(" "$LIB_TS" | grep -v "function formatInvoiceNumber" | head -1 | cut -d: -f1)
  [ -n "$def_line" ] || { echo "formatInvoiceNumber definition missing from invoices.ts"; return 1; }
  [ -n "$use_line" ] || { echo "formatInvoiceNumber call missing from invoices.ts"; return 1; }
  [ "$def_line" -lt "$use_line" ] || { echo "formatInvoiceNumber must be defined before its call in invoices.ts"; return 1; }
}

# ── Case 3: second creation for the same booking answers 409 (dedupe) ───────

@test "T901027-3: erstellen.ts dedupes per booking before inserting (409)" {
  [ -f "$ERSTELLEN_TS" ] || { echo "missing endpoint file: $ERSTELLEN_TS"; return 1; }
  grep -q "status: 409" "$ERSTELLEN_TS" || { echo "409 response missing from erstellen.ts"; return 1; }
  guard_line=$(grep -n "findInvoiceByAppointmentToken(" "$ERSTELLEN_TS" | head -1 | cut -d: -f1)
  insert_line=$(grep -n "createInvoice(" "$ERSTELLEN_TS" | head -1 | cut -d: -f1)
  [ -n "$guard_line" ] || { echo "dedupe lookup (findInvoiceByAppointmentToken) missing from erstellen.ts"; return 1; }
  [ -n "$insert_line" ] || { echo "createInvoice call missing from erstellen.ts"; return 1; }
  [ "$guard_line" -lt "$insert_line" ] || { echo "dedupe lookup must precede createInvoice in erstellen.ts"; return 1; }
}

# ── Case 4: invoices carry the mandatory Angaben (§14 UStG fields) ───────────

@test "T901027-4: invoices.ts snapshot carries number, date, service, amount, tax" {
  [ -f "$LIB_TS" ] || { echo "missing lib file: $LIB_TS"; return 1; }
  grep -q "formatInvoiceNumber" "$LIB_TS" || { echo "invoice number builder missing from invoices.ts"; return 1; }
  grep -q "issueDate" "$LIB_TS" || { echo "issueDate (Rechnungsdatum) missing from invoices.ts"; return 1; }
  grep -q "serviceName" "$LIB_TS" || { echo "serviceName (Leistungsbeschreibung) missing from invoices.ts"; return 1; }
  grep -q "unitPriceCents" "$LIB_TS" || { echo "unitPriceCents (Entgelt) missing from invoices.ts"; return 1; }
  grep -q "taxNote\|KLEINUNTERNEHMER" "$LIB_TS" || { echo "tax note / Kleinunternehmer hint missing from invoices.ts"; return 1; }
}

# ── Case 5: manual payment status only, no online payment flow ───────────────

@test "T901027-5: no online-payment path in invoice files, manual statuses only" {
  for f in "$LIB_TS" "$MIGRATION" "$LIST_ASTRO" "$DETAIL_ASTRO" "$ERSTELLEN_TS" "$STATUS_TS" "$KORRIGIEREN_TS" "$EXPORT_TS"; do
    [ -f "$f" ] || { echo "missing invoice file: $f"; return 1; }
  done
  hits=$(grep -rni "stripe\|paypal\|checkout\|payment-intent\|zahlungslink" "$LIB_TS" "$MIGRATION" "$LIST_ASTRO" "$DETAIL_ASTRO" "$ERSTELLEN_TS" "$STATUS_TS" "$KORRIGIEREN_TS" "$EXPORT_TS" || true)
  [ -z "$hits" ] || { echo "online-payment reference found: $hits"; return 1; }
  grep -q "'bezahlt'" "$STATUS_TS" || { echo "manual status 'bezahlt' missing from zahlungsstatus.ts"; return 1; }
  grep -q "'offen'" "$STATUS_TS" || { echo "manual status 'offen' missing from zahlungsstatus.ts"; return 1; }
  grep -q "'storniert'" "$STATUS_TS" || { echo "manual status 'storniert' missing from zahlungsstatus.ts"; return 1; }
  grep -q "'sepa'" "$STATUS_TS" || { echo "manual method 'sepa' missing from zahlungsstatus.ts"; return 1; }
}
