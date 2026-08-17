---
title: "gitlab-ci-migration-stage1 — Implementation Plan"
ticket_id: T011790
domains: [ci-cd, infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# gitlab-ci-migration-stage1 — Implementation Plan

_Ticket: T011790_

## File Structure

```
.gitlab-ci.yml                                      (neu)  GitLab-Pipeline, 3 Kern-Jobs
.github/workflows/mirror-to-gitlab.yml              (neu)  Push-Mirror GitHub → GitLab
scripts/gitlab-runner-setup.sh                      (neu)  Runner-Registrierung (+ --dry-run)
docs/runbooks/gitlab-runner.md                      (neu)  Betrieb + Fallback-Umschaltung
tests/spec/ci-cd/gitlab-tool-parity.bats            (neu)  gitleaks-Versions-Parität
tests/spec/ci-cd/gitlab-runner-tag-routing.bats     (neu)  Tag-Routing statt Literal
tests/spec/ci-cd/gitlab-runner-setup-dryrun.bats    (neu)  Dry-Run-Ausgabe des Setup-Skripts
tests/spec/ci-cd/gitlab-mirror-workflow.bats        (neu)  Mirror-Trigger und -Richtung
tests/spec/ci-cd/gitlab-parallel-non-blocking.bats  (neu)  kein GitHub-Workflow stillgelegt
components/website/src/data/test-inventory.json     (generiert, durch die neuen .bats-Dateien)
```

Der Pfad steht in jeder Zeile zuerst: Die touched-files-Ableitung liest das erste Feld einer
Zeile als Repo-Pfad, ein vorangestelltes Statuswort macht sie unbrauchbar. Die Pipeline-Datei
in der Repo-Wurzel erscheint dabei nicht in der abgeleiteten Liste — neue Dateien ohne
Verzeichnisanteil erkennt die Ableitung nicht. Für die Konflikterkennung ist das folgenlos, da
kein anderer offener Plan diese Datei berührt.

Alle Produktivdateien sind neu — es wird keine bestehende Datei geändert. Deshalb wird für
keine Datei ein Zeilen-Budget beansprucht (plan-lint B1a: „when unsure, claim no number").

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-mirror.md | impl | .github/workflows/mirror-to-gitlab.yml | |
| p2 | tasks.d/p2-pipeline.md | impl | .gitlab-ci.yml | |
| p3 | tasks.d/p3-runner.md | impl | scripts/gitlab-runner-setup.sh, docs/runbooks/gitlab-runner.md | |
| p4 | tasks.d/p4-tests.md | tests | tests/spec/ci-cd/gitlab-tool-parity.bats, tests/spec/ci-cd/gitlab-runner-tag-routing.bats, tests/spec/ci-cd/gitlab-runner-setup-dryrun.bats, tests/spec/ci-cd/gitlab-mirror-workflow.bats, tests/spec/ci-cd/gitlab-parallel-non-blocking.bats | p1,p2,p3 |

Die drei Implementierungs-Partials sind voneinander unabhängig und können parallel laufen.
Das Tests-Partial hängt von allen dreien ab, weil seine Guards deren Dateien lesen.

## Kontext für alle Partials

**Belegte Fakten aus der Bestandsaufnahme** — nicht neu recherchieren, aber vor dem Ändern
gegenprüfen:

- `.github/workflows/ci.yml:501` pinnt `gitleaks-v8.18.2-linux-amd64` (Cache-Key),
  `ci.yml:506` lädt `v8.18.2`, `ci.yml:512` ruft
  `gitleaks detect --config .gitleaks.toml --no-git --redact`.
- Der Manifest-Job nutzt kubectl `v1.31.0` und fährt
  `tests/unit/manifests.bats`, `tests/unit/changed-manifests.bats`,
  `tests/unit/dead-node-affinity.bats`.
- Der vendored BATS-Runner ist `tests/unit/lib/bats-core/bin/bats`. Ein global
  installiertes `bats` ist nicht zulässig.
- `task test:all` ist ein reiner Alias auf `task test:changed` (Taskfile.yml:1016) und
  deshalb als Job-Kommando für den Mirror ungeeignet (Design D4).
- Es gibt im Repo bislang **keine** GitLab-Integration — alles ist Greenfield.

**Namenskonventionen dieser Etappe** (in allen Partials identisch verwenden):

- CI/CD-Variable für das Tag-Routing: `CI_RUNNER_TAG`
- self-hosted Tag: `bachelorprojekt-local`
- Fallback-Tag: `saas-linux-small-amd64`
- GitHub-Secret für den Mirror: `GITLAB_MIRROR_TOKEN`, GitLab-URL-Secret: `GITLAB_MIRROR_URL`

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die fünf Guards aus Partial p4 anlegen und laufen
      lassen, bevor `.gitlab-ci.yml`, der Mirror-Workflow und das Setup-Skript existieren.
      Sie müssen fehlschlagen, weil die geprüften Dateien fehlen — nicht, weil der Test
      selbst kaputt ist. Beide Richtungen belegen: Der Fehlertext muss die fehlende Datei
      benennen.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/ci-cd/gitlab-*.bats
# expected: FAIL (rot — .gitlab-ci.yml, der Mirror-Workflow und das Setup-Skript fehlen noch)
```

- [ ] **Implementierungs-Schritte (GREEN).** Die Partials p1–p3 abarbeiten. Danach müssen
      dieselben Guards grün sein:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/ci-cd/gitlab-*.bats
# expected: PASS
```

- [ ] **Manuelle Abnahme gegen die echte GitLab-Instanz.** Diese Schritte sind nicht
      automatisierbar, weil sie ein GitLab-Projekt und einen laufenden Runner voraussetzen.
      Sie gehören ins Ticket, nicht in CI:
      1. GitLab-Projekt anlegen, Deploy-Token erzeugen, `GITLAB_MIRROR_TOKEN` und
         `GITLAB_MIRROR_URL` als GitHub-Secrets hinterlegen.
      2. `bash scripts/gitlab-runner-setup.sh` real ausführen und den Runner registrieren.
      3. Einen Push auf `main` abwarten und belegen, dass der GitLab-`main` denselben SHA
         trägt.
      4. Belegen, dass die drei Jobs auf `bachelorprojekt-local` laufen und die Zahl der
         ausgeführten BATS-Tests größer als null ist.
      5. `CI_RUNNER_TAG` auf `saas-linux-small-amd64` umstellen, Pipeline erneut laufen
         lassen, danach zurückstellen. Beide Läufe im Ticket vermerken.

- [ ] **Final Verification.** Die drei Pflicht-Gates fahren:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

`task freshness:regenerate` ist hier nicht optional: Fünf neue `.bats`-Dateien verändern
`components/website/src/data/test-inventory.json`, und der CI-Inventory-Check vergleicht die
committete Fassung gegen die neu erzeugte.
