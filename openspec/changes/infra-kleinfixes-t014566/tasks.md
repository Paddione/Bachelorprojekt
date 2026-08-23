---
title: "infra-kleinfixes-t014566 — Implementation Plan (Batch T014538 + T014540)"
ticket_id: T014566
domains: [infra, ci]
status: active
file_locks: [".gitlab-ci.yml", "k3d/admin-actions-cronjobs.yaml"]
shared_changes: false
batch_id: T014566
parent_feature: null
depends_on_plans: []
---

# infra-kleinfixes-t014566 — Implementation Plan (Batch T014538 + T014540)

_Ticket: T014566_ · Kinder: **T014540** (CI-Image-Refs), **T014538** (Staging-CronJobs).
T014539 wurde vor dem Staging ops-seitig gelöst (stray pod `brain-test` gelöscht) und ist
nicht Teil dieses Plans.

## File Structure

```
.gitlab-ci.yml                                        — T014540: Image-Refs hartkodieren
tests/spec/ci-cd/gitlab-ci-image-refs.bats            — T014540: Guard (RED → GREEN)
k3d/admin-actions-cronjobs.yaml                       — T014538: nur falls Manifest-Anteil bleibt
openspec/changes/infra-kleinfixes-t014566/tasks.md    — dieser Plan
```

## Befund (Evidence)

**T014540:** Cluster-Events 2026-08-23 07:08–08:03: `InspectFailed "Failed to apply
default image tag \"/ci-node22:latest\": invalid reference format"` 20×. `.gitlab-ci.yml`
nutzt seit T012411 (2026-08-19) `${CI_REGISTRY_IMAGE:-registry.gitlab.com/…}/ci-node22:latest`.
Die Indirektion ist die Schwachstelle: GitLab-Projekt-Variablen haben Vorrang vor
Datei-Variablen (eigenes Kommentar zu CI_RUNNER_TAG, .gitlab-ci.yml:25–27) — eine in der
GitLab-UI leere `CI_REGISTRY_IMAGE` erzeugt exakt `/ci-node22:latest`. Kein Repo-Pfad
definiert die Variable; `scripts/build-ci-images.sh` nennt sie nur als manuellen Aufruf-
Parameter. Prior-Art-Revision bewusst: T012411-Flexibilität wird gegen Ausfallsicherheit
getauscht, weil kein Konsument die Variable je überschreibt.

**T014538:** Live-Logs 2026-08-23: `admin-actions-cleanup-29791320-7v4kf` (Error,
`ERROR: relation "public.admin_actions" does not exist`), `scheduled-publish-29791320-hwnx9`
(Error, keine Logs abgreifbar — Container frisch), `notify-unread-29791320-8srrs` (Error),
`tests-results-retention-*` Error-Pods über 33h. Prod (`workspace`) läuft parallel fehlerfrei.
Manifeste: `k3d/admin-actions-cronjobs.yaml`, `k3d/cronjob-scheduled-publish.yaml`,
`k3d/notify-unread-cronjob.yaml` (alle pinnen Digests, securityContext ok).

## Task List

- [ ] **T014540 — Image-Refs hartkodieren.** In `.gitlab-ci.yml` alle 9 Fundstellen
      `${CI_REGISTRY_IMAGE:-registry.gitlab.com/p.korczewski/bachelorprojekt/ci}/<img>:<tag>`
      durch `registry.gitlab.com/p.korczewski/bachelorprojekt/ci/<img>:<tag>` ersetzen.
      Keine neue Variable einführen (Präzedenz-Falle). Kommentar an den ersten beiden
      Fundstellen mit Verweis auf diesen Plan und das InspectFailed-Ereignis ergänzen.
- [ ] **T014538 — Diagnose (vor jedem Fix).**
      1. Frische Logs je Staging-Job: `kubectl --context fleet logs -n workspace-staging
         job/admin-actions-cleanup-<ts>` (analog scheduled-publish, notify-unread,
         tests-results-retention).
      2. Schema-Abgleich staging vs. prod:
         `kubectl --context fleet exec -n workspace-staging deploy/shared-db -- psql -U <user> -d <db> -c '\dt public.*'`
         gegen dasselbe im Namespace `workspace`; fehlende Relationen notieren
         (erwartet: `public.admin_actions` und ggf. Tabellen von scheduled-publish/
         notify-unread/tests-results-retention).
      3. Festhalten, wie Prod sein Schema bekommt (Website-Migrationen beim Deploy?) und
         warum staging davon abweicht.
- [ ] **T014538 — Fix Richtung Schema-Parität.** Bevorzugt: denselben Migrationsweg, den
      Prod nutzt, einmalig gegen staging ausführen (Datenverlust-Risiko staging bewusst
      nein: nur DDL, keine Löschung). Falls der Migrationsweg staging strukturell nicht
      erreicht, stattdessen einen Init-/Sync-Schritt ergänzen und im
      `k3d/kustomization.yaml`-Verbund dokumentieren. Manifeste nur anfassen, wenn die
      Diagnose einen echten Manifest-Fehler zeigt (erwartet: nein — Manifeste sind korrekt
      gepinnt und gehärtet).
- [ ] **GREEN-Nachweis T014538.** Nächsten CronJob-Lauf abwarten oder Job manuell triggern
      (`kubectl --context fleet create job --from=cronjob/admin-actions-cleanup
      admin-actions-cleanup-manual -n workspace-staging`); Pod muss mit exit 0 enden und
      ohne `relation … does not exist`.
- [ ] **Failing-Test-Step (RED → GREEN).**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/gitlab-ci-image-refs.bats
# expected: FAIL vor dem .gitlab-ci.yml-Fix (Indirektion noch vorhanden),
#           GREEN nach dem Hardcoding. Test 2/3 sind positive Anker.
```

## Verify

- [ ] `./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/gitlab-ci-image-refs.bats` → 3/3 grün
- [ ] `task test:changed` → grün
- [ ] `task freshness:regenerate && task freshness:check` → grün
- [ ] `task workspace:validate` → kustomize Dry-Run grün
