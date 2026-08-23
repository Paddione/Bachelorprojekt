# Proposal: infra-kleinfixes-t014566

## Why

System-Audit 2026-08-23 fand drei Infra-Kleinfixes (SA-FC-02/03/04). T014539 wurde
bereits ops-seitig gelöst (stray test pod `brain-test` gelöscht, siehe Ticket-Kommentar).
Der Batch deckt die verbleibenden zwei Kinder ab:

- **T014538 [SA-FC-02]**: Staging-CronJobs crashen wiederholt — `admin-actions-cleanup`
  scheitert mit `ERROR: relation "public.admin_actions" does not exist` (Live-Log,
  Pod `admin-actions-cleanup-29791320-7v4kf`, 4 Restarts in ~2 min). Zusätzlich in
  derselben Fehlerklasse beobachtet: `scheduled-publish-29791320-hwnx9` (Error),
  `notify-unread-29791320-8srrs` (Error), `tests-results-retention-*` (viele Error-Pods
  über 33h). Prod-Namespace workspace ist nicht betroffen.
- **T014540 [SA-FC-04]**: GitLab-CI-Jobs brechen mit `InspectFailed "Failed to apply
  default image tag \"/ci-node22:latest\": invalid reference format"` (20× heute
  07:08–08:03). Root-Cause-Hypothese: `CI_REGISTRY_IMAGE` wird im GitLab-Pipeline-Kontext
  leer-expandiert, obwohl `.gitlab-ci.yml` das `:-`-Fallback trägt (eingeführt T012411,
  2026-08-19) — GitLab-Projektvariable oder Mirror-Stand als Ursache zu prüfen.

## What

1. **T014540 — CI-Image-Härtung:** `.gitlab-ci.yml` definiert `CI_REGISTRY_IMAGE`
   in-file unter `variables:` als Safety-Net (überschreibbar, aber nie mehr leer),
   sodass `${CI_REGISTRY_IMAGE:-…}` nicht mehr auf eine leere Projektvariable laufen
   kann. BATS-Guard verhindert Regression (`tests/spec/ci-cd/gitlab-ci-image-refs.bats`,
   Rot-Grün gegen heutigen Stand).
2. **T014538 — Staging-CronJobs:** Diagnose-first im Execute: frische Logs je Job,
   Schema-Abgleich staging `shared-db` vs. prod (`public.admin_actions` u.a.), dann Fix
   Richtung Schema-Parität (Migration/Init gegen staging) bzw. Manifest-/Endpoint-Fix.
   Zielobjekte: `k3d/admin-actions-cronjobs.yaml`, ggf. Staging-DB-Init.

_Ticket: T014566 (Batch-Parent; Kinder T014538, T014540 schließen einzeln)_
