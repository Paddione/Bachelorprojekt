---
title: "Recovery Browser: Null E2E-Coverage — sensitive Backups ohne Smoke-Assertion"
ticket_id: T000479
branch: fix/t000479-recovery-browser-e2e
domains: [website]
status: active
pr_number: null
---

**Goal:** E2E-Smoke-Assertions für `/api/admin/ops/backup/list` und `/api/admin/ops/backup/trigger` hinzufügen. Diese Endpunkte sind die einzigen sensitiven Admin-Ops ohne Coverage.

**Ticket-ID:** T000479

---

## Meilenstein 1: E2E Smoke Tests

### Task 1.1: fa-admin-backup-ops.spec.ts erstellen

**Files:**
- Create: `tests/e2e/specs/fa-admin-backup-ops.spec.ts`

- [x] **Step 1: Auth-Guard für /api/admin/ops/backup/list** — GET ohne Auth gibt 401 zurück
- [x] **Step 2: Auth-Guard für /api/admin/ops/backup/trigger** — POST ohne Auth gibt 401 zurück
- [x] **Step 3: Cluster-Validierung für /api/admin/ops/backup/list** — falscher cluster=invalid → 400 oder 401
- [x] **Step 4: Cluster-Validierung für /api/admin/ops/backup/trigger** — falscher cluster → 400 oder 401
- [x] **Step 5: POST body-validation** — fehlender cluster in body → kein 200

## Meilenstein 2: Test-Inventory aktualisieren

### Task 2.1: freshness:regenerate

- [x] `task freshness:regenerate` ausführen

## Meilenstein 3: PR

### Task 3.1: PR erstellen und CI grün

- [x] PR erstellen, CI grün
