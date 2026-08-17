# Proposal: gitlab-ci-migration-stage1

## Why

Die CI/CD-Pipeline liegt vollständig bei GitHub Actions — 28 Workflows, deren Compute
ausschließlich auf GitHub-gehosteten `ubuntu-latest`-Runnern läuft; in `.github/workflows/ci.yml`
trägt **kein einziger** Job einen self-hosted Runner. Das Projekt betreibt gleichzeitig einen
fleet-Cluster mit freier Kapazität und einen lokalen Host, die für CI-Last ungenutzt bleiben.
Das Ziel ist eine Migration nach GitLab, bei der die Regellast auf **eigener Hardware** läuft
und **Cloud-Compute nur der Rückfall** ist.

Eine Migration in einem Zug ist nicht planbar: Auto-Merge, release-please, Renovate, die
Software-Factory-Hooks und der Flux-OCI-Render hängen an GitHub-spezifischen Mechanismen.
Diese Etappe schafft deshalb zuerst die **tragfähige Grundlage im Parallelbetrieb** und weist
sie an drei echten Jobs nach, bevor irgendein Gate umgezogen wird.

Der Zustand ist Greenfield: Eine repo-weite Suche nach `gitlab` findet keine `.gitlab-ci.yml`,
keinen Runner und keine Integration — die einzigen Treffer sind der Registry-Hostname
`registry.gitlab.com/alpine/k8s` und ein generischer SSO-Button-Selektor im E2E-Test.

## What

### Architekturentscheidung: gitlab.com SaaS, nicht self-hosted GitLab CE

Die Steuerebene (Repo-Hosting, Pipeline-Orchestrierung, Web-UI) liegt auf **gitlab.com**;
migriert wird die **Compute-Ebene**, nicht die Steuerebene.

Verworfen wurde self-hosted GitLab CE auf fleet: Omnibus belegt dauerhaft ≥ 4 GB RAM,
Backups und Upgrades werden zur Dauerbetriebslast, und ein Cloud-Fallback müsste als
Autoscaling-Runner selbst gebaut werden — ohne dass dem ein Datenschutzgewinn gegenüberstünde,
denn der Quelltext liegt bereits bei einem US-Hoster (GitHub). Self-hosted GitLab CE bleibt
als spätere Etappe offen; diese Entscheidung schließt sie nicht aus.

### Compute-Verteilung mit Fallback

| Ebene | Träger | Rolle |
|---|---|---|
| Regellast | self-hosted GitLab Runner, Docker-Executor auf dem lokalen Host | trägt alle Jobs |
| Rückfall | gitlab.com Shared Runners (`saas-linux-small-amd64`) | springt ein, wenn self-hosted nicht verfügbar |

GitLab kennt **keinen** nativen „Runner offline → nimm einen Shared Runner"-Automatismus.
Der von GitLab dokumentierte Weg ist **Tag-Routing über eine CI/CD-Variable**: Jobs deklarieren
`tags: [$CI_RUNNER_TAG]`, und die Projekt-Variable `CI_RUNNER_TAG` zeigt entweder auf den
self-hosted Tag oder auf einen SaaS-Tag. Das Umschalten ist damit **eine Variablenänderung
ohne Codeänderung** — kein dupliziertes Job-YAML, keine zweite Pipeline.

Registriert wird der Runner mit einem **Runner-Authentication-Token** (`glrt-`-Präfix, via
`--token`). Der ältere `--registration-token`-Fluss ist seit GitLab 16 veraltet und wird
bewusst nicht verwendet.

### Spiegelung GitHub → GitLab

Pull-Mirroring (GitLab zieht von GitHub) ist auf gitlab.com ein Premium-Feature. Der
kostenfreie und im Repo sichtbare Weg ist ein GitHub-Actions-Workflow, der nach jedem
`main`-Push per `git push --mirror` zu GitLab spiegelt. GitHub bleibt in dieser Etappe
**SSOT und Merge-Gate**; GitLab ist Nur-Lese-Spiegel plus zweite Verifikation.

### Die drei Kern-Jobs sind Spiegel, keine Neuerfindung

Sie bilden bestehende `ci.yml`-Jobs nach und müssen **verhaltensgleich** sein:

| GitLab-Job | GitHub-Vorbild | Bindung an das Vorbild |
|---|---|---|
| `bats-unit` | `test-bats` | vendored Runner `tests/unit/lib/bats-core/bin/bats` |
| `manifests` | `test-manifests` | kubectl v1.31.0, `tests/unit/manifests.bats` + `dead-node-affinity.bats` |
| `gitleaks` | `security-scan` | gitleaks **8.18.2**, `--config .gitleaks.toml --no-git --redact` |

Die Diff-Selektion (`scripts/find-changed-tests.sh`) wird **nicht** übernommen: Der Mirror
pusht `main`, dort gibt es keinen sinnvollen Diff gegen `main`. Der Spiegel läuft deshalb über
die vollständige Menge. `task test:all` ist als Job-Kommando ungeeignet — es ist ein Alias auf
`task test:changed` und damit ebenfalls diff-abhängig.

### Nicht in dieser Etappe (Non-Goals)

- Migration der übrigen GitHub-Workflows (Build-, E2E-, Release-, Factory-Workflows)
- Umzug des Merge-Gates, von Auto-Merge, release-please oder Renovate
- Flux-OCI-Render und der Deploy-Pfad
- Kubernetes-Executor auf fleet (Etappe 2 — Etappe 1 belegt die Mechanik am lokalen Runner)
- self-hosted GitLab CE
- Abschaltung irgendeines GitHub-Workflows

_Ticket: T011790_
