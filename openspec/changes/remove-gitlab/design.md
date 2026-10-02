---
ticket_id: T900650
plan_ref: openspec/changes/remove-gitlab/tasks.md
status: active
date: 2026-09-27
---

# Design: remove-gitlab

## Kontext und Messung

Gemessen am 2026-09-27 gegen `origin/main` 3fe29c285:

```bash
# Registry-Spiegel nie konfiguriert: letzter erfolgreicher Render-Lauf meldet SKIP
id=$(gh run list --workflow render-fleet-artifact.yml --branch main --status success -L 1 --json databaseId -q '.[0].databaseId')
gh run view "$id" --log | grep 'SKIP: GitLab-Registry-Spiegel'
gh secret list | grep -i gitlab            # nur GITLAB_MIRROR_TOKEN, GITLAB_MIRROR_URL
# Fallback-Quelle abgeschaltet, ohne Artefakt
kubectl --context fleet -n flux-system get ocirepository fleet-manifests-gitlab -o jsonpath='{.spec.suspend} {.status.artifact.revision}'
# Runner-Stack laeuft
kubectl --context fleet -n gitlab-runner get pods
# Umfang
git grep -il gitlab origin/main -- . ':!openspec/changes/archive' ':!docs/superpowers/plans'
```

## Entscheidungen

- **D1 Loeschen:** `.gitlab-ci.yml`, `.gitlab-ci-images/`, `.github/workflows/mirror-to-gitlab.yml`,
  `scripts/{build-ci-images,gitlab-pipeline-check,gitlab-runner-cache,gitlab-runner-setup,mirror-image-to-gitlab,ci-diff-base}.sh`,
  `tests/spec/ci-cd/gitlab-*.bats`, `tests/spec/ci-cd/ci-diff-base.bats`, `docs/runbooks/gitlab-runner.md`.
  `ci-diff-base.sh` ruft ausschliesslich `.gitlab-ci.yml` auf.
- **D2 Workflows:** Schritt "Mirror image to GitLab registry" aus den zehn `build-*.yml`,
  Schritt "Mirror signed OCI artifact to GitLab registry" aus `render-fleet-artifact.yml`.
- **D3 Cluster:** `flux/clusters/fleet/ks-gitlab-runner.yaml`, `flux/clusters/fleet/oci-source-gitlab.yaml`,
  `k3d/gitlab-runner-stack/` loeschen; Render-Schritt `gitlab-runner` und dessen Eintrag in der
  Validierungsschleife aus `scripts/flux-render-artifact.sh`; Task `gitlab-runner:render` aus
  `taskfiles/Taskfile.platform.yml`; `GITLAB_RUNNER_TOKEN` aus `environments/schema.yaml` und
  der zugehoerige Eintrag plus SealedSecret `gitlab-runner-secret` aus
  `environments/sealed-secrets/fleet-mentolder.yaml`. Das `$$`-Escaping in
  `flux-render-artifact.sh` bleibt als allgemeiner Mechanismus.
- **D4 Specs:** 16 REMOVED in `ci-cd`, MODIFIED in `flux-render-security` und `health-goals`,
  ADDED in `ci-cd`: GitHub ist die einzige CI-Plattform und die Rueckholung ist dokumentiert.
- **D5 Restliche Tests:** `runtime-var-unwrapping.bats` verliert die Tests auf
  `gitlab-runner-rendered.yaml`; `korczewski-brand-pause.bats` verliert die Pruefung von
  `fleet-manifests-gitlab`; `awk-interval-portability.bats` nur Kommentar; `docs/code-quality/gates.yaml`
  und generierte Inventare per `task freshness:regenerate`.
- **D6 Unveraendert:** ADR-007, CHANGELOGs, `docs/archive/`, `docs/health-goals-history.md`,
  `.agents/docs/reorg-phase2/`, archivierte Changes, `.opencode/skills/gitops-*` (allgemeine
  Flux-Doku mit GitLab als Provider), `tests/e2e/specs/global-setup.ts` (SSO-Button-Regex).
- **D7 Nach dem Merge:** GH-Secrets `GITLAB_MIRROR_TOKEN`, `GITLAB_MIRROR_URL` loeschen;
  Secret `gitlab-registry-auth` in `flux-system` loeschen, falls vorhanden (liegt in keinem
  Manifest); `flux get ks`/`flux get sources oci` auf `fleet` zeigen `flux-gitlab-runner` und
  `fleet-manifests-gitlab` nicht mehr, Namespace `gitlab-runner` ist weg.
- **D8 Tag:** `archive/gitlab-ci` (annotiert) auf dem Parent des Squash-Commits, gepusht.
- **D9 Runbook:** `docs/runbooks/gitlab-restore.md` beschreibt die Rueckholung.

## Was verloren geht

- Die Code-Kopie auf GitLab wird nicht mehr aktualisiert. Das Projekt bleibt mit dem letzten Stand.
- Kein Registry- oder Flux-Fallback geht verloren: beide waren nie aktiv (siehe Messung).
- Die sekundaere GitLab-Pipeline entfaellt; sie war an keiner Stelle Merge-Gate.

## Rueckholung (Kurzfassung, Details im Runbook)

1. `git checkout archive/gitlab-ci -- <Pfadliste aus D1-D3>`; Workflow-Schritte aus dem Tag zurueckuebernehmen.
2. Requirements per neuem OpenSpec-Change aus `openspec/changes/archive/*remove-gitlab*/specs/` zurueckholen.
3. Secrets neu: GitLab-Project-Access-Token -> `GITLAB_MIRROR_TOKEN`/`GITLAB_MIRROR_URL`;
   `glrt-`-Runner-Token -> `GITLAB_RUNNER_TOKEN` (versiegeln via `task env:seal`);
   `gitlab-registry-auth` in `flux-system`; `GITLAB_REGISTRY_*` nur falls der Registry-Spiegel gewollt ist.
4. Flux reconcilen, Pipeline mit `scripts/gitlab-pipeline-check.sh` (aus dem Tag) pruefen.
