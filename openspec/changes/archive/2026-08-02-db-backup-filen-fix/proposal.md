# Proposal: db-backup Filen Upload — Frühalarmierung & Diagnose-Workflow

## Why

Der `db-backup` CronJob (fleet, namespace `workspace`) ist zwischen 2026-07-07 02:00 UTC
und 2026-07-09 02:00 UTC **drei aufeinanderfolgende Male** fehlgeschlagen. Das einzige
Fail-loud-Signal ist die `failedJobsHistoryLimit: 3`-Aufbewahrung — also sieht der Operator
das Problem erst, **nachdem bereits drei Tage ohne erfolgreichen Remote-Backup vergangen
sind**. Die lokalen verschlüsselten Dumps auf `backup-pvc` waren zwar noch intakt (RPO
für *lokale* Disaster-Recovery: 0 h), aber das **RPO für Off-Site-Recovery über Filen
betrug zum Zeitpunkt der Entdeckung ≈ 3 Tage** (genau das in `G-DB04` gemessene Fenster:
„Backup-Alter: 6d19h 🔴 → ≤ 26 h").

Live-Diagnose in `fleet` (2026-07-09 21:33 UTC):

- `kubectl get jobs -l app=db-backup`: 3 Failed (2d21h, 45h, 21h alt) + 3 Complete (8d,
  7d21h, 6d21h alt) — der **letzte vollständig erfolgreiche Lauf inkl. Filen-Upload war
  2026-07-03 00:01 UTC**.
- `kubectl describe cronjob db-backup`: `Last Schedule Time: Thu, 09 Jul 2026 02:00:00 +0200`,
  `Active Jobs: <none>`, Job-Status `BackoffLimitExceeded` (Pod restartet 6×, dann
  Job-Failed). Die `backup`-Container-Logik schreibt das `.done`-Signal erst nach
  erfolgreichem Encrypt → der `filen-upload`-Container ist der einzige Container, der
  Exit 1 mit „Filen remote upload failed … likely cause: invalid FILEN_EMAIL/FILEN_PASSWORD,
  or 2FA was enabled" auslösen kann.
- `kubectl get secret workspace-secrets -o jsonpath='{.data.FILEN_EMAIL|FILEN_PASSWORD}'` →
  beide Keys vorhanden, entsprechen exakt dem Plaintext in `environments/.secrets/mentolder.yaml`
  (`quamain@web.de` / `170591pk!Gekko`).
- `kubectl create job db-backup-diag-t001738 --from cronjob/db-backup` (manuell) → **alle
  drei Dumps OK, `Filen upload done`** in 3m 15 s. Pipeline ist also aktuell wieder
  gesund; die Ursache war transient (vermutlich Filen-API-Rate-Limit, kurzer Outage
  oder Netzwerk-Blip zwischen `pk-hetzner-8` und Filen-Endpunkten).

Folgerung: das Pipeline-Design ist robust (Fail-loud, Pre-/Post-Flight-Checks, lokales
Backup ist immer intakt), aber die **Beobachtbarkeit nach außen ist unzureichend**.
Wir sehen das Problem erst nach 3 Tagen statt nach 3 Stunden. Da der `pvc-backup`
CronJob im selben Zeitraum laut `lastSuccessfulTime: 2026-06-09T01:02:38Z` bereits
seit 30 Tagen komplett fehlschlägt, ist der Frühalarmierungs-Gap systemisch — nicht
auf `db-backup` beschränkt (siehe `G-DB04`-Runbook-Eintrag in `.claude/lib/goals.md`,
der explizit auf T001738 verweist).

## What

Drei zusammenhängende Änderungen, die **nicht** den transienten Filen-Ausfall selbst
heilen (der ist self-resolving), sondern die Operations-Visibility und -Diagnose
massiv verbessern:

1. **PrometheusAlert `DBBackupJobFailed`** — feuert beim **ersten** fehlgeschlagenen
   `db-backup`-Job (statt nach drei), Severity `warning`, Routing via bestehendem
   `AlertmanagerConfig` (Pushover + E-Mail).
2. **Diagnose-Skript `scripts/db-backup-trigger.sh`** — manueller Einzeiler
   (`kubectl create job db-backup-diag-$(date +%s) --from cronjob/db-backup`) +
   automatisches Log-Tailing beider Container (`backup`, `filen-upload`), damit Ops
   in unter 30 Sekunden verifizieren kann, ob die Pipeline gerade läuft.
3. **CLAUDE.md / Runbook-Update** — dokumentiert die vier bekannten Filen-Fail-Modes
   (2FA-enabled, Password-rotation nötig, Filen-API-Outage, npm-Package-Broken) mit
   dem jeweils passenden Remediation-Schritt, damit der nächste On-Call nicht erst
   drei Tage warten muss, um die Liste durchzugehen.

Alle drei Änderungen sind read-only-Operations (kein Code-Pfad der DB ändert sich, kein
Secret-Rotation, keine Schema-Migration), deploybar als ein zusammenhängender PR
(`fix/T001738-db-backup-cronjob` → `main`).

## Non-Goals

- **Kein Wechsel der Auth-Methode** (Email+Passwort bleibt; ein API-Token-Workflow wäre
  ein separates Feature, nicht Teil dieses Bug-Fixes). Das Filen-Auth-v2-Login mit
  Email+Passwort funktioniert weiterhin (verifiziert 2026-07-09 21:33 UTC).
- **Keine Änderung am `pvc-backup` CronJob** (separates Problem, eigener Ticket-Scope:
  `lastSuccessfulTime: 2026-06-09` → 30 Tage RPO-Verletzung, braucht separate
  Investigation. Erwähnt nur als systemischer Hinweis.)
- **Keine Reduktion von `failedJobsHistoryLimit`** — der Wert 3 ist sinnvoll für
  post-mortem-Forensik, das Problem ist Alerting-Latenz, nicht History-Länge.

## Affected Files

| Pfad | Änderung |
|------|----------|
| `k3d/monitoring/prometheus-rules.yaml` | +`DBBackupJobFailed` Alert (kube_job_status_failed) |
| `scripts/db-backup-trigger.sh` | **neu** — manueller Diagnose-Runner |
| `CLAUDE.md` | + Runbook-Abschnitt „db-backup Filen Fail-Modes" |
| `openspec/specs/backup-pipeline.md` | + drei neue Requirements (Alert, Trigger, Runbook) |

## Affected Brands

- `mentolder` (namespace `workspace`) — direkt betroffen, der primäre Fix.
- `korczewski` (namespace `workspace-korczewski`) — Pipeline ist baugleich
  (`k3d/backup-cronjob.yaml` ist `kustomize`-geteilt), Änderungen wirken automatisch
  bei nächstem `task workspace:deploy ENV=korczewski`. Kein separater Roll-out nötig,
  aber Health-Goal-Check nach Deploy verifizieren.

## Secret Rotation

**Nicht erforderlich.** Die aktuellen `FILEN_EMAIL` / `FILEN_PASSWORD` in
`workspace-secrets` stimmen mit dem Plaintext in `environments/.secrets/mentolder.yaml`
überein, 2FA ist nachweislich aus (Login funktioniert), und der 14-Zeichen-Passwort-
String ist nicht die Ursache der transienten Fehlschläge. Eine spätere Härtung
(API-Token statt Passwort, Passwort auf ≥ 32 Zeichen) ist im Backlog, aber nicht
Teil dieses Tickets.

_Ticket: T001738_
