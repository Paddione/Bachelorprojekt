---
title: "bug-consolidation-T002330 — Implementation Plan"
ticket_id: T002330
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# bug-consolidation-T002330 — Implementation Plan

_Ticket: T002330_

## File Structure

```
CHANGED:
  website/src/routes/api/admin/bugs/+server.ts     — delete (or flag)
  website/src/lib/bug-helper.ts                     — delete
  website/src/routes/api/bug-report/+server.ts      — delete
  website/src/lib/tickets/migrations.ts              — add scope column
REMOVED:
  tests/e2e/fa-26-bug-report-form.spec.ts           — migrate or delete
```

## Tasks

### 1. Bug-API-Routen abbauen

Lösche `/api/admin/bugs/*` Routen und Bug-Helper-Klasse. Stelle sicher, dass das Admin-UI keine Bugs-Routen mehr referenziert.

### 2. Bug-Report-Route abbauen

`/api/bug-report`-Route entfernen. FA-26 E2E-Test auf tickets-Pfad migrieren.

### 3. scope-Spalte einführen

Füge `scope`-Spalte in `tickets.tickets` ein für Bug/Kategorie-Differenzierung.

### 4. CI-Gates

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
