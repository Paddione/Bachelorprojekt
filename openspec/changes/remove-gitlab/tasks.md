---
title: "remove-gitlab — Implementation Plan"
ticket_id: T900650
domains: [ci-cd]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# remove-gitlab — Implementation Plan

_Ticket: T900650_ · Design: `openspec/changes/remove-gitlab/design.md` (D1–D9) ·
Deltas: `specs/ci-cd.md`, `specs/flux-render-security.md`, `specs/health-goals.md`.

Der RED-Test `tests/spec/ci-cd/github-only-ci.bats` ist mit diesem Plan bereits committed
(3 von 4 Tests rot auf dem Plan-Stand). Alle Partials entfernen oder verkleinern nur.

## File Structure

```
.gitlab-ci.yml                                            (geloescht, p1)
.gitlab-ci-images/                                        (geloescht, p1)
.github/workflows/mirror-to-gitlab.yml                    (geloescht, p1)
.github/workflows/build-{brett,collabora,dev-pod,factory-runner,mediaviewer-widget,mentolder-web,sdlc-console,transcriber,videovault,website}.yml (geaendert, p1)
.github/workflows/render-fleet-artifact.yml               (geaendert, p1)
scripts/build-ci-images.sh                                (geloescht, p1)
scripts/ci-diff-base.sh                                   (geloescht, p1)
scripts/gitlab-pipeline-check.sh                          (geloescht, p1)
scripts/mirror-image-to-gitlab.sh                         (geloescht, p1)
docs/code-quality/gates.yaml                              (geaendert, p1)
flux/clusters/fleet/ks-gitlab-runner.yaml                 (geloescht, p2)
flux/clusters/fleet/oci-source-gitlab.yaml                (geloescht, p2)
k3d/gitlab-runner-stack/                                  (geloescht, p2)
scripts/gitlab-runner-cache.sh                            (geloescht, p2)
scripts/gitlab-runner-setup.sh                            (geloescht, p2)
scripts/flux-render-artifact.sh                           (geaendert, p2)
taskfiles/Taskfile.platform.yml                           (geaendert, p2)
environments/schema.yaml                                  (geaendert, p2)
environments/sealed-secrets/fleet-mentolder.yaml          (geaendert, p2)
environments/.secrets/fleet-mentolder.yaml                (geaendert, p2, git-crypt)
prod-fleet/dev-pod/kustomization.yaml                     (geaendert, p2, nur Kommentar)
docs/runbooks/gitlab-runner.md                            (geloescht, p3)
docs/runbooks/gitlab-restore.md                           (neu, p3)
docs/runbooks/flux-suspensions.md                         (geaendert, p3)
tests/spec/ci-cd/gitlab-*.bats (18 Dateien)               (geloescht, p4)
tests/spec/ci-cd/ci-diff-base.bats                        (geloescht, p4)
tests/spec/ci-cd/github-only-ci.bats                      (neu, bereits committed)
tests/spec/ci-cd/awk-interval-portability.bats            (geaendert, p4, nur Kommentar)
tests/spec/flux-render-security/runtime-var-unwrapping.bats (geaendert, p4)
tests/spec/health-goals/korczewski-brand-pause.bats       (geaendert, p4)
tests/spec/.spec-runtime.tsv                              (geaendert, p4)
components/website/src/data/test-inventory.json          (regeneriert, p4)
tests/evals/golden/task-list-all.txt                      (MENSCH, siehe Verify)
```

S1: Jede geaenderte Datei schrumpft. Keine der geaenderten Dateien ist in
`docs/code-quality/baseline.json` gebaselined; wirksame Schwelle ist das Extension-Limit
(`yq '.s1.limits' docs/code-quality/gates.yaml`). Kein Split noetig.

## Partials

