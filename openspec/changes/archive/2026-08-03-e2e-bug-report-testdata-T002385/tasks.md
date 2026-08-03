---
title: "e2e-bug-report-testdata-T002385 — Implementation Plan"
ticket_id: T002385
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# e2e-bug-report-testdata-T002385 — Implementation Plan

_Ticket: T002385_

## File Structure

```
CHANGED:
  tests/e2e/specs/fa-26-bug-report-form.spec.ts  — add [E2E] prefix or cleanup after test
```

## Tasks

### 1. Test-Daten kennzeichnen

E2E-Test so ändern, dass er `[E2E]`-Präfix im Titel setzt, damit Test-Daten in der DB erkennbar sind.

```bash
npx playwright test tests/e2e/specs/fa-26-bug-report-form.spec.ts
# expected: FAIL — Test erzeugt noch unmarkierte Zeilen
```

### 2. T002384 schließen

T002384 war ein Test-Daten-Ticket — auf done + obsolete setzen.

### 3. CI-Gates

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
