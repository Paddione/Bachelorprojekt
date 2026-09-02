---
title: "p4-cronjobs — scheduled-publish + tests-results-retention (T900035)"
ticket_id: T900035
domains: [fleet-operations]
status: active
target_files: ["k3d/cronjob-scheduled-publish.yaml", "k3d/tests-retention-cronjob.yaml", "prod-korczewski/patch-cronjob-urls.yaml"]
---

# p4-cronjobs — scheduled-publish + tests-results-retention (T900035)

## Goal

Zwei CronJobs scheitern dauerhaft und stapeln fehlgeschlagene Pods (bis 11d alt). Die Ursachen
klaeren und beheben; die Reste-Raumung (ttlSecondsAfterFinished / failedJobsHistoryLimit) sicherstellen,
in eingefrorenen Namespaces suspendieren.

## Root-Cause / Befund

- `scheduled-publish` (workspace PROD + workspace-staging): Job erreicht BackoffLimitExceeded, Pod
  crasht ohne Log (leer → Diagnose blind). `k3d/cronjob-scheduled-publish.yaml` ruft per curl
  `http://website.website-staging.svc.cluster.local/api/cron/scheduled-publish` mit
  `-sf` (silent + fail) und CRON_SECRET. Leeres Log + Exit deutet auf falschen Ziel-Host (in PROD
  `workspace` statt `website-staging`?) oder nicht-2xx-/Auth-Fehler hin; `prod-korczewski/
  patch-cronjob-urls.yaml` zeigt, dass pro Marke die URL gepatched wird — PROD-Mentolder-Patch
  fehlt moeglicherweise.
- `tests-results-retention` (workspace-korczewski + workspace-staging): 7 fehlgeschlagene Pods pro
  Lauf, aeltester 11d. `workspace-korczewski` ist seit 2026-07-23 eingefroren (T002479), CronJob
  laeuft dort weiter. `k3d/tests-retention-cronjob.yaml` nutzt `${WORKSPACE_NAMESPACE}` /
  `${WEBSITE_NAMESPACE}` und kubectl-exec in die Website-Pods; Fehlerursache im Retention-Skript
  (z.B. fehlender Website-Pod in korczewski oder grep/exec-Problem) zu klaeren.

## File Structure

```
k3d/cronjob-scheduled-publish.yaml          # MODIFIED: URL-Abgleich, Error-Logging (nicht -s silent)
k3d/tests-retention-cronjob.yaml            # MODIFIED: ttlSecondsAfterFinished, suspend-Logik, Skript-Fix
prod-korczewski/patch-cronjob-urls.yaml     # MODIFIED: URL-Abgleich korczewski
tests/spec/fleet-operations/cronjob-hygiene.bats  # NEW (in p7): Guard
```

## Tasks

1. **Investigate (scheduled-publish):** Log des fehlgeschlagenen Pods pruefen
   (`kubectl --context fleet -n workspace logs job/<cronjob-<ts>> -c publish`). Ohne `-s`/`-sf`
   zuerst manuell dieselbe curl-URL aufrufen und HTTP-Code pruefen. Bestimmen, ob der Ziel-Host in
   PROD korrekt ist (workspace statt website-staging) und ob ein PROD-Mentolder-URL-Patch fehlt.
2. **Fix (scheduled-publish):** Ziel-URL pro Marke korrekt verdrahten; `-sf` durch ein
   fehler-sichtbares Logging ersetzen (beim Fehlschlag HTTP-Code/Body ausgeben), damit der naechste
   Lauf nicht blind ist. `CRON_SECRET`-Referenz verifizieren.
3. **Investigate (tests-results-retention):** Ein fehlgeschlagenes Job-Pod-Log pruefen
   (`kubectl --context fleet -n workspace-korczewski logs job/tests-results-retention-<ts>`).
   Ursache (Website-Pod nicht gefunden in korczewski weil eingefroren/kein pod, kubectl exec-Fehler)
   bestimmen.
4. **Fix (tests-results-retention):** In eingefrorenen Namespaces den CronJob suspendieren
   (Namespace-conditional, z.B. envsubst/Flux-Suspend oder guard-basierte Deaktivierung wie fuer
   frozen Brands). `ttlSecondsAfterFinished` setzen und `failedJobsHistoryLimit` auf einen kleinen
   Wert begrenzen, damit Reste sich nicht stapeln. Retention-Skript-Fehler beheben.
5. **Verify:** Keine BackoffLimitExceeded-"scheduled-publish"-Warnungen; keine sich stapelnden
   Fehl-Pods bei tests-results-retention; saubere History.

## Verify

Der BATS-Guard `cronjob-hygiene.bats` prueft die CronJob-Spec-Felder (ttlSecondsAfterFinished,
failedJobsHistoryLimit, suspend fuer eingefrorene Namespaces, korrekte URL):

```bash
# Requirement: Fehlschlagende CronJobs stapeln keine Pods und laufen zielgerichtet
# expected: FAIL (vor dem Fix fehlen ttl/suspend/korrekte URL)
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/cronjob-hygiene.bats
```
