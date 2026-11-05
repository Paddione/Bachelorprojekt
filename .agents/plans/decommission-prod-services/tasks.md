---
title: "plan/decommission-prod-services — Dekommissionierung Nextcloud/Whiteboard/TURN/NATS/Janus/Redis"
domains: [infra, website, e2e]
status: staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# plan/decommission-prod-services — Implementation Plan

Dekommissionierung Nextcloud/Whiteboard/TURN/NATS/Janus/Redis.

Zweck: Nextcloud, Whiteboard, TURN (coturn), NATS, Janus, Redis laufen auf keinem Cluster mehr
(devmesh/k3d-gpu-serving/k3s-dev verifiziert leer, Fleet 2026-10-22 abgebaut; Eigner-Entscheid
2026-11-05 „sollen nirgends mehr laufen"). Health-Goals G-SVC03/04 + G-INF01-04 sind bereits
retiriert (`bb7b520ce`). Dieser Plan entfernt Manifeste, Env-/Ingress-/Taskfile-Einträge,
Produkt-Code (Whiteboard inkl.), E2E-Specs und Registry-Doku sauber.

Nicht-Ziele: DB-Schema-Migrationen (Brand korczewski frozen, Spalten bleiben ungenutzt stehen);
`docs/superpowers/specs/archive/` (Historie);夜间 E2E-Grünheit (G-E2E01 heilt separat).
Fremd-Sessions: keine aktiven Claims auf den Zieldateien (Lock-Liste geprüft).

## File Structure

| Datei | Ist-Zeilen | Status |
|---|---|---|
| `.agents/plans/decommission-prod-services/tasks.md` | 0 (neu) | neu (`.md` ungated) |
| `.agents/plans/decommission-prod-services/tasks.d/p1-k3d.md` | 0 (neu) | neu |
| `.agents/plans/decommission-prod-services/tasks.d/p2-prod-env.md` | 0 (neu) | neu |
| `.agents/plans/decommission-prod-services/tasks.d/p3-taskfile.md` | 0 (neu) | neu |
| `.agents/plans/decommission-prod-services/tasks.d/p4-website.md` | 0 (neu) | neu |
| `.agents/plans/decommission-prod-services/tasks.d/p5-tests-docs-adr.md` | 0 (neu) | neu |
| `.agents/plans/decommission-prod-services/tasks.d/p6-verify.md` | 0 (neu) | neu |
| `.agents/plans/decommission-prod-services/phase-events.log` | 0 (neu) | neu (Plan-Events) |
| `tests/py/spec/test_no_prod_services.py` | 55 | neu (RED-Test, p6) |
| `k3d/nextcloud.yaml` | 474 | LÖSCHEN (p1) |
| `k3d/nextcloud-redis.yaml` | 78 | LÖSCHEN (p1) |
| `k3d/nextcloud-notification-config-job.yaml` | 93 | LÖSCHEN (p1) |
| `k3d/talk-hpb.yaml` | 299 | LÖSCHEN (p1) |
| `k3d/talk-recording.yaml` | 108 | LÖSCHEN (p1) |
| `k3d/whiteboard/whiteboard.yaml` | 84 | LÖSCHEN (p1) |
| `k3d/whiteboard/kustomization.yaml` | 4 | LÖSCHEN (p1) |
| `k3d/coturn-stack/` (6 Dateien) | 327 | LÖSCHEN ganzes Verzeichnis (p1) |
| `k3d/talk-transcriber/` | prüfen | LÖSCHEN wenn talk-only, sonst Entry entfernen (p1) |
| `k3d/kustomization.yaml` | groß | ändern (Einträge raus, p1) |
| `k3d/ingress.yaml` | groß | ändern (files/board-Hosts raus, p1) |
| `k3d/secrets.yaml`, `k3d/website-dev-secrets.yaml` | groß | ändern (nur Nextcloud-Keys raus, p1) |
| `k3d/website.yaml`, `k3d/website-schema.yaml`, `k3d/pvc-backup-cronjob.yaml`, `k3d/vaultwarden-seed-job.yaml` | groß | ändern (nur Service-Refs raus, p1) |
| `prod/patch-nextcloud.yaml`, `prod/nextcloud-oidc-prod.php` | prüfen | LÖSCHEN (p2) |
| `prod-fleet/coturn/` (6 Dateien) | prüfen | LÖSCHEN ganzes Verzeichnis (p2) |
| `prod-mentolder/talk-transcriber.yaml` | prüfen | LÖSCHEN (p2) |
| `prod/kustomization.yaml`, `prod/ingress.yaml`, `prod/configmap-domains.yaml` | groß | ändern (p2) |
| `prod-mentolder/patch-data-pvc-storage.yaml` | groß | ändern (p2) |
| `environments/dev.yaml`, `environments/staging.yaml`, `environments/korczewski.yaml`, `environments/prodmesh-korczewski.yaml`, `environments/schema.yaml` | groß | ändern (p2, korczewski nur Datei-Edit, kein Cluster-Write — Freeze beachten) |
| `flux/clusters/fleet-gekko/ks-prod.yaml` | prüfen | ändern (Whiteboard-Ref raus, p2) |
| `taskfiles/Taskfile.workspace.yml` | groß | ändern (Nextcloud-Tasks raus, p3) |
| `apps/whiteboard/app.yaml` | 13 | LÖSCHEN (p4, Katalog-Generator prüfen) |
| `components/website/src/lib/whiteboard.ts` | 136 | LÖSCHEN (p4) |
| `components/website/src/lib/whiteboard.test.ts` | 104 | LÖSCHEN (p4) |
| `components/website/src/pages/api/meeting/finalize.ts`, `.../save-transcript.ts` | groß | ändern (Whiteboard-Pfade raus, p4) |
| `components/website/src/lib/meetings-db.ts`, `.../system-test-seed-data.ts` | groß | ändern (nur Whiteboard-Refs, p4) |
| `tests/e2e/specs/fa-24-whiteboard.spec.ts` | 77 | LÖSCHEN (p5) |
| `tests/local/FA-24.sh` | 41 | LÖSCHEN (p5) |
| `tests/e2e/playwright.config.ts` | groß | ändern (fa-24-Eintrag raus, p5) |
| `tests/e2e/specs/app-catalog.spec.ts` | groß | ändern (Whiteboard-Card-Block raus, p5) |
| `docs/agent-guide/registry/components.yaml` | groß | ändern (nextcloud/talk-hpb-Einträge raus, p5) |
| `docs/adr/ADR-0xx-decommission-prod-services.md` | 0 (neu) | neu (Entscheid-Doku, p5) |

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-k3d.md | impl | `k3d/nextcloud.yaml`, `k3d/nextcloud-redis.yaml`, `k3d/nextcloud-notification-config-job.yaml`, `k3d/talk-hpb.yaml`, `k3d/talk-recording.yaml`, `k3d/whiteboard/whiteboard.yaml`, `k3d/whiteboard/kustomization.yaml`, `k3d/coturn-stack/coturn-cert.yaml`, `k3d/coturn-stack/coturn.yaml`, `k3d/coturn-stack/janus.yaml`, `k3d/coturn-stack/kustomization.yaml`, `k3d/coturn-stack/namespace.yaml`, `k3d/coturn-stack/secret.yaml`, `k3d/kustomization.yaml`, `k3d/ingress.yaml`, `k3d/secrets.yaml`, `k3d/website-dev-secrets.yaml` |  |
| p2 | tasks.d/p2-prod-env.md | impl | `prod/patch-nextcloud.yaml`, `prod/nextcloud-oidc-prod.php`, `prod/kustomization.yaml`, `prod/ingress.yaml`, `prod/configmap-domains.yaml`, `prod-mentolder/talk-transcriber.yaml`, `prod-mentolder/patch-data-pvc-storage.yaml`, `environments/dev.yaml`, `environments/staging.yaml`, `environments/korczewski.yaml`, `environments/prodmesh-korczewski.yaml`, `environments/schema.yaml`, `flux/clusters/fleet-gekko/ks-prod.yaml` | p1 |
| p3 | tasks.d/p3-taskfile.md | impl | `taskfiles/Taskfile.workspace.yml` | p1 |
| p4 | tasks.d/p4-website.md | impl | `apps/whiteboard/app.yaml`, `components/website/src/lib/whiteboard.ts`, `components/website/src/lib/whiteboard.test.ts`, `components/website/src/pages/api/meeting/finalize.ts`, `components/website/src/pages/api/meeting/save-transcript.ts`, `components/website/src/lib/meetings-db.ts`, `components/website/src/lib/system-test-seed-data.ts` |  |
| p5 | tasks.d/p5-tests-docs-adr.md | impl | `tests/e2e/specs/fa-24-whiteboard.spec.ts`, `tests/local/FA-24.sh`, `tests/e2e/playwright.config.ts`, `tests/e2e/specs/app-catalog.spec.ts`, `docs/agent-guide/registry/components.yaml`, `docs/adr/ADR-0xx-decommission-prod-services.md` | p4 |
| p6 | tasks.d/p6-verify.md | tests | `.agents/plans/decommission-prod-services/verify.log`, `tests/py/spec/test_no_prod_services.py` | p1, p2, p3, p4, p5 |

Partials sind disjunkt (keine Datei in zwei impl-Partials). p2 hängt von p1 ab (k3d-Referenzfreiheit zuerst,
damit prod-Edits gegen ein sauberes k3d verifiziert werden). p5 hängt von p4 ab (Spec-Edits erst nach
Code-Entfernung). p6 läuft zuletzt.

## RED-Baseline (vor p1, belegt rot)

- `python3 -m pytest tests/py/spec/test_no_prod_services.py -q` → `expected: FAIL`
  (Dutzende Treffer: Manifeste, Env-Einträge, Produkt-Code, Specs, Registry-Doku).
  Nach p1–p5 muss derselbe Lauf GRÜN sein (nur Allowlist: Archiv-Historie, dieser Plan, ADR-Kontext).

## Verify (p6, letzter Task)

1. `kustomize build k3d/` + `kustomize build prod/` + `kustomize build prod-fleet/` grün (keine dangling refs).
2. Website: `npm run typecheck` + Vitest für geänderte Bereiche grün.
3. Repo-Suites zum Diff: `python3 -m pytest tests/py/spec/native_ported/spec/health-goals/ -q` grün.
4. Grep-Gate: `nextcloud|whiteboard|coturn|janus|nats|nextcloud-redis|talk-hpb` trifft nur noch Allowlist
   (`docs/superpowers/specs/archive/`, dieser Plan, ADR-Kontext, CHANGELOG-Historie).
5. Repo-Gates in einer Zeile: `task test:changed; task freshness:regenerate; task freshness:check;` (`generated_artifacts: true`).
6. `plan done $(date -u +%FT%TZ) plan-gestagt` in `phase-events.log` — danach STOPP, Übergabe an `dev-flow-execute`.
