#!/usr/bin/env bash
# FA-09: Buchhaltung — Invoice Ninja CRUD und SSO-Integration
# NOTE: Invoice Ninja wurde aus dem Stack entfernt. Tests werden übersprungen.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
for t in T1 T2 T3 T4 T5 T6 T7; do
  skip_test "FA-09" "$t" "InvoiceNinja entfernt" "Invoice Ninja wurde aus dem Stack entfernt"
done
