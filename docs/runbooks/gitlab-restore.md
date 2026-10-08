# GitLab-Restore — Zurueckholen des entfernten GitLab-Setups

> **Zweck:** GitLab-CI, die GitLab-Runner und der Registry-Spiegel wurden mit
> T900650 aus dem Repository entfernt. Dieses Runbook beschreibt, wie man das
> Setup aus dem Archiv-Tag zurueckholt, falls GitLab als sekundaere, nicht
> blockierende CI-Plattform wieder gewollt ist. GitHub Actions bleibt in jeder
> Konfiguration SSOT und Merge-Gate.

## 1. Stand

- GitLab wurde mit T900650 entfernt. Der annotierte Tag `archive/gitlab-ci`
  zeigt auf den letzten `main`-Commit mit GitLab-Setup (Parent des
  Squash-Commits, gepusht).
- Aktiv war damals ausschliesslich der **Repo-Push-Mirror**
  (`.github/workflows/mirror-to-gitlab.yml`) und die **Runner** (lokaler
  Docker-Runner plus Kubernetes-Executor im Namespace `gitlab-runner` auf
  `fleet`), beide mit Tag `bachelorprojekt-local`.
- Nie aktiv waren der **Registry-Spiegel** (`GITLAB_REGISTRY_PREFIX` und
  `GITLAB_REGISTRY_TOKEN` wurden nie gesetzt; der letzte erfolgreiche
  Render-Lauf meldet `SKIP: GitLab-Registry-Spiegel nicht konfiguriert`) und
  die **Fallback-Quelle** `fleet-manifests-gitlab` (`suspend: true`, ohne
  Artefakt).
- Entscheidungen und Messung: `*remove-gitlab*/design.md` (Git-Verlauf).

## 2. GitLab-Projekt

- Projekt-ID: `85506856`
- Projekt-URL: `https://gitlab.com/p.korczewski/bachelorprojekt`
- Mirror-Ziel-URL (Wert fuer `GITLAB_MIRROR_URL`): volle HTTPS-URL mit Schema,
  ohne Trailing-Slash — `https://gitlab.com/p.korczewski/bachelorprojekt.git`.
  Der Mirror-Workflow entfernt selbst ein fuehrendes `https://` bzw. `http://`,
  entfernt aber keinen Trailing-Slash und waendelt keine SSH-Form um.
- Registry-Praefix (Wert fuer `GITLAB_REGISTRY_PREFIX`): ohne Schema und ohne
  abschliessenden Slash — `registry.gitlab.com/p.korczewski/bachelorprojekt`.

## 3. Tokens erzeugen

- **Runner-Token (`glrt-`):** Im GitLab-Projekt einen neuen Project Runner anlegen
  (Settings → CI/CD → Runners → "New project runner"), Tag `bachelorprojekt-local`
  vergeben, den `glrt-`-Authentication-Token kopieren. Der aeltere
  Registration-Token-Fluss funktioniert seit GitLab 16 nicht mehr — nur der
  Authentication-Token zaehlt. Jeder Runner braucht seinen eigenen Token; der
  lokale Docker-Runner und der Kubernetes-Runner auf `fleet` sind zwei getrennte
  Runner mit zwei getrennten Tokens.
- **Mirror-Token (`glpat-`):** Project-Access-Token (nicht Deploy-Token) unter
  GitLab-Projekt → Settings → Access Tokens mit Scope `write_repository`. Der
  Mirror-Workflow nutzt ihn als Basic-Auth-Passwort mit Benutzernamen `oauth2` —
  die von GitLab dokumentierte Form fuer Project-Access-Tokens.
- **Registry-Token (nur falls der Registry-Spiegel gewollt ist):**
  Project-Access-Token mit Scope `write_registry`, bewusst getrennt vom
  Mirror-Token — ein Token, das beides darf, waere im Ausfall genau der
  Schluessel, dessen Kompromittierung beide Wege zugleich trifft.

## 4. Dateien zurueckholen

