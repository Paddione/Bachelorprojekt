## MODIFIED Requirements

### Requirement: GitLab-Parallelbetrieb — GitHub bleibt SSOT und Merge-Gate

The system SHALL run GitLab CI as a **secondary, non-blocking** verification alongside GitHub
Actions until an explicit gate-switch stage retires that arrangement. GitHub Actions SHALL
remain the single source of truth for merge decisions for as long as this requirement stands:
no GitLab pipeline result SHALL be wired into branch protection, and no existing GitHub
workflow SHALL be disabled, deleted, or made conditional.

Reaching **parity of checks** SHALL NOT by itself change this. A stage that makes the GitLab
pipeline capable of gating (by mirroring branches and by covering every offline gate) SHALL
still leave GitHub as the gate; the switch is a separate, explicit decision.

The GitLab side SHALL remain a push target only: development and review SHALL continue to
happen on GitHub, and GitLab SHALL NOT become a second writable origin.

#### Scenario: GitLab-Pipeline rot blockiert keinen Merge

- **GIVEN** die GitLab-Pipeline für den aktuellen Stand schlägt fehl
- **WHEN** auf GitHub ein PR mit grünen Checks vorliegt
- **THEN** ist der Merge nicht blockiert — GitLab ist an keiner Stelle als Required Check hinterlegt

#### Scenario: Kein GitHub-Workflow wird stillgelegt

- **GIVEN** die Änderungen einer Migrationsetappe sind gemergt
- **WHEN** die Workflow-Dateien unter `.github/workflows/` gezählt und auf `if:`-Kurzschlüsse geprüft werden
- **THEN** ist kein bestehender Workflow entfernt und keiner durch eine neue Bedingung dauerhaft übersprungen

#### Scenario: Job-Parität allein schaltet das Gate nicht um

- **GIVEN** `.gitlab-ci.yml` deckt jeden Offline-Gate-Job aus `.github/workflows/ci.yml` ab
- **WHEN** die Branch-Protection-Konfiguration und die Job-Bedingungen in `ci.yml` geprüft werden
- **THEN** ist weiterhin kein GitLab-Ergebnis als Required Check hinterlegt und kein `ci.yml`-Job abgeschaltet

---

### Requirement: Spiegelung GitHub → GitLab per Push-Mirror

The system SHALL mirror the repository to GitLab from a GitHub Actions workflow that runs on
pushes to `main` **and to the repository's working-branch prefixes** (`feature/`, `fix/`,
`chore/`), pushing with an **explicit refspec** per branch plus the tag refs, authenticated by
a GitLab Project-Access-Token (`glpat-` prefix) held as a GitHub secret.

Mirroring working branches is what makes a pre-merge verification possible at all: a pipeline
that only ever sees `main` runs after the merge decision and therefore cannot inform it.

`git push --mirror` SHALL NOT be used. It transfers every ref in the local repository,
including `refs/remotes/origin/*` for every open branch that a full-history checkout carries —
refs the mirror direction explicitly excludes. Those refs would land on GitLab invisibly under
`refs/remotes/`, outside what the GitLab UI lists and outside what `git gc` ever reclaims.
`--mirror` also deletes on GitLab any ref absent from the source side, which can destroy state
GitLab itself created. Extending the mirror to working branches strengthens rather than
weakens this exclusion, because the checkout now carries more foreign refs, not fewer.

Branch deletion SHALL be mirrored as part of the mirroring, not left to cleanup: a `delete`
push event SHALL push an empty source ref for that branch. An unmirrored deletion leaves a
branch on GitLab that GitHub no longer has, and that stale branch remains a valid pipeline
target.

Branches outside the three working prefixes (bot branches such as Renovate or Release-Please,
and factory batch branches) SHALL NOT be mirrored, so that automated branch churn does not
consume runner capacity.

Pull-Mirroring SHALL NOT be relied upon: it is a paid gitlab.com feature and therefore not
available on the project's plan. The mirror direction SHALL be GitHub → GitLab only.

