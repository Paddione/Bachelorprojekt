## ADDED Requirements

### Requirement: GitLab-Parallelbetrieb — GitHub bleibt SSOT und Merge-Gate

The system SHALL run GitLab CI as a **secondary, non-blocking** verification alongside GitHub
Actions during the migration. GitHub Actions SHALL remain the single source of truth for merge
decisions: no GitLab pipeline result SHALL be wired into branch protection, and no existing
GitHub workflow SHALL be disabled, deleted, or made conditional as part of this stage.

The GitLab side SHALL be reachable as a read-only mirror; development, review and merge SHALL
continue to happen on GitHub.

#### Scenario: GitLab-Pipeline rot blockiert keinen Merge

- **GIVEN** die GitLab-Pipeline für den aktuellen `main`-Stand schlägt fehl
- **WHEN** auf GitHub ein PR mit grünen Checks vorliegt
- **THEN** ist der Merge nicht blockiert — GitLab ist an keiner Stelle als Required Check hinterlegt

#### Scenario: Kein GitHub-Workflow wird in dieser Etappe stillgelegt

- **GIVEN** die Etappe-1-Änderungen sind gemergt
- **WHEN** die Workflow-Dateien unter `.github/workflows/` gezählt und auf `if:`-Kurzschlüsse geprüft werden
- **THEN** ist kein bestehender Workflow entfernt und keiner durch eine neue Bedingung dauerhaft übersprungen

---

### Requirement: Spiegelung GitHub → GitLab per Push-Mirror

The system SHALL mirror the repository to GitLab from a GitHub Actions workflow that runs on
pushes to `main` and pushes with an **explicit refspec** for the `main` branch and for tags,
authenticated by a GitLab Project-Access-Token (`glpat-` prefix) held as a GitHub secret.

`git push --mirror` SHALL NOT be used: it transfers every ref in the local repository,
including `refs/remotes/origin/*` for every open feature branch that a full-history checkout
carries — refs the mirror direction explicitly excludes. Those refs would land on GitLab
invisibly under `refs/remotes/`, outside what the GitLab UI lists and outside what `git gc`
ever reclaims. `--mirror` also deletes on GitLab any ref absent from the source side, which
can destroy state GitLab itself created. An explicit refspec push can do neither: it can only
create or fast-forward `refs/heads/main` and the tag refs it names.

Pull-Mirroring SHALL NOT be relied upon: it is a paid gitlab.com feature and therefore not
available on the project's plan. The mirror direction SHALL be GitHub → GitLab only, so that
GitLab never becomes a second writable origin.

#### Scenario: Push auf main erreicht GitLab

- **GIVEN** ein Commit wird nach `main` gemergt
- **WHEN** der Mirror-Workflow läuft
- **THEN** zeigt der GitLab-`main` denselben Commit-SHA wie der GitHub-`main`

#### Scenario: Fehlendes Mirror-Secret bricht sichtbar ab

- **GIVEN** das GitLab-Token-Secret ist im GitHub-Repository nicht gesetzt
- **WHEN** der Mirror-Workflow startet
- **THEN** bricht er mit einer Meldung ab, die das fehlende Secret benennt — statt still ohne Spiegelung zu enden

---

### Requirement: Compute-Fallback per Runner-Tag-Variable

The system SHALL route every GitLab CI job to a runner through the CI/CD variable
`CI_RUNNER_TAG`, declared in each job as `tags: [$CI_RUNNER_TAG]`. Switching the whole pipeline
between self-hosted compute and gitlab.com Shared Runners SHALL require changing only that
variable's value — no change to `.gitlab-ci.yml`, no duplicated job definitions, and no second
pipeline file.

No job SHALL hard-code a runner tag, because a hard-coded tag is exactly the case the fallback
must survive.

The default value SHALL select the self-hosted runner; the SaaS tag SHALL be used only as the
documented fallback.

#### Scenario: Umschalten auf Cloud-Compute ohne Codeänderung

- **GIVEN** der self-hosted Runner ist nicht verfügbar
- **WHEN** die Projekt-Variable `CI_RUNNER_TAG` auf den SaaS-Tag gesetzt wird
- **THEN** laufen dieselben Jobs unverändert auf gitlab.com Shared Runnern — ohne Commit auf `.gitlab-ci.yml`

#### Scenario: Hartkodierter Tag wird abgelehnt

