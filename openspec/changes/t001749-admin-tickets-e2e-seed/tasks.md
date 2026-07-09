---
title: "t001749-admin-tickets-e2e-seed — Implementation Plan"
ticket_id: T001749
domains: [e2e, tests, database]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t001749-admin-tickets-e2e-seed — Implementation Plan

_Ticket: T001749 · verwandt: T001754 (Prod-Pollution-Vorfall), T000862 (Schema-Voraussetzung), T001748 (Hydration-Fix, unter dessen Dach der Code-Diff auf `main` gemerged wurde)_

Ersetzt den Runtime-POST in `tests/e2e/specs/fa-admin-tickets.spec.ts` durch
einen direkten DB-Insert in `tickets.tickets` mit `is_test_data=true`-Marker
und `try { … } finally { cleanupSeedTicket(uuid) }`. Die Code-Änderungen
leben bereits auf `main` (Commit `ac44039f0`); dieser Plan dokumentiert sie
als formales OpenSpec-Change.

## File Structure

Neue Datei:
- `tests/e2e/lib/e2e-seed.ts` — DB-Level-Helper (`seedAvailable`, `seedAdminTicket`, `seedTicketComment`, `cleanupSeedTicket`, `cleanupSeedTickets`)
- `openspec/changes/t001749-admin-tickets-e2e-seed/proposal.md` — Purpose / Why / What / Non-Goals
- `openspec/changes/t001749-admin-tickets-e2e-seed/specs/e2e-test-infrastructure.md` — Delta-Spec (Requirements + Scenarios)

Geänderte Datei:
- `tests/e2e/specs/fa-admin-tickets.spec.ts` — `createTestBugReport` → `seedAdminTicket`; Skip-Gate + `try/finally`

Keine Datei-Limit-Konflikte (alle Dateien weit unter den `.ts`-Budgets; der Helper
ist 172 Zeilen, der Test 167 Zeilen, beide weit unter den jeweiligen 500er-Limits).

## Vorab-Status

- [x] **Code auf `main`.** `e2e-seed.ts` (172 Zeilen, neu) und der refaktorierte
      `fa-admin-tickets.spec.ts` (167 Zeilen) sind in Commit `ac44039f0`
      enthalten. Verifikation (siehe unten) lief auf dem Branch grün.
- [ ] **OpenSpec-Proposal committed** (Schritt 1 dieses Plans).
- [ ] **T001749 von `triage` auf `plan_staged`** (Schritt 2 dieses Plans).
- [ ] **T001754 nach `done` schließen** mit Resolution `fixed_by T001749`
      (Schritt 3 dieses Plans — Out of Scope dieses Plans, separates Ticket).

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Sicherstellen, dass `tests/e2e/lib/e2e-seed.ts`
      und der refaktorierte Spec auf dem Branch tatsächlich vorhanden und
      kompilierbar sind. (Schritte 1–3 unten.)

```bash
# Schritt 1: Helper existiert
test -f tests/e2e/lib/e2e-seed.ts && \
  grep -q 'export function seedAvailable' tests/e2e/lib/e2e-seed.ts && \
  grep -q 'export async function seedAdminTicket' tests/e2e/lib/e2e-seed.ts && \
  grep -q 'export async function cleanupSeedTicket' tests/e2e/lib/e2e-seed.ts
# expected: PASS — die fünf Helper-Symbole sind definiert.

# Schritt 2: Spec nutzt den Helper
grep -q "from '../lib/e2e-seed'" tests/e2e/specs/fa-admin-tickets.spec.ts && \
  grep -q "seedAvailable()" tests/e2e/specs/fa-admin-tickets.spec.ts && \
  grep -q "seedAdminTicket(" tests/e2e/specs/fa-admin-tickets.spec.ts && \
  grep -q "cleanupSeedTicket(ticketUuid)" tests/e2e/specs/fa-admin-tickets.spec.ts
# expected: PASS — Imports und Aufrufe sind verdrahtet, der alte `createTestBugReport` ist raus.

# Schritt 3: createTestBugReport ist nicht mehr referenziert
! grep -q "createTestBugReport" tests/e2e/specs/fa-admin-tickets.spec.ts
# expected: PASS — der Legacy-POST ist verschwunden.
```

- [ ] **Fix-Step (GREEN).** `npx tsc --noEmit -p tests/e2e/` exit 0
      (Typecheck der Playwright-Tests inkl. Helper).

```bash
npx tsc --noEmit -p tests/e2e/
# expected: PASS — 0 type errors.
```

- [ ] **Fix-Step (GREEN).** Vitest-Smoke (Unit-Tests, die den DB-Insert nicht
      berühren, müssen weiter grün sein — als Regression-Guard):

```bash
cd website && npx vitest run src/lib/tickets/transition.test.ts
# expected: 7/7 PASS — der Ticket-Transition-Status-Switch ist orthogonal zum
#                    Seed-Pfad und muss durch den Refactor unberührt bleiben.
```

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed          # selektiert die E2E-Domain (tests/e2e/** → vitest-Changed)
task freshness:regenerate  # generiert website/src/data/test-inventory.json neu
task freshness:check       # Freshness + S1–S4-Ratchet + Baseline-Assertion
# alle drei müssen grün sein.
```

## Out of Scope (bewusst NICHT in diesem Plan)

- **CI-Verdrahtung von `SESSIONS_DATABASE_URL`** in `.github/workflows/e2e-pr.yml`
  (nur `CRON_SECRET` ist aktuell gesetzt). Der Test skippt in CI, bis das
  ergänzt ist; das ist gewollt — kein DB-Seed ohne Wächter-Paar.
- **T001754 abschließen** — separater Schritt, sobald T001749 in `done`
  übergegangen ist (Resolution `fixed_by T001749`).
- **T000862 (`is_test_data`-Schema) und `tickets.fn_purge_test_data()`** —
  bereits geschlossen, sind die Voraussetzung für diesen Plan.
- **Generalisierung des Patterns** für andere E2E-Tests — folgt
  etablierten eigenen Mustern (`fa-fragebogen.spec.ts` z.B. nutzt schon
  ein direktes `pg.Pool`); keine Sammel-Änderung in diesem Plan.
- **Bug-Report-Endpoint (`/api/bug-report`) selbst** — bleibt unverändert,
  nur die E2E-Tests umgehen ihn.
