---
title: "G-RH03: BATS Coverage Batch 1 — OpenSpec 17%→23%"
ticket_id: T001117
domains: [quality, tests, infra]
status: active
file_locks: [website/src/data/test-inventory.json]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Proposal: bats-coverage-batch1 (G-RH03)

## Why

Die OpenSpec-SSOT-Specs unter `openspec/specs/*.md` (53 Dateien) sind die Single-Source-of-Truth für das Verhalten der Infrastruktur. Aktuell haben nur **9 von 53 Specs** (~17%) eine BATS-Regression unter `tests/spec/`. Damit ist nicht testbar, ob Script-Änderungen das spezifizierte Verhalten verletzen — ein Bruch in `env-seal.sh` würde z.B. erst im Prod-Cluster sichtbar.

Ziel: Coverage 17% → **~23%** (9 → 12 Specs). Diese Batch 1 adressiert die 3 wichtigsten Lücken: Secret-Rotation, Secret-Deploy-Automation, Backup-Pipeline — die drei sicherheits-/DR-kritischen Specs, deren Verhalten offline testbar sein muss.

## What

- `tests/spec/secret-rotation.bats` — testet `env-seal.sh` Test-Hooks (`--_test-dev-scan`, `--_test-dup-check`, `--_test-cert-compare`) + `env-generate.sh` Overwrite-Protection
- `tests/spec/secrets-deploy-automation.bats` — testet prod-Overlay `$patch: delete`, SealedSecret-Vollständigkeit, Kustomize-Output (mit skip-when-no-cluster)
- `tests/spec/backup-pipeline.bats` — testet CronJob-Struktur in `k3d/backup.yaml` (db-backup, pvc-backup, schedules), Retention-Policy, AES-256-CBC, `backup-restore.sh` Existenz
- `website/src/data/test-inventory.json` regenerieren (CI-Gate)
- Keine Code-Änderungen — nur Test-Add

_Ticket: T001117_
