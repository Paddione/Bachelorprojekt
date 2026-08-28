---
title: "disable-email-notifications — Implementation Plan"
ticket_id: T016592
domains: [website, infra, monitoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# disable-email-notifications — Implementation Plan

_Ticket: T016592_

## File Structure

```
components/website/src/lib/notifications.ts             (geändert — Kill-Switch)
components/website/src/lib/notifications.test.ts        (geändert — Vitest-Fälle)
k3d/notify-unread-cronjob.yaml                          (geändert — suspend: true)
k3d/monitoring/alertmanager-config.yaml                 (geändert — Blackhole-Receiver)
k3d/nextcloud-notification-config-job.yaml              (neu — occ-Job Activity-Digest)
k3d/kustomization.yaml                                  (geändert — Job registrieren)
tests/spec/website-core/email-notifications.bats        (neu — Manifest-Guards)
tests/spec/monitoring-alerts.bats                       (geändert — Blackhole statt E-Mail)
tests/spec/monitoring-alerts/backup-recipient-daily-repeat.bats  (geändert — backup-email entfällt)
```

### S1-Budgets (wirksame Schwelle)

`docs/code-quality/baseline.json` enthält genau einen Eintrag
(`.opencode/skills/huggingface-vision-trainer/scripts/dataset_inspector.py`); **keine** der hier
berührten Dateien ist gebaselined. Die wirksame Schwelle ist daher das statische Extension-Limit
aus `docs/code-quality/gates.yaml` → `s1.limits`.

| Datei | Ist | Wirksame Schwelle | Budget |
|---|---|---|---|
| `components/website/src/lib/notifications.ts` | 51 | 900 (`.ts`) | 849 |
| `components/website/src/lib/notifications.test.ts` | 106 | 900 (`.ts`) | 794 |

Die übrigen berührten Dateien sind `.yaml` und `.bats` — für beide führt `gates.yaml` → `s1.limits`
kein Limit, sie unterliegen dem S1-Ratchet nicht. S1 ist in dieser Änderung damit unkritisch;
ein Modul-Split ist nicht erforderlich.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Lege `tests/spec/website-core/email-notifications.bats` an und
      erweitere `components/website/src/lib/notifications.test.ts`, bevor irgendein Produktivcode
      angefasst wird. Die BATS-Datei prüft, dass `k3d/notify-unread-cronjob.yaml` auf `spec`-Ebene
      `suspend: true` trägt, dass `k3d/monitoring/alertmanager-config.yaml` keinen
      `emailConfigs:`-Eintrag mehr enthält, aber einen Receiver `name: "null"` führt (Positiv-Anker:
      der `receivers:`-Block existiert weiterhin), und dass `k3d/kustomization.yaml` sowohl
      `notify-unread-cronjob.yaml` als auch `nextcloud-notification-config-job.yaml` listet. Die
      Vitest-Fälle decken die drei Szenarien der Requirement „Globaler Kill-Switch für
      Admin-Benachrichtigungs-Mails" ab: Switch aus → `sendEmail` wird nicht aufgerufen; Switch
      `'true'` → genau ein Aufruf; direkter `sendEmail`-Aufruf bleibt unberührt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/website-core/email-notifications.bats
# expected: FAIL (rot — suspend, Blackhole-Receiver und der occ-Job existieren noch nicht)
```

```bash
cd components/website && npx vitest run src/lib/notifications.test.ts
# expected: FAIL (rot — der Kill-Switch ist noch nicht implementiert)
```

- [x] **Task 1 — Kill-Switch in `notifications.ts` (GREEN für die Vitest-Fälle).**
      In `sendAdminNotification()` als allererste Anweisung, **vor** dem `Promise.all` mit den
      `getSiteSetting`-Aufrufen, aussteigen wenn
      `process.env.EMAIL_NOTIFICATIONS_ENABLED !== 'true'`. Die Prüfung muss vor den DB-Lookups
      liegen, damit der Switch auch ohne erreichbare `site_settings` greift. `TYPE_DEFAULTS`,
      die `notify_*`-Auswertung und die Admin-UI bleiben unverändert — sie sind die Feinsteuerung
      unter dem Switch. `sendEmail` in `components/website/src/lib/email.ts` wird **nicht**
      angefasst; transaktionale Pfade (`api/dsgvo-request.ts`, `api/booking.ts`, `api/register.ts`,
      `api/contact.ts`) rufen es direkt auf und bleiben zustellfähig.

- [x] **Task 2 — `notify-unread` CronJob suspendieren.**
      In `k3d/notify-unread-cronjob.yaml` `suspend: true` auf `spec`-Ebene ergänzen (neben
      `schedule` und `concurrencyPolicy`). Den Eintrag in `k3d/kustomization.yaml` **stehen
      lassen** — die Abschaltung soll ein umlegbares Feld sein, kein entferntes Manifest.
      `components/website/src/pages/api/cron/notify-unread.ts` bleibt unverändert: der Endpunkt
      ist durch `CRON_SECRET` geschützt und ohne Trigger wirkungslos.

- [x] **Task 3 — Alertmanager auf Blackhole-Receiver umstellen.**
      In `k3d/monitoring/alertmanager-config.yaml` beide Receiver `email` und `backup-email`
      samt ihrer `emailConfigs` entfernen und durch einen einzigen Receiver ersetzen, der nur
      `- name: "null"` trägt. `spec.route.receiver` auf `"null"` setzen und die
      `routes:`-Kindroute für `BackupJobFailed|BackupCronJobStale` entfernen — sie zeigte auf
      `backup-email` und hätte ohne Ziel einen ungültigen Verweis. Den bestehenden
      T014542-Kommentar am Dateiende erhalten und um einen Satz zu T016592 ergänzen, warum der
      Receiver leer ist. Die Variablen `${CONTACT_EMAIL}`, `${BACKUP_ALERT_EMAIL}`, `${SMTP_*}`
      verschwinden damit aus dieser Datei; sie bleiben in `environments/schema.yaml` und der
      `envsubst`-Liste in `Taskfile.yml` deklariert, damit eine Wiedereinführung keinen
      Schema-Eingriff braucht.

- [x] **Task 4 — Nextcloud Activity-Digest abschalten.**
      Neues Manifest `k3d/nextcloud-notification-config-job.yaml` nach dem Muster von
      `k3d/vaultwarden-seed-job.yaml`: ein `batch/v1` Job im Namespace `workspace`, der per
      `kubectl exec`-freiem Weg im Nextcloud-Image `occ config:app:set activity default_setting`
      und die zugehörigen `notify_email_*`-Schlüssel auf `0` setzt, mit
      `ttlSecondsAfterFinished` und `restartPolicy: OnFailure`. In `k3d/kustomization.yaml` unter
      `resources:` registrieren. Weil die `prod-fleet/*-jobs`-Overlays alle `kind: Job` aus der
      Basis übernehmen (T002207), gilt der Job damit ohne weitere Overlay-Änderung für beide
      Brands. `k3d/vaultwarden.yaml` und die DocuSeal-Ressourcen bleiben unangetastet — deren
      SMTP-Konfiguration trägt ausschließlich transaktionale Mails (Einladung, 2FA,
      Signaturanfrage), siehe `design.md` E5.

- [x] **Task 5 — Bestehende Monitoring-Guards nachziehen (GREEN für BATS).**
      In `tests/spec/monitoring-alerts.bats` den Test
      `alertmanager-config.yaml routes via email while Pushover creds are absent` auf den
      Blackhole-Zustand umstellen: er darf `emailConfigs:` nicht mehr erwarten, sondern muss den
      `null`-Receiver und `route.receiver: "null"` prüfen. In
      `tests/spec/monitoring-alerts/backup-recipient-daily-repeat.bats` die vier Tests entfernen,
      die den `backup-email`-Receiver, die Kindroute und `BACKUP_ALERT_EMAIL` absichern — die
      abgesicherte Requirement entfällt mit diesem Change. Die Tests in
      `tests/spec/monitoring-alerts/backup-alerting.bats` bleiben unverändert: sie prüfen
      Prometheus-Regeln und den Matcher-Strategy-Patch, die beide bestehen bleiben.

- [x] **Task 6 — Delta-Specs gegen die Implementierung gegenprüfen.**
      `openspec/changes/disable-email-notifications/specs/monitoring-alerts.md` entfernt die
      Requirement „Email Notification Receiver", ändert „Alerts aus den Workspace-Namespaces
      erreichen einen Empfänger" und „Backup-Job-Failures lösen kritischen Alert aus" und ergänzt
      „Blackhole Receiver". `specs/website-core.md` ergänzt den Kill-Switch und den suspendierten
      CronJob. Prüfen, dass die Requirement-Überschriften in den MODIFIED/REMOVED-Blöcken
      **zeichengleich** mit denen in `openspec/specs/monitoring-alerts.md` sind — sonst schlägt
      der Delta-Merge beim Archivieren fehl. Anschließend:

```bash
bash scripts/openspec.sh validate
```

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Rollback

Der Change ist vollständig reversibel: `EMAIL_NOTIFICATIONS_ENABLED=true` in
`environments/<env>.yaml` plus `k3d/website.yaml` stellt die Website-Benachrichtigungen wieder
her, `suspend: false` den CronJob. Alertmanager und der Nextcloud-Digest brauchen einen Revert
der jeweiligen Manifest-Änderung — dafür liegen die entfernten Receiver-Blöcke in der
Git-Historie dieses Commits.
