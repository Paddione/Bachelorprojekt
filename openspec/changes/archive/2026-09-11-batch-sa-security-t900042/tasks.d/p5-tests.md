# Partial p5-tests: BATS guards and validation

## Focus
BATS Guards fuer SA-SEC-01..04 und Gesamttestlauf.

## Touched Files
- tests/spec/fleet-operations/security-cert-hygiene.bats

## Steps
1. BATS-Guard erstellen, der prueft:
   - sessions-wildcard traegt keine *. Platzhalter
   - flux-webhook enthaelt keine ${PROD_DOMAIN}
2. task workspace:validate ausfuehren.
