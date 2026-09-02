# Proposal: batch-sa-infra-T900041

## Why

Der System-Audit vom 2026-09-02 (tmp/claude-scratch/system-audit-infra-2026-09-02.md) hat sechs
unabhaengige infra-Flux-Probleme festgestellt, die Produktiv-Ausfaelle verursachen, Flux-Blöcke
ausloesen oder das Monitoring/den Betrieb lahmlegen. Da sie alle denselben flux-Fleet-Stack
betreffen und teils ueberlappende Namespaces/Dateien beruehren, werden sie als EIN Batch-Parent
(T900041) geplant, dessen Plan die Aenderungen aller Kinder (T900028, T900030, T900034, T900035,
T900036, T900037) als disjunkte Partials enthaelt. Die Kinder behalten ihre eigene external_id und
schliessen einzeln; der Parent ist Planungs- und Ausführungsanker.

Konkrete Schadensbilder:
- **T900028 (SA-FLUX-01):** Vaultwarden in PROD (`workspace`) seit 3d7h down (942 Neustarts,
  HTTP 503). Ursache verifiziert: `prod/patch-vaultwarden.yaml` setzt `SMTP_FROM_NAME`, aber nie
  `SMTP_FROM`; Vaultwarden verweigert den Start. `environments/mentolder.yaml:32` haelt den Wert
  bereits vor.
- **T900030 (SA-FLUX-02):** Penpot-Stack blockiert PROD+Staging (flux-staging Ready=False,
  HealthCheckFailed). `workspace/workspace-secrets` und `workspace-staging/workspace-secrets`
  fehlen die Keys `PENPOT_MINIO_SECRET_KEY`, `PENPOT_DB_PASSWORD`, `SESSIONS_CRON_TOKEN`.
- **T900034 (SA-FLUX-06):** Monitoring selbst ausgefallen: `blackbox-exporter` 11d in
  CreateContainerConfigError ("container has runAsNonRoot and image will run as root"), Grafana 3d8h
  in Init:0/1. Deshalb blieben die PROD-Ausfaelle unbemerkt.
- **T900035 (SA-FLUX-04):** `scheduled-publish` (PROD+Staging) und `tests-results-retention`
  (korczewski+Staging) scheitern dauerhaft; Fehl-Pods stapeln sich (bis 11d alt).
- **T900036 (SA-FLUX-07):** `ghcr-pull-secret` fehlt in `workspace-office` und `website-staging`
  (FailedToRetrieveImagePullSecret) — naechster Image-Pull schlaegt fehl.
- **T900037 (SA-FLUX-09):** Readiness-Dauerfehler: `nextcloud` (727 Restarts in Staging, HTTP 500;
  PROD timeout) und `llm-proxy` in `workspace-dev` (5170x connection refused auf :18235).

## What Changes

1. **T900028 — Vaultwarden SMTP_FROM:** `SMTP_FROM` in `prod/patch-vaultwarden.yaml` ergaenzen
   (envsubst `${SMTP_FROM}`), delegiert an `environments/mentolder.yaml:32`. Guard-Test: der Patch
   enthaelt `SMTP_FROM`-Key.
2. **T900030 — Penpot Secrets:** Verwaiste/redundante Penpot-ReplicaSets prunen; sicherstellen,
   dass die drei Secret-Keys in beiden `workspace-secrets`-Secrets vorhanden sind (env:seal fuer
   mentolder + staging neu ausfuehren, SealedSecret delta). Guard-Test: Schema + SealedSecrets + Live-Secret-Keys.
3. **T900034 — Monitoring:** `runAsUser: 65534` im blackbox-exporter-PodSpec setzen (oder nonroot
   Image), Grafana-Init-Container-Hang analysieren und beheben. Guard-Test: SecurityContext-Assertion.
4. **T900035 — CronJobs:** `scheduled-publish`-Fehlursache klaeren und beheben (leeres Log →
   wahrscheinlich falscher Ziel-Host/Secret); `ttlSecondsAfterFinished` + `failedJobsHistoryLimit`
   setzen; `tests-results-retention` in eingefrorenen Namespaces suspendieren + Retention-Skript-Fehler
   beheben. Guard-Test: CronJob-Spec-Assertionen.
5. **T900036 — ghcr-pull-secret:** `ghcr-pull-secret` in `workspace-office` und `website-staging`
   ausrollen (Secret/SealedSecret pro Namespace, wie in den funktionierenden Namespaces). Guard-Test:
   Secret-Existenz in beiden Namespaces.
6. **T900037 — Readiness:** Staging-Nextcloud 500er aus Logs klaeren + PROD readiness-Timeout
   pruefen; Dev-`llm-proxy`-Bedarf klaeren (sonst abbauen statt 5170 Fehlerevents). Guard-Test:
   Probe-Werte / Deployment-Ziel.

## Architektur-Entscheidungen

- **Ein Batch-Parent pro Welle:** statt sechs einzelner Changes laeuft ein dev-flow-plan-Lauf mit
  sechs disjunkten Partials; der Parent-Branch `fix/batch-sa-infra-T900041` deckt alle Kinder ab.
- **Root-Cause vor Fix (T002448-M5):** Jedes Partial beginnt mit der Ursachen-Verifikation (Symptom
  vs. Annahme) und belegt sie mit Log/Event-Evidenz, bevor der Fix entworfen wird.
- **Kein destruktiver Einsatz im Plan:** Pruning verwaister ReplicaSets / Suspendieren von CronJobs
  erfolgt kontrolliert (dry-run/kubectl describe zuerst), nie blind.
- **Kein `latest`-Fix:** Kritische Services schonen; nur die in den Tickets genannten, minimalen
  Manifest-/SealedSecret-Aenderungen.

## Impact

- Affected specs: `fleet-operations`, `vaultwarden-integration`, `monitoring-alerts`,
  `nextcloud-integration`, `local-llm-proxy`, `secrets-deploy-automation`
- Affected code:
  - `prod/patch-vaultwarden.yaml` (SMTP_FROM)
  - `k3d/penpot.yaml`, `environments/schema.yaml`, `environments/sealed-secrets/*.yaml` (env:seal)
  - `k3d/monitoring/blackbox-exporter.yaml`, `k3d/monitoring/kube-prometheus-stack-rendered.yaml`
  - `k3d/cronjob-scheduled-publish.yaml`, `k3d/tests-retention-cronjob.yaml`,
    `prod-fleet/*-jobs/`-Overlays
  - ghcr-pull-secret Secret/SealedSecret fuer `workspace-office` + `website-staging`
  - `prod/patch-nextcloud.yaml`, `k3d/nextcloud.yaml`, llm-proxy-Deployment (dev)
- Neue Tests: `tests/spec/fleet-operations/` (je ein Guard-Test pro Partial bzw. pro Ticket)

_Ticket: T900041_
