---
title: "backup-mail-routing — Implementation Plan"
ticket_id: T016415
domains: [infra-monitoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# backup-mail-routing — Implementation Plan

_Ticket: T016415_

## Ausgangslage

Die Implementierung existiert vollständig als Commit auf diesem Branch (übertragen aus dem
ungeticketen Hauptcheckout-Patch, BATS lokal 4/4 grün am 2026-08-24). Der Plan deckt nur noch
Verifikation und PR-Versand ab — keine neuen Implementierungsschritte.

## File Structure

```
k3d/monitoring/alertmanager-config.yaml                      (geändert — Child-Route backup-email, repeatInterval 24h)
environments/schema.yaml                                     (geändert — BACKUP_ALERT_EMAIL required)
environments/{mentolder,korczewski,fleet-mentolder,fleet-korczewski,staging}.yaml  (geändert — Wert gesetzt)
Taskfile.yml                                                 (geändert — ENVSUBST_VARS Deploy-Pfad)
scripts/pre-deploy-checks-lib.sh                             (geändert — ENVSUBST_VARS Pre-Deploy)
tests/spec/monitoring-alerts/backup-recipient-daily-repeat.bats  (neu — Querschnittstest)
openspec/changes/backup-mail-routing/                        (Proposal + Delta + dieser Plan)
```

## Tasks

- [x] 1. Patch aus Hauptcheckout auf Branch übertragen (Commit auf diesem Branch)
- [x] 2. BATS `tests/spec/monitoring-alerts/backup-recipient-daily-repeat.bats` grün
- [ ] 3. Gates: `task test:changed`, `task freshness:check`, `task workspace:validate`
- [ ] 4. PR erstellen (Conventional Commit mit `[T016415]`), CI abwarten, Squash-Merge
- [ ] 5. Ticket auf `done`/`fixed`; Post-Merge: Deploy rendert `BACKUP_ALERT_EMAIL` in beide Brands
      (Alertmanager zieht die Config ohne Neustart)

## Verification

- BATS-Test prüft Route-Matcher, Empfänger, repeatInterval und ENVSUBST-Abdeckung als Source-Verifikation.
- `task workspace:validate` stellt sicher, dass alle fünf Environment-Renders mit der neuen required Variante bauen.
