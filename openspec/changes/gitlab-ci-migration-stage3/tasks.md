---
title: "gitlab-ci-migration-stage3 — Implementation Plan"
ticket_id: T012405
domains: [ci-cd, infra, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# gitlab-ci-migration-stage3 — Implementation Plan

_Ticket: T012405_

## File Structure

```
scripts/ci-diff-base.sh                              (neu)          Diff-Basis-Aufloesung fuer beide Pipelines
.github/workflows/mirror-to-gitlab.yml               (Erweiterung)  Branch-Spiegelung + Delete-Spiegelung
.gitlab-ci.yml                                       (Erweiterung)  sieben neue Jobs, rules, interruptible
docs/runbooks/gitlab-runner.md                       (Erweiterung)  Betrieb der Branch-Pipelines, Diff-Basis-Diagnose
tests/spec/ci-cd/gitlab-mirror-workflow.bats         (Erweiterung)  Branch- und Delete-Refspec
tests/spec/ci-cd/gitlab-parallel-non-blocking.bats   (Erweiterung)  Paritaet schaltet das Gate nicht um
tests/spec/ci-cd/gitlab-tool-parity.bats             (Erweiterung)  Werkzeug-Tabelle statt einer Version
tests/spec/ci-cd/gitlab-job-coverage.bats            (neu)          jeder ci.yml-Offline-Gate hat ein Gegenstueck
tests/spec/ci-cd/ci-diff-base.bats                   (neu)          Aufloesungsreihenfolge und Exit-Codes
components/website/src/data/test-inventory.json      (generiert)    durch die neuen .bats-Dateien
```

Der Pfad steht in jeder Zeile zuerst — die touched-files-Ableitung liest das erste Feld als
Repo-Pfad.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-diff-base.md | impl | scripts/ci-diff-base.sh | |
| p2 | tasks.d/p2-mirror-branches.md | impl | .github/workflows/mirror-to-gitlab.yml | |
| p3 | tasks.d/p3-gitlab-jobs.md | impl | .gitlab-ci.yml | p1 |
| p4 | tasks.d/p4-runbook.md | impl | docs/runbooks/gitlab-runner.md | |
| p5 | tasks.d/p5-tests.md | tests | tests/spec/ci-cd/gitlab-mirror-workflow.bats, tests/spec/ci-cd/gitlab-parallel-non-blocking.bats, tests/spec/ci-cd/gitlab-tool-parity.bats, tests/spec/ci-cd/gitlab-job-coverage.bats, tests/spec/ci-cd/ci-diff-base.bats | p1,p2,p3 |

p1, p2 und p4 sind unabhaengig voneinander. p3 haengt an p1, weil die neuen Jobs
`ci-diff-base.sh` aufrufen und dessen Exit-Code-Vertrag kennen muessen. p5 haengt an p1–p3,
weil seine Guards deren Dateien lesen.

## Kontext fuer alle Partials

**Gemessene Ausgangslage** (Pipeline 2768676028 auf `main`, 2026-08-18, Befehl:
`curl -fsSL "https://gitlab.com/api/v4/projects/85496968/pipelines/2768676028/jobs" | jq -r '.[] | "\(.name) \(.status) \(.duration)"'`):
`bats-unit` 196 s, `manifests` 76 s, `gitleaks` 21 s — Summe rund 293 s bei drei Jobs.

**Zeilenbudgets.** `docs/code-quality/gates.yaml` fuehrt unter `s1.limits` **keine** Limits
fuer `.yml`, `.yaml` oder `.md` — die drei erweiterten Dateien sind damit nicht S1-gegated
(gemessen: `yq '.s1.limits' docs/code-quality/gates.yaml`, 2026-08-18, Commit c99aff277).
Fuer die einzige neue Shell-Datei gilt das `.sh`-Limit 800; `scripts/ci-diff-base.sh` wird
unter 120 Zeilen geschnitten und hat damit reichlich Wachstumsreserve.

**Vertrag von `scripts/ci-diff-base.sh`** — p3 und p5 schreiben gegen genau diesen:

| Fall | stdout | Exit |
|---|---|---|
| `CI_MERGE_REQUEST_DIFF_BASE_SHA` gesetzt und aufloesbar | dieser SHA | 0 |
| Branch-Pipeline, `git merge-base origin/main HEAD` aufloesbar | Merge-Base-SHA | 0 |
| `origin/main` existiert, keine Merge-Base | `origin/main`-SHA | 0 |
| Push auf `main` (kein Gegenueber) | leer | 3 |
| `origin/main` nicht fetchbar | leer | 4 |

Exit 3 und Exit 4 sind bewusst verschieden: 3 heisst „diff-skopierte Auswahl ist hier nicht
anwendbar, nimm die Vollmenge", 4 heisst „die Umgebung ist kaputt, brich ab". Ein einziger
Fehler-Code wuerde beide Faelle im Aufrufer zusammenfallen lassen — und der Aufrufer waehlt
daraus die Testmenge.

**Was hier bewusst NICHT passiert:** kein GitLab-Ergebnis wird als Required Check hinterlegt,
kein `.github/workflows/ci.yml`-Job abgeschaltet oder per `if:` kurzgeschlossen. Der
Gate-Flip ist Etappe 4. Ein Partial, das `ci.yml` anfasst, verletzt den Scope dieses Plans.

## Tasks

- [x] **T1 — p1: Diff-Basis-Skript** (`tasks.d/p1-diff-base.md`)
- [x] **T2 — p2: Branch- und Delete-Spiegelung** (`tasks.d/p2-mirror-branches.md`)
- [x] **T3 — p3: sieben GitLab-Jobs** (`tasks.d/p3-gitlab-jobs.md`)
- [x] **T4 — p4: Runbook** (`tasks.d/p4-runbook.md`)
- [x] **T5 — p5: Guards** (`tasks.d/p5-tests.md`)

- [ ] **T6 — Verifikation**

  Voraussetzung: T1–T5 sind abgeschlossen.

  ```bash
  # 1) Die neuen und erweiterten Guards direkt
  ./tests/unit/lib/bats-core/bin/bats \
    tests/spec/ci-cd/ci-diff-base.bats \
    tests/spec/ci-cd/gitlab-job-coverage.bats \
    tests/spec/ci-cd/gitlab-mirror-workflow.bats \
    tests/spec/ci-cd/gitlab-parallel-non-blocking.bats \
    tests/spec/ci-cd/gitlab-tool-parity.bats

  # 2) YAML-Syntax beider Pipeline-Dateien — ein Tippfehler in .gitlab-ci.yml
  #    faellt sonst erst auf GitLab auf, also nach dem Merge
  python3 -c "import yaml,sys; [yaml.safe_load(open(f)) for f in ['.gitlab-ci.yml','.github/workflows/mirror-to-gitlab.yml']]; print('YAML ok')"

  # 3) Test-Inventar nach den zwei neuen .bats-Dateien
  task test:inventory

  # 4) Die drei Pflicht-Kommandos
  task test:changed
  task freshness:regenerate
  task freshness:check
  ```

  Abnahme: alle fuenf Guard-Dateien gruen, `YAML ok` auf stdout, `task freshness:check`
  ohne Befund, und `git diff --stat -- .github/workflows/ci.yml` liefert **keine** Zeile
  (Scope-Nachweis: der Gate-Flip ist nicht passiert).
