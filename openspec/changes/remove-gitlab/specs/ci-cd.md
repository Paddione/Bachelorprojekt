## ADDED Requirements

### Requirement: GitHub Actions ist die einzige CI-Plattform

The repository SHALL define CI only as GitHub Actions workflows. It SHALL NOT contain a
`.gitlab-ci.yml`, GitLab CI image definitions, a GitLab runner stack, a Flux source or
Kustomization for GitLab, or a workflow step that pushes to `registry.gitlab.com` or mirrors
the repository to GitLab. The runbook `docs/runbooks/gitlab-restore.md` SHALL describe how to
restore the removed GitLab setup from the git tag `archive/gitlab-ci`.

#### Scenario: Kein GitLab-Artefakt im Repo

- **GIVEN** the tracked files of the repository
- **WHEN** `git ls-files` is listed for `.gitlab-ci.yml`, `.gitlab-ci-images/`, `k3d/gitlab-runner-stack/`, `flux/clusters/fleet/*gitlab*` and `.github/workflows/mirror-to-gitlab.yml`
- **THEN** the listing is empty
- **AND** no file under `.github/workflows/` references `registry.gitlab.com` or `GITLAB_`

#### Scenario: Rueckholung ist dokumentiert

- **GIVEN** the runbook `docs/runbooks/gitlab-restore.md`
- **WHEN** it is read
- **THEN** it names the tag `archive/gitlab-ci` and every secret that must be recreated

## REMOVED Requirements

### Requirement: GitLab-Parallelbetrieb — GitHub bleibt SSOT und Merge-Gate

GitLab CI entfaellt; GitHub Actions ist die einzige Pipeline.

### Requirement: Spiegelung GitHub → GitLab per Push-Mirror

mirror-to-gitlab.yml entfaellt; das GitLab-Projekt wird nicht mehr aktualisiert.

### Requirement: Compute-Fallback per Runner-Tag-Variable

Es gibt keine GitLab-Jobs mehr, die geroutet werden.

### Requirement: Werkzeug-Parität zwischen GitHub- und GitLab-Pipeline

Ohne zweite Pipeline gibt es keine Paritaet zu sichern.

### Requirement: Runner-Registrierung über Authentication-Token

scripts/gitlab-runner-setup.sh entfaellt mit dem Runner.

### Requirement: GitLab-Kern-Jobs spiegeln die GitHub-Offline-Gates

.gitlab-ci.yml entfaellt.

### Requirement: GitLab-Pipeline-Status ist lesbar klassifiziert

scripts/gitlab-pipeline-check.sh entfaellt.

### Requirement: CI-Runner auf fleet läuft in einer harten Ressourcen-Umzäunung

Der Runner-Stack auf fleet wird entfernt.

### Requirement: CI-Jobs erhalten keinen Cluster-Zugriff

Galt fuer GitLab-Job-Pods auf fleet, die es nicht mehr gibt.

### Requirement: Image-Pulls laufen über einen Pull-Through-Cache

Der registry-cache diente nur den GitLab-Runnern.

### Requirement: Ausfall eines Runners legt die Pipeline nicht still

Es gibt keine self-hosted GitLab-Runner mehr.

### Requirement: Gerenderte Helm-Artefakte folgen der bestehenden Repo-Konvention

Betraf nur das gerenderte gitlab-runner-Chart.

### Requirement: GitLab-Jobs decken jeden Offline-Gate-Job aus ci.yml ab

.gitlab-ci.yml entfaellt.

### Requirement: Diff-Basis wird an einer Stelle aufgeloest und meldet ihr Fehlen

scripts/ci-diff-base.sh wurde nur von .gitlab-ci.yml aufgerufen.

### Requirement: Commit-Lint auf GitLab prueft den Commit-Range

Der GitLab-Job commit-lint entfaellt; GitHub prueft weiter.

### Requirement: GitLab CI image refs carry a full registry host

.gitlab-ci.yml und .gitlab-ci-images/ entfallen.
