#!/usr/bin/env bash
# scripts/systemtest-fanout.sh — fan out 3 parallel Playwright sessions,
# one per System-Test package, for a given cycle.
#
# Cycle map:
#   1 -> System-Test 1, 2, 3   (Auth, Admin/CRM, Kommunikation)
#   2 -> System-Test 4, 5, 6   (Fragebogen, DocuSeal, Steuer-Modus)
#   3 -> System-Test 7, 8, 9   (Rechnungen, EÜR, Monitoring)
#   4 -> System-Test 10, 11, 12 (Externe Dienste, LiveKit, Projektmanagement)
#
# Usage:
#   bash scripts/systemtest-fanout.sh <cycle> [env]
#       cycle: 1|2|3|4
#       env:   mentolder (default) | korczewski | dev
#
# Each session writes into tests/e2e/results/<spec>-<timestamp>/ and
# inherits E2E_ADMIN_USER / E2E_ADMIN_PASS from the caller.
set -euo pipefail

CYCLE="${1:-}"
ENVIRONMENT="${2:-mentolder}"

if [[ -z "$CYCLE" ]]; then
  echo "Usage: $0 <cycle> [env]" >&2
  exit 2
fi

case "$CYCLE" in
  1) PACKAGES=("01-auth" "02-admin-crm" "03-kommunikation") ;;
  2) PACKAGES=("04-fragebogen" "05-docuseal" "06-steuer") ;;
  3) PACKAGES=("07-rechnungen" "08-buchhaltung" "09-monitoring") ;;
  4) PACKAGES=("10-externe" "11-livekit" "12-projektmanagement") ;;
  *) echo "ERROR: cycle must be 1..4 (got '$CYCLE')" >&2; exit 2 ;;
esac

case "$ENVIRONMENT" in
  mentolder)  WEBSITE_URL="https://web.mentolder.de";  PROD_DOMAIN="mentolder.de" ;;
  korczewski) WEBSITE_URL="https://web.korczewski.de"; PROD_DOMAIN="korczewski.de" ;;
  dev)        WEBSITE_URL="${WEBSITE_URL:-http://localhost:4321}"; PROD_DOMAIN="${PROD_DOMAIN:-localhost}" ;;
  *) echo "ERROR: env must be mentolder|korczewski|dev (got '$ENVIRONMENT')" >&2; exit 2 ;;
esac
export WEBSITE_URL PROD_DOMAIN

if [[ -z "${E2E_ADMIN_PASS:-}" ]]; then
  echo "ERROR: E2E_ADMIN_PASS unset — refusing to dispatch headed sessions without admin creds" >&2
  exit 3
fi

E2E_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/tests/e2e"
TS="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="$E2E_DIR/results/systemtest-cycle-$CYCLE-$TS"
mkdir -p "$LOG_DIR"

echo "==> Fanning out 3 Playwright sessions for cycle $CYCLE against $WEBSITE_URL"
echo "    logs in $LOG_DIR"
echo

PIDS=()
SLOT=0
for pkg in "${PACKAGES[@]}"; do
  spec="$E2E_DIR/specs/systemtest-${pkg}.spec.ts"
  if [[ ! -f "$spec" ]]; then
    echo "SKIP: $spec (not yet implemented)"
    continue
  fi
  log="$LOG_DIR/${pkg}.log"
  echo "    starting $pkg -> $log"
  # Stagger by 25 s per slot so Keycloak logins don't all hit simultaneously.
  DELAY=$(( SLOT * 25 ))
  (
    [[ $DELAY -gt 0 ]] && sleep "$DELAY"
    cd "$E2E_DIR"
    PLAYWRIGHT_HTML_REPORT="$LOG_DIR/$pkg-html" \
    ./node_modules/.bin/playwright test "$spec" --project=systemtest --headed --workers=1 \
      > "$log" 2>&1
  ) &
  PIDS+=($!)
  (( SLOT++ )) || true
done

if (( ${#PIDS[@]} == 0 )); then
  echo "ERROR: no specs to run" >&2
  exit 4
fi

EXIT=0
for pid in "${PIDS[@]}"; do
  if ! wait "$pid"; then
    EXIT=1
  fi
done

echo
if (( EXIT == 0 )); then
  echo "==> All ${#PIDS[@]} sessions completed (logs: $LOG_DIR)"
else
  echo "==> One or more sessions failed (logs: $LOG_DIR)"
fi
exit "$EXIT"