#### Scenario: Push auf main erreicht GitLab

- **GIVEN** ein Commit ist auf GitHub `main` gelandet
- **WHEN** der Mirror-Workflow läuft
- **THEN** zeigt der GitLab-`main` denselben Commit-SHA wie der GitHub-`main`

#### Scenario: Push auf einen Feature-Branch erreicht GitLab unter demselben Namen

- **GIVEN** ein Commit ist auf einen Branch mit Präfix `feature/`, `fix/` oder `chore/` gepusht
- **WHEN** der Mirror-Workflow läuft
- **THEN** existiert auf GitLab ein gleichnamiger Branch mit demselben Head-SHA

#### Scenario: Gelöschter Branch verschwindet auch auf GitLab

- **GIVEN** ein gespiegelter Arbeits-Branch wird auf GitHub gelöscht
- **WHEN** der Mirror-Workflow auf das `delete`-Event läuft
- **THEN** ist der gleichnamige Branch auf GitLab ebenfalls entfernt

#### Scenario: Bot-Branches werden nicht gespiegelt

- **GIVEN** ein Push auf einen Branch außerhalb der drei Arbeits-Präfixe (z. B. `renovate/…`)
- **WHEN** die Trigger-Bedingungen des Mirror-Workflows ausgewertet werden
- **THEN** löst er nicht aus

#### Scenario: Fehlendes Token bricht den Mirror sichtbar ab

- **GIVEN** das GitLab-Token-Secret ist im GitHub-Repository nicht gesetzt
- **WHEN** der Mirror-Workflow läuft
- **THEN** scheitert er mit einer Meldung, die das fehlende Secret benennt, statt still nichts zu tun

---

### Requirement: Werkzeug-Parität zwischen GitHub- und GitLab-Pipeline

The system SHALL keep every externally pinned tool version identical between
`.github/workflows/ci.yml` and `.gitlab-ci.yml`, so that the two pipelines test the same
behaviour rather than merely running suites of the same name. This SHALL cover every pinned
tool the two pipelines share — not a single tool — and SHALL be enforced by a guard that
compares the **version values** at their respective sites, not the surrounding text.

A version bump on one side without its counterpart on the other SHALL fail that guard.

#### Scenario: Divergente Version faellt auf

- **GIVEN** `.github/workflows/ci.yml` pinnt ein Werkzeug auf eine andere Version als `.gitlab-ci.yml`
- **WHEN** der Paritaets-Guard laeuft
- **THEN** schlaegt er fehl und benennt Werkzeug und beide Versionswerte

#### Scenario: Neu gepinntes Werkzeug ohne Gegenstueck faellt auf

- **GIVEN** ein Werkzeug wird in `.gitlab-ci.yml` gepinnt, das auf GitHub-Seite in `ci.yml` ebenfalls gepinnt ist
- **WHEN** der Paritaets-Guard laeuft
- **THEN** deckt seine Werkzeug-Tabelle dieses Werkzeug ab, statt es ungeprueft zu lassen

## ADDED Requirements

### Requirement: GitLab-Jobs decken jeden Offline-Gate-Job aus ci.yml ab

`.gitlab-ci.yml` SHALL define a counterpart for every offline gate job in
`.github/workflows/ci.yml`: the BATS unit suite, manifest validation, the OpenSpec/guards
check, the sharded spec suite, the full security scan (image pinning, git-crypt guard,
gitleaks, Trivy), the Brett TypeScript build, the website Vitest suite, the commit-message
lint and the Lighthouse audit.

A GitHub job SHALL NOT be considered covered by a GitLab job that merely shares its name: the
counterpart SHALL bring the same toolchain and SHALL run the same suite selection for the
pipeline context it runs in.

The aggregator job `test-factory` SHALL NOT be reproduced. It exists on GitHub solely because
a **skipped** required check counts as passed in branch protection; GitLab has no such
semantics, and mirroring the job would reproduce a platform quirk rather than its effect.

#### Scenario: Jeder Offline-Gate-Job hat ein Gegenstueck

