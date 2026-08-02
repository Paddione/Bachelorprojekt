# Tasks: db-backup Filen Upload — Frühalarmierung & Diagnose-Workflow

Implementation plan for `fix/T001738-db-backup-cronjob`. Reihenfolge ist auf
CI-Feedback gebaut (Alert zuerst → wir haben ab dem ersten Fail Visibility;
Diagnose-Skript als nächstes → On-Call kann sofort verifizieren; Runbook
zuletzt → Doku folgt Code).

## 1. PrometheusAlert hinzufügen

- **Datei:** `k3d/monitoring/prometheus-rules.yaml`
- **Inhalt:** Neue `alert: DBBackupJobFailed` Group mit Expression
  `kube_job_status_failed{job_name=~"db-backup-.*", namespace="workspace"} == 1`,
  `for: 1m`, `labels: {severity: warning}`, `annotations: {summary, runbook_url}`
  mit Verweis auf den neuen `CLAUDE.md`-Runbook-Abschnitt (siehe Task 4).
- **Verifikation:** `kubectl --context=fleet -n monitoring get prometheusrules.monitoring.coreos.com -o yaml` zeigt die neue Rule. Optional: `promtool check rules k3d/monitoring/prometheus-rules.yaml`.
- **Aufwand:** ~20 min (analog zu bestehenden Alerts wie `PodCrashLoopBackOff`).

## 2. Diagnose-Skript `scripts/db-backup-trigger.sh`

- **Datei:** `scripts/db-backup-trigger.sh` (neu, ausführbar, `set -euo pipefail`)
- **Verhalten:**
  1. Pre-flight: `kubectl config get-contexts` → muss `fleet` aktiv sein.
  2. `JOB=$(kubectl -n workspace create job "db-backup-diag-$(date +%s)" --from cronjob/db-backup)`.
  3. `kubectl -n workspace wait --for=jsonpath='{.status.conditions[?(@.type=="Failed")].status}'=True pod -l "job-name=$(basename $JOB)" --timeout=600s` ODER bis `Ready=0/2 Completed`.
  4. `kubectl -n workspace logs -c backup <pod>` (tail) + `kubectl -n workspace logs -c filen-upload <pod>` (tail).
  5. Exit-Code: 0 wenn `Filen upload done` in den Logs, sonst 1.
- **Aufwand:** ~30 min.
- **Verifikation:** Skript auf dem laufenden Cluster einmal ausführen → Exit 0,
  Ausgabe zeigt `nextcloud.dump OK`, `vaultwarden.dump OK`, `website.dump OK`,
  `Filen upload done`.

## 3. BATS-Smoke-Test für das Diagnose-Skript

- **Datei:** `tests/scripts/db-backup-trigger.bats` (neu, analog zu
  bestehenden Skript-Tests in `tests/scripts/`)
- **Cases:**
  - `bats: --help zeigt Usage und listet --wait-timeout-Flag` (oder die akzeptierten Flags).
  - `bats: ohne --context=fleet bricht mit klarem Hinweis ab` (mocked via `KUBECONFIG=/dev/null`).
- **Aufwand:** ~30 min.
- **Verifikation:** `bats tests/scripts/db-backup-trigger.bats` Exit 0.

## 4. Runbook in CLAUDE.md

- **Datei:** `CLAUDE.md` (oder `.claude/skills/ops/...` falls ein dedizierter
  Runbook-Skill existiert — bitte vorab prüfen, sonst zentral in CLAUDE.md)
- **Inhalt:** Neuer Abschnitt `## Runbook: db-backup Filen Fail-Modes` mit
  den vier Fail-Modes:
  1. **2FA auf Filen-Account aktiviert** → entweder 2FA deaktivieren oder
     Pipeline auf Filen-API-Token umstellen (separater Backlog-Ticket).
  2. **Filen-Passwort rotiert** → Plaintext in `environments/.secrets/<brand>.yaml`
     anpassen, `task env:seal ENV=<brand>`, `task env:deploy ENV=<brand>`.
  3. **Filen-API-Outage / Rate-Limit** → nichts tun, nächsten Lauf abwarten;
     Alert-Hinweis in `DBBackupJobFailed` Annotation.
  4. **`@filen/cli` npm-Package gebrochen** → temporär in
     `k3d/backup-cronjob.yaml` die Image-Pin auf ältere Version setzen
     (Backlog-Ticket für „Filen auth via API token statt email+password").
- **Aufwand:** ~15 min.
- **Verifikation:** `grep -A 20 "db-backup Filen Fail-Modes" CLAUDE.md` zeigt den Abschnitt.

## 5. OpenSpec-Specs-Delta in `openspec/specs/backup-pipeline.md` mergen

- **Datei:** `openspec/specs/backup-pipeline.md`
- **Inhalt:** Drei neue `### Requirement:` Blöcke anhängen (alle in
  Englisch GIVEN/WHEN/THEN, gemäß `openspec/config.yaml:specs.rule[2]`):
  - `### Requirement: Erste-Fail-Alert für db-backup`
  - `### Requirement: Manueller Diagnose-Trigger für db-backup`
  - `### Requirement: Dokumentierte Filen Fail-Modes`
  - Jeder mit mindestens einem `#### Scenario:` Block.
- **Aufwand:** ~20 min.
- **Verifikation:** `bash scripts/openspec-validate.ts` Exit 0 (CI-Gate).

## 6. PR erstellen und auto-mergen lassen

- **Branch:** `fix/T001738-db-backup-cronjob` (bereits vorhanden, committed ist
  nur der `chore(plans):` Commit).
- **Push:** `git push -u origin fix/T001738-db-backup-cronjob` (Pre-commit-Hook
  läuft automatisch).
- **PR-Titel:** `fix(infra): db-backup early-failure alert + diagnose script [T001738]`.
- **PR-Body:** Verweist auf `openspec/changes/db-backup-filen-fix/proposal.md`,
  listet die 4 geänderten Dateien, hängt `closes T001738` an.
- **Auto-Merge:** Ja (Conventional-Commit-Scope `fix` ist im
  `.github/labeler.yml` whitelisted; CI prüft `task test:changed`,
  `task freshness:check`, `task workspace:validate`).

## Abhängigkeiten

- Task 1 → unabhängig.
- Task 2 → unabhängig (kann parallel zu Task 1).
- Task 3 → abhängig von Task 2 (testet das Skript).
- Task 4 → unabhängig.
- Task 5 → unabhängig, sollte als letztes vor dem PR gemerged werden, damit
  die Spec den finalen Stand reflektiert.
- Task 6 → abhängig von 1–5.

## Out-of-Scope (separate Tickets)

- **`pvc-backup` seit 2026-06-09 broken** (`lastSuccessfulTime: 2026-06-09T01:02:38Z`,
  RPO 30 Tage) — neuer Investigation-Ticket empfohlen, nicht in T001738 enthalten.
- **Filen Auth auf API-Token umstellen** — Backlog, härtet 2FA- und
  Passwort-Rotations-Fail-Modes strukturell.
- **`failedJobsHistoryLimit` reduzieren** — abgelehnt (s. Proposal Non-Goals).