Kopierbarer Block:

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
zurueckuebernehmen:

- die zehn `build-*.yml`-Workflows (Schritt "Mirror image to GitLab registry")
- `.github/workflows/render-fleet-artifact.yml` (Schritt "Mirror signed OCI
  artifact to GitLab registry")
- `scripts/flux-render-artifact.sh` (Render-Block `gitlab-runner`)
- `taskfiles/Taskfile.platform.yml` (Task `gitlab-runner:render`)
- `environments/schema.yaml` (`GITLAB_RUNNER_TOKEN`, `GITLAB_RUNNER_REGISTRATION_TOKEN`)
- `docs/code-quality/gates.yaml`
- `tests/py/spec/native_ported/spec/flux-render-security/test_runtime_var_unwrapping.py`
- `tests/py/spec/native_ported/spec/health-goals/test_korczewski_brand_pause.py`

## 5. Specs zurueckholen

Neuen Change anlegen, der die REMOVED-Requirements aus
`*remove-gitlab*/specs/ci-cd.md` (Git-Verlauf, 16 Requirements)
wieder als ADDED aufnimmt. Der Volltext der Requirements stammt aus
`git show archive/gitlab-ci:openspec/specs/ci-cd.md`.

## 6. Secrets neu anlegen

| Name | Ort | Herkunft |
|---|---|---|
| `GITLAB_MIRROR_TOKEN` | GitHub-Repository-Secret | GitLab-Project-Access-Token (`glpat-`), Scope `write_repository` |
| `GITLAB_MIRROR_URL` | GitHub-Repository-Secret | Vollstaendige Projekt-URL mit Schema, ohne Trailing-Slash |
| `GITLAB_RUNNER_TOKEN` | `environments/.secrets/fleet-mentolder.yaml`, danach `task env:seal ENV=fleet-mentolder` | `glrt-`-Authentication-Token des Project Runners |
| `GITLAB_RUNNER_REGISTRATION_TOKEN` | derselbe Eintrag | bleibt absichtlich leer (das Chart verlangt den Key, dieses Repo nutzt nur den `glrt-`-Fluss) |
| `gitlab-registry-auth` | Cluster-Secret in `flux-system` | GitLab-Deploy-Token mit Scope `read_registry` (nur falls die Fallback-Quelle gewollt ist) |
| `GITLAB_REGISTRY_PREFIX` | GitHub-Repository-Secret | Registry-Praefix ohne Schema und Slash (nur falls der Registry-Spiegel gewollt ist; war nie gesetzt) |
| `GITLAB_REGISTRY_TOKEN` | GitHub-Repository-Secret | Project-Access-Token mit Scope `write_registry` (nur falls der Registry-Spiegel gewollt ist; war nie gesetzt) |

Setzen per `gh secret set` mit TTY oder `--body`: ohne TTY schreibt `gh secret
set` einen leeren Wert, ein frischer Zeitstempel belegt also nicht, dass etwas
drinsteht. Danach einen echten Workflow-Lauf pruefen: solange ein
Registry-Secret fehlt, endet der Spiegel-Schritt mit
`SKIP: GitLab-Registry-Spiegel nicht konfiguriert` und der Push-Mirror benennt
das fehlende Secret sichtbar.

## 7. Aktivieren und pruefen

1. Restore-PR mergen.
2. `flux --context fleet reconcile source oci fleet-manifests`
3. `kubectl --context fleet -n gitlab-runner get pods` — der Runner-Pod muss
   `Running` sein (nicht `CrashLoopBackOff`); die Kustomization
   `flux-gitlab-runner` muss `READY=True` zeigen.
4. Pipeline mit `bash scripts/gitlab-pipeline-check.sh` pruefen (das Skript
   kommt aus dem Tag, siehe Abschnitt 4).
5. Hinweis: `tests/evals/golden/task-list-all.txt` braucht wegen des wieder
   eingefuehrten `gitlab-runner:render`-Tasks ein Human-Update mit
   `[evals-override]`.