| id | plan | role | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|--------------|------------|----------|------------|
| p1 | tasks.d/p1-ci-workflows.md | impl | .gitlab-ci.yml, .gitlab-ci-images/ci-node22.Dockerfile, .gitlab-ci-images/ci-node22-heavy.Dockerfile, .gitlab-ci-images/ci-node24.Dockerfile, .gitlab-ci-images/ci-ubuntu.Dockerfile, .gitlab-ci-images/README.md, .github/workflows/mirror-to-gitlab.yml, .github/workflows/build-brett.yml, .github/workflows/build-collabora.yml, .github/workflows/build-dev-pod.yml, .github/workflows/build-factory-runner.yml, .github/workflows/build-mediaviewer-widget.yml, .github/workflows/build-mentolder-web.yml, .github/workflows/build-sdlc-console.yml, .github/workflows/build-transcriber.yml, .github/workflows/build-videovault.yml, .github/workflows/build-website.yml, .github/workflows/render-fleet-artifact.yml, scripts/build-ci-images.sh, scripts/ci-diff-base.sh, scripts/gitlab-pipeline-check.sh, scripts/mirror-image-to-gitlab.sh, docs/code-quality/gates.yaml | | 4b-local | 32000 |
| p2 | tasks.d/p2-cluster-runner.md | impl | flux/clusters/fleet/ks-gitlab-runner.yaml, flux/clusters/fleet/oci-source-gitlab.yaml, k3d/gitlab-runner-stack/gitlab-runner-rendered.yaml, k3d/gitlab-runner-stack/kustomization.yaml, k3d/gitlab-runner-stack/namespace.yaml, k3d/gitlab-runner-stack/registry-cache.yaml, k3d/gitlab-runner-stack/values/gitlab-runner.yaml, scripts/gitlab-runner-cache.sh, scripts/gitlab-runner-setup.sh, scripts/flux-render-artifact.sh, taskfiles/Taskfile.platform.yml, environments/schema.yaml, environments/sealed-secrets/fleet-mentolder.yaml, environments/.secrets/fleet-mentolder.yaml, prod-fleet/dev-pod/kustomization.yaml | | 27b-local | 80000 |
| p3 | tasks.d/p3-restore-runbook.md | impl | docs/runbooks/gitlab-runner.md, docs/runbooks/gitlab-restore.md, docs/runbooks/flux-suspensions.md | | 27b-local | 80000 |
| p4 | tasks.d/p4-tests.md | tests | tests/spec/ci-cd/awk-interval-portability.bats, tests/spec/flux-render-security/runtime-var-unwrapping.bats, tests/spec/health-goals/korczewski-brand-pause.bats, tests/spec/.spec-runtime.tsv, components/website/src/data/test-inventory.json | p1,p2,p3 | 27b-local | 32000 |

Die zu loeschenden `tests/spec/ci-cd/gitlab-*.bats` und `ci-diff-base.bats` gehoeren zu p4
(Loeschung ueber `git rm`, Liste in `tasks.d/p4-tests.md`).

## Verify (RED → GREEN)

Der Failing-Test-Step steht in `tasks.d/p4-tests.md` (Task 4.1, `expected: FAIL`).

- [ ] **Task V: Finale Verifikation**
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/github-only-ci.bats
  tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/ tests/spec/flux-render-security/
  bash scripts/openspec.sh validate
  task workspace:validate
  task test:changed
  task freshness:regenerate
  task freshness:check
  ```
- [ ] **Task H (MENSCH, nicht vom Agenten):** Der Task `gitlab-runner:render` faellt weg, damit
  weicht `task --list-all` vom Eval-Golden ab. `tests/evals/` ist human-owned
  (`tests/evals/README.md`). Der Mensch fuehrt `EVALS_OVERRIDE=1 task test:evals:update` aus,
  committet `tests/evals/golden/task-list-all.txt` und traegt `[evals-override]` in den
  PR-Body ein. Der Agent stoppt vor dem Merge und fordert diesen Schritt an.

## Nach dem Merge (dev-flow-execute, Post-Merge)

1. Tag setzen und pushen (D8), `SQUASH` = SHA des Squash-Commits auf `main`:
   `git tag -a archive/gitlab-ci "${SQUASH}^" -m "Letzter Stand mit GitLab-CI/Runner/Spiegel [T900650]" && git push origin archive/gitlab-ci`
2. GH-Secrets loeschen (D7): `gh secret delete GITLAB_MIRROR_TOKEN` und `gh secret delete GITLAB_MIRROR_URL`.
3. Cluster pruefen, nachdem Flux das neue Artefakt gezogen hat:
   `flux --context fleet get ks -A | grep -c gitlab` ergibt 0,
   `kubectl --context fleet -n flux-system get ocirepository fleet-manifests-gitlab` meldet NotFound,
   `kubectl --context fleet get ns gitlab-runner` meldet NotFound.
4. `kubectl --context fleet -n flux-system get secret gitlab-registry-auth` — existiert es, loeschen.