- **GIVEN** die Job-Namen beider Pipeline-Dateien werden gegeneinander gestellt
- **WHEN** der Abdeckungs-Guard laeuft
- **THEN** ist jeder `ci.yml`-Offline-Gate-Job einem GitLab-Job zugeordnet, mit Ausnahme des als bewusst ausgelassen deklarierten Aggregators

#### Scenario: Spec-Suite laeuft in vier Partitionen

- **GIVEN** der Spec-Suite-Job auf GitLab laeuft
- **WHEN** seine Parallelisierung ausgewertet wird
- **THEN** laeuft er in vier Partitionen, und die GitLab-Partitionsvariablen sind auf `SPEC_SHARD`/`SPEC_SHARDS` abgebildet

---

### Requirement: Diff-Basis wird an einer Stelle aufgeloest und meldet ihr Fehlen

The system SHALL resolve the diff base for scope-selecting gates in a single script that both
pipelines call, rather than repeating the resolution per job or per platform. The resolution
order SHALL be: an explicit merge-request diff base if the CI context provides one, otherwise
the merge base between `origin/main` and `HEAD`, otherwise `origin/main`.

For a pipeline context that has **no** counterpart to diff against (a push to `main`), the
script SHALL signal this with a distinct exit code and empty output — it SHALL NOT report an
empty diff.

This distinction is the point of the script. A failed base resolution and a legitimately empty
diff both yield zero selected files; a caller that treats them alike reports a commit as
checked that nothing checked. A job whose selection is empty SHALL therefore pass only when
the base resolved, and SHALL fail when it did not.

#### Scenario: Merge-Request-Kontext liefert die vorgegebene Basis

- **GIVEN** die CI-Umgebung setzt eine Merge-Request-Diff-Basis
- **WHEN** das Skript laeuft
- **THEN** gibt es genau diesen SHA aus und beendet sich mit Exit-Code 0

#### Scenario: Branch-Pipeline ohne Merge-Request faellt auf die Merge-Base zurueck

- **GIVEN** ein gespiegelter Arbeits-Branch ohne Merge-Request-Kontext
- **WHEN** das Skript laeuft
- **THEN** gibt es die Merge-Base gegen `origin/main` aus und beendet sich mit Exit-Code 0

#### Scenario: main-Push meldet fehlende Basis statt leeren Diff

- **GIVEN** die Pipeline laeuft auf einem Push nach `main`
- **WHEN** das Skript laeuft
- **THEN** ist die Ausgabe leer und der Exit-Code von 0 verschieden

#### Scenario: Leere Auswahl ohne aufloesbare Basis scheitert

- **GIVEN** ein diff-skopierter Job waehlt null Tests aus, weil die Basis nicht aufloesbar war
- **WHEN** der Job seine Auswahl auswertet
- **THEN** scheitert er, statt gruen zu melden

---

### Requirement: Commit-Lint auf GitLab prueft den Commit-Range

The GitLab commit-lint job SHALL validate the **commit messages in the pipeline's range**
using the same scripts the local hook and the GitHub job invoke, rather than reproducing the
GitHub pull-request-title check. A mirrored branch pipeline has no merge request and therefore
no title to check; the commit messages exist in both contexts.

Where the CI context does provide a merge-request title, the job SHALL additionally validate
that title against the same type list.

#### Scenario: Branch-Pipeline prueft Commit-Nachrichten

- **GIVEN** eine gespiegelte Branch-Pipeline ohne Merge-Request-Kontext
- **WHEN** der Commit-Lint-Job laeuft
- **THEN** validiert er jede Nicht-Merge-Commit-Nachricht im Range und scheitert bei einer nicht-konventionellen Nachricht

#### Scenario: Merge-Request-Titel wird zusaetzlich geprueft

- **GIVEN** die CI-Umgebung setzt einen Merge-Request-Titel
- **WHEN** der Commit-Lint-Job laeuft
- **THEN** prueft er zusaetzlich diesen Titel gegen dieselbe Typ-Liste
