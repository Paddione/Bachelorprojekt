# Spec: Automatisches Rollback bei Failed Deploy

**Ticket:** 1e1c2151
**Datum:** 2026-06-10
**Status:** draft

---

## Problem

Der aktuelle `feature-promote.sh` hat zwei Rollback-Mechanismen:

1. **`roll()` Funktion** — `kubectl rollout status` mit `$ROLLBACK_TIMEOUT` (180s). Schlägt der Rollout fehl, wird `kubectl rollout undo` ausgefuehrt.
2. **`observe_prod()` Funktion** — Layer-4 Canary: 5 HTTP-Probes ueber 5 Minuten auf die Live-URL (`/api/health` + Playwright smoke). Bei ROT wird auf die vorherige Revision zurueckgerollt.

**Luecken:**
- Kein Pod-Status-Monitoring: CrashLoopBackOff wird nicht explizit erkannt, nur indirekt ueber `rollout status`.
- Keine Benachrichtigung: Rollbacks passieren still — der Operator erfährt nur aus dem Terminal-Output davon.
- `observe_prod()` wird nur im Promote-Flow aufgerufen, nicht nach `workspace:deploy` (dem push-basierten Prod-Deploy).
- Die 3x-Healthcheck-Regel aus dem Ticket ist nicht implementiert — `observe_prod()` macht 5 Probes, bricht aber erst nach allen 5 ab.

## Ziel

Nach jedem Deploy (sowohl `feature-promote.sh` als auch `workspace:deploy`) wird automatisch:
1. Fuer 5 Minuten der Pod-Status ueberwacht (CrashLoopBackOff, Error, OOMKilled).
2. Der Healthcheck-Endpoint 3x geprueft (60s Abstand). Bei 3 aufeinanderfolgenden Fehlern: Rollback.
3. Eine Pushover-Benachrichtigung an den Operator gesendet.

## Architektur

### Pushover-Integration

Neues Script `scripts/lib/notify.sh` als sourcable Library:
- Funktion `notify_pushover <title> <message> [priority]`
- Liest `PUSHOVER_TOKEN` und `PUSHOVER_USER` aus Environment oder `environments/.secrets/<env>.yaml`
- Wenn neither gesetzt: silent skip (kein Fehler, nur Warning)
- HTTP POST an `https://api.pushover.net/1/messages.json` via `curl`

### Post-Deploy-Monitor

Neue Funktion `post_deploy_watch()` in `feature-promote.sh`:
- Parameter: `<cluster> <deployment> <namespace> <context> <image>`
- Laeuft 5 Minuten (5 Checks, 60s Abstand)
- Jeder Check:
  1. `kubectl get pods` — prueft auf CrashLoopBackOff / Error / OOMKilled
  2. `curl -fsS <health-url>/api/health` — HTTP 200 erforderlich
- Zaehler fuer aufeinanderfolgende Healthcheck-Fehler
- Bei 3 aufeinanderfolgenden Fehlern ODER CrashLoopBackOff erkannt:
  - `kubectl rollout undo` auf die vorherige Revision
  - `notify_pushover "Rollback <service> <cluster>" "<details>"`
  - Return 1
- Wenn alle 5 Checks bestanden: Return 0

### Integration in feature-promote.sh

Die bestehende `observe_prod()` Funktion wird durch `post_deploy_watch()` ersetzt bzw. erweitert:
- Bisherige HTTP-Smoke-Logik bleibt erhalten (Playwright grep)
- Pod-Status-Check wird hinzugefuegt
- 3x-Regel statt 5x-Regel fuer Healthcheck-Fehler
- Pushover-Benachrichtigung bei Rollback

### Integration in workspace:deploy (Taskfile.yml)

Nach dem `kustomize build | kubectl apply` im Prod-Pfad:
- Optionaler Post-Deploy-Watch via `bash scripts/post-deploy-watch.sh <ENV>`
- Neues Script `scripts/post-deploy-watch.sh` das die Monitor-Logik aus `feature-promote.sh` als standalone-Script kapselt
- Wird in `workspace:deploy` nach dem Apply aufgerufen (nicht-blocking, mit Timeout)

## Secrets

Neue Secrets in `environments/schema.yaml`:
- `PUSHOVER_TOKEN` (optional, generate: false) — Pushover API Token
- `PUSHOVER_USER` (optional, generate: false) — Pushover User Key

Beide optional — ohne Werte wird die Notification uebersprungen.

## Deployment-Targets

Betrifft beide Brands (mentolder + korczewski) auf dem Fleet-Cluster.

## Nicht-Ziele

- Kein CronJob-basiertes kontinuierliches Monitoring (dafuer gibt es NFA-02 Tests)
- Kein automatisches Re-Deploy nach Rollback
- Keine Integration in `feature:deploy` (nur promote + workspace:deploy)
- Kein Multi-Cluster-Coordinator — jeder Cluster rollt independently