- **GIVEN** ein Job in `.gitlab-ci.yml` deklariert einen Tag als Literal statt über die Variable
- **WHEN** der CI-Guard über die Jobdefinitionen läuft
- **THEN** schlägt er fehl und benennt den betroffenen Job

---

### Requirement: Werkzeug-Parität zwischen GitHub- und GitLab-Pipeline

The system SHALL pin the same tool versions in both CI systems for any check that exists on
both sides. Specifically, the gitleaks version used in `.gitlab-ci.yml` SHALL equal the version
used in `.github/workflows/ci.yml`, and both SHALL invoke it with the same arguments
(`--config .gitleaks.toml --no-git --redact`).

A drift guard SHALL extract the version from both files and compare them, so that bumping one
side without the other fails CI rather than silently producing two different security verdicts
for the same working tree.

#### Scenario: Auseinanderlaufende gitleaks-Version schlägt fehl

- **GIVEN** `.github/workflows/ci.yml` pinnt gitleaks auf eine andere Version als `.gitlab-ci.yml`
- **WHEN** der Paritäts-Guard läuft
- **THEN** schlägt er fehl und nennt beide gefundenen Versionen

#### Scenario: Gleiche Version besteht den Guard

- **GIVEN** beide Dateien pinnen dieselbe gitleaks-Version
- **WHEN** der Paritäts-Guard läuft
- **THEN** besteht er, und beide Versionen sind im Testausgang sichtbar

---

### Requirement: Runner-Registrierung über Authentication-Token

The system SHALL provide a repeatable, non-interactive registration path for the self-hosted
runner via `scripts/gitlab-runner-setup.sh`, using a runner **authentication token**
(`glrt-` prefix, passed as `--token`).

The deprecated registration-token flow (`--registration-token`) SHALL NOT be used: it is
removed from current GitLab versions, so a script built on it would fail at the moment it is
first needed.

The script SHALL offer a dry-run mode that prints the registration command it would execute
without contacting GitLab and without writing runner configuration, so the command can be
verified in CI where no runner and no token exist.

#### Scenario: Dry-Run zeigt den Registrierungsbefehl ohne Seiteneffekt

- **GIVEN** weder ein GitLab-Token noch ein installierter `gitlab-runner` liegen vor
- **WHEN** das Setup-Skript im Dry-Run-Modus aufgerufen wird
- **THEN** gibt es den vollständigen `gitlab-runner register`-Aufruf aus, beendet sich mit Exit-Code 0 und verändert keine Runner-Konfiguration

#### Scenario: Fehlendes Token im Echtlauf bricht ab

- **GIVEN** die Token-Variable ist nicht gesetzt
- **WHEN** das Setup-Skript ohne Dry-Run aufgerufen wird
- **THEN** bricht es mit Exit-Code ≠ 0 ab und benennt die fehlende Variable, statt eine unvollständige Registrierung zu versuchen

---

### Requirement: GitLab-Kern-Jobs spiegeln die GitHub-Offline-Gates

The system SHALL define three jobs in `.gitlab-ci.yml` that mirror the existing GitHub offline
gates: BATS unit tests, Kubernetes manifest validation, and the gitleaks secret scan.

The BATS job SHALL use the vendored runner at `tests/unit/lib/bats-core/bin/bats`, not a
globally installed `bats`, matching the repository convention that CI and local runs execute
the same binary.

These jobs SHALL NOT reuse the diff-scoped selection used on GitHub
(`scripts/find-changed-tests.sh`, `task test:changed`, and its alias `task test:all`): the
mirror receives pushes to `main`, where a diff against `main` selects nothing. The GitLab jobs
SHALL therefore run the full corresponding set.

#### Scenario: Mirror-Lauf führt tatsächlich Tests aus

- **GIVEN** die GitLab-Pipeline läuft auf einem `main`-Mirror-Push
- **WHEN** der BATS-Job ausgeführt wird
- **THEN** ist die Zahl der ausgeführten Tests größer als null — ein leerer Lauf gilt als Fehlschlag, nicht als Erfolg

#### Scenario: Vendored BATS-Runner statt globalem Binary

- **GIVEN** die Jobdefinition des BATS-Jobs
- **WHEN** der CI-Guard das Testkommando prüft
- **THEN** verweist es auf den mitgelieferten Runner unter `tests/unit/lib/`
