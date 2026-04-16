#!/usr/bin/env bash
# SA-09: Billing-Infrastruktur — Invoice Ninja, OAuth2-Proxy, SSO
# NOTE: Invoice Ninja wurde aus dem Stack entfernt. Tests werden übersprungen.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
for t in T1 T2 T3 T4 T5 T6 T7; do
  skip_test "SA-09" "$t" "InvoiceNinja entfernt" "Invoice Ninja wurde aus dem Stack entfernt"
done
