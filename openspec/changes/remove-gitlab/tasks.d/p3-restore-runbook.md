---
title: "p3 — Restore-Runbook statt Runner-Runbook"
ticket_id: T900650
domains: [ci-cd]
status: active
---

# p3 — Restore-Runbook statt Runner-Runbook

Files: siehe Manifest-Zeile p3 in `../tasks.md`. Disjunkt zu p1, p2, p4.

## Task 3.1: Quelle lesen, dann loeschen

`docs/runbooks/gitlab-runner.md` vollstaendig lesen. Daraus fuer das neue Runbook uebernehmen:
Projekt-ID/URL des GitLab-Projekts, wie das Runner-Token (`glrt-`) erzeugt wird, wie das
Mirror-Token (Project Access Token, `glpat-`) erzeugt wird und welche Scopes es braucht.
Danach `git rm -q docs/runbooks/gitlab-runner.md`.

## Task 3.2: `docs/runbooks/gitlab-restore.md` anlegen

Deutsch, sachlich, ohne Emojis. Pflichtinhalt (der Test `tests/spec/ci-cd/github-only-ci.bats`
prueft die Stichworte `archive/gitlab-ci`, `GITLAB_MIRROR_TOKEN`, `GITLAB_MIRROR_URL`,
`GITLAB_RUNNER_TOKEN`, `gitlab-registry-auth`, `GITLAB_REGISTRY_PREFIX`, `GITLAB_REGISTRY_TOKEN`):

1. **Stand:** GitLab wurde mit T900650 entfernt. Tag `archive/gitlab-ci` zeigt auf den letzten
   `main`-Commit mit GitLab-Setup. Was damals aktiv war (nur Repo-Push-Mirror und Runner) und
   was nie aktiv war (Registry-Spiegel ohne `GITLAB_REGISTRY_*`, Fallback-Quelle suspended),
   mit Verweis auf `openspec/changes/archive/*remove-gitlab*/design.md`.
2. **Dateien zurueckholen:** ein kopierbarer Block

   ```bash
   git fetch origin tag archive/gitlab-ci
   git checkout archive/gitlab-ci -- .gitlab-ci.yml .gitlab-ci-images \
     .github/workflows/mirror-to-gitlab.yml \
     flux/clusters/fleet/ks-gitlab-runner.yaml flux/clusters/fleet/oci-source-gitlab.yaml \
     k3d/gitlab-runner-stack docs/runbooks/gitlab-runner.md \
     scripts/build-ci-images.sh scripts/ci-diff-base.sh scripts/gitlab-pipeline-check.sh \
     scripts/gitlab-runner-cache.sh scripts/gitlab-runner-setup.sh scripts/mirror-image-to-gitlab.sh \
     tests/spec/ci-cd/ci-diff-base.bats $(git ls-tree -r --name-only archive/gitlab-ci tests/spec/ci-cd | grep '/gitlab-')
   ```

   Danach die Teil-Aenderungen aus dem Tag per `git diff archive/gitlab-ci -- <datei>`
   zurueckuebernehmen: die zehn `build-*.yml` und `render-fleet-artifact.yml` (Spiegelschritte),
   `scripts/flux-render-artifact.sh` (Render-Block `gitlab-runner`), `taskfiles/Taskfile.platform.yml`
   (`gitlab-runner:render`), `environments/schema.yaml` (`GITLAB_RUNNER_TOKEN`,
   `GITLAB_RUNNER_REGISTRATION_TOKEN`), `docs/code-quality/gates.yaml`,
   `tests/spec/flux-render-security/runtime-var-unwrapping.bats`,
   `tests/spec/health-goals/korczewski-brand-pause.bats`.
3. **Specs zurueckholen:** neuer OpenSpec-Change, der die REMOVED-Requirements aus
   `openspec/changes/archive/*remove-gitlab*/specs/ci-cd.md` wieder als ADDED aufnimmt (Volltext
   aus `git show archive/gitlab-ci:openspec/specs/ci-cd.md`).
4. **Secrets neu anlegen:** Tabelle mit Name, Ort, Herkunft:
   - `GITLAB_MIRROR_TOKEN`, `GITLAB_MIRROR_URL`: GitHub-Repo-Secrets (`gh secret set`, mit TTY
     oder `--body`), Project Access Token aus GitLab.
   - `GITLAB_RUNNER_TOKEN` (+ `GITLAB_RUNNER_REGISTRATION_TOKEN` leer): in
     `environments/.secrets/fleet-mentolder.yaml` eintragen, dann `task env:seal` fuer fleet.
   - `gitlab-registry-auth`: Docker-Registry-Secret in `flux-system` fuer die Fallback-Quelle.
   - `GITLAB_REGISTRY_PREFIX`, `GITLAB_REGISTRY_TOKEN`: nur falls der Registry-Spiegel gewollt
     ist; waren nie gesetzt.
5. **Aktivieren und pruefen:** PR mergen, `flux --context fleet reconcile source oci fleet-manifests`,
   `kubectl --context fleet -n gitlab-runner get pods`, Pipeline mit
   `bash scripts/gitlab-pipeline-check.sh` pruefen. Hinweis: `tests/evals/golden/task-list-all.txt`
   braucht wegen `gitlab-runner:render` ein Human-Update mit `[evals-override]`.

## Task 3.3: `docs/runbooks/flux-suspensions.md`

In Zeile 18 (Tabelle der bewusst suspendierten Ressourcen) `OCIRepository \`fleet-manifests-gitlab\`;`
entfernen, Rest der Zeile unveraendert.

## Task 3.4: Pruefen

```bash
for n in archive/gitlab-ci GITLAB_MIRROR_TOKEN GITLAB_MIRROR_URL GITLAB_RUNNER_TOKEN gitlab-registry-auth GITLAB_REGISTRY_PREFIX GITLAB_REGISTRY_TOKEN; do grep -qF "$n" docs/runbooks/gitlab-restore.md || echo "FEHLT: $n"; done
git grep -n 'gitlab-runner.md' -- . ':!openspec/changes/archive' ':!docs/superpowers/plans' ':!docs/runbooks/gitlab-restore.md'
```

Der zweite Befehl darf nur Treffer in historischen Dateien liefern (CHANGELOG, ADR). Treffer in
aktiver Doku auf `gitlab-restore.md` umbiegen.
