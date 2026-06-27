---
title: "G-RH01: S1-Frozen-Violations Batch 2 — baseline.json 70→≤30"
ticket_id: T001155
domains: [quality, infra, website]
status: active
file_locks: [docs/code-quality/baseline.json, website/src/lib/tickets-db.ts, scripts/backup-restore.sh, Taskfile.yml]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: [s1-violations-batch1]
---

# Proposal: s1-violations-batch2 (G-RH01 Wave 2)

## Why

G-RH01 verlangt `docs/code-quality/baseline.json` ≤ 30 Einträge. Batch 1 (T001108, #2083) hat 98 → 70 erreicht via `task quality:baseline:refresh` und `questionnaire-db.ts`-Split. Verbleibend: 70 → ≤ 30. Top-Täter ohne Tests (`InboxApp.svelte`) bleiben für Wave 3; hier werden die zwei größten Source-Files mit niedrigstem Risiko aufgeteilt. Zusätzlich wird der CI-Guard gehärtet, damit neue Baseline-Einträge explizit begründet werden müssen.

## What

- `website/src/lib/tickets-db.ts` (1096 LOC) aufteilen in:
  - `tickets/tables/tickets.ts` (DDL `tickets.tickets`, `ticket_links`, `ticket_activity`, `ticket_comments`)
  - `tickets/tables/factory-control.ts` (DDL `factory_control` + `pipeline_*`)
  - `tickets/tables/systemtest-linkback.ts` (`source_test_*` Linkback-Spalten)
  - `tickets/migrations.ts` (Legacy `ALTER TABLE`-Patches)
  - `tickets-db.ts` ≤ 200 LOC als Re-Export-Compat-Index (kein API-Bruch)
- `scripts/backup-restore.sh` (1037 LOC) aufteilen in:
  - `scripts/backup-restore-lib.sh` (sourced Helpers: `_die`, `_render_recovery_browser`, `_db_pass_key`, `_pvc_service_mount`, `_target_kind`, `usage`)
  - `scripts/backup-restore-db.sh` (≈ 250 LOC, `cmd_db_*`)
  - `scripts/backup-restore-pvc.sh` (≈ 250 LOC, `cmd_pvc_*`)
  - `scripts/backup-restore-filen.sh` (≈ 200 LOC, `cmd_filen_*`)
  - `scripts/backup-restore-recovery.sh` (≈ 250 LOC, `cmd_recovery_*`)
  - `scripts/backup-restore.sh` ≤ 200 LOC (Dispatcher: usage + flag-parsing + `case "$CMD"`)
- CI-Guard härten in `Taskfile.yml:Phase 3 freshness:check`:
  - `new_keys` = `current_keys - main_keys`
  - Wenn `new_keys.length > 0` und PR-Body enthält kein `[baseline-allow:<reason>]` → `exit 1`
  - Tag-Konvention als non-invasive Ventil für legitime Fälle
- `task quality:baseline:refresh` ausführen → Baseline ≤ 30 Einträge
- `tests/spec/s1-violations-batch2.bats` (RED→GREEN): zählt `baseline.json` ≤ 30, prüft `tickets-db.ts` ≤ 600 LOC, `backup-restore.sh` ≤ 500 LOC

## Non-Goals

- `InboxApp.svelte` (1017 LOC, 0 Tests) → Wave 3 mit vorherigem vitest-Aufbau
- `QuestionnaireView.svelte`, `helpContent.ts`, `projekte/[id].astro`, `InboxDetail.svelte` und alle weiteren Top-30-Files → Wave 3+
- Schwellwert-Absenkung in `gates.yaml` (S1-Limit pro Extension) → nicht in dieser Welle
- S2/S3/S4-Violations (24/12/4 separat) → separater Plan

_Ticket: T001155_
