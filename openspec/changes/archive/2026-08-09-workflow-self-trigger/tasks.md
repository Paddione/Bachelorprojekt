---
title: "workflow-self-trigger — Implementation Plan"
ticket_id: T002868
domains: [ci, infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# workflow-self-trigger — Implementation Plan

_Ticket: T002868_

Design und Bestandsaufnahme: `openspec/changes/workflow-self-trigger/design.md`.

Kurzfassung: Vier Workflows mit `push.paths` führen ihre eigene Datei nicht in dieser Liste.
Eine Änderung am Workflow selbst löst deshalb keinen Lauf aus — der Fix liegt auf `main` und
wirkt nicht, ohne Fehlermeldung. Bei T002837 nachweisbar eingetreten: der Merge-Commit
`f813fec4b` löste acht Runs aus, „Render Fleet Artifact" war nicht darunter.

## Partials

| # | Rolle | Zieldateien |
|---|-------|-------------|
| 1 | tests + fix | `.github/workflows/render-fleet-artifact.yml`, `.github/workflows/build-brett.yml`, `.github/workflows/build-docs.yml`, `.github/workflows/brain-merge-hook.yml`, `tests/spec/ci-cd/workflow-self-trigger.bats` |

Ein einzelnes Partial: vier Einzeiler in vier Dateien plus ein Guard. Eine Aufteilung brächte
Koordinationsaufwand ohne Parallelitätsgewinn, und der Guard prüft die vier Änderungen gemeinsam.

## File Structure

```
.github/workflows/render-fleet-artifact.yml   (geändert — 1 Zeile in push.paths)
.github/workflows/build-brett.yml             (geändert — 1 Eintrag in der Inline-Liste)
.github/workflows/build-docs.yml              (geändert — 1 Zeile in push.paths)
.github/workflows/brain-merge-hook.yml        (geändert — 1 Zeile in push.paths)
tests/spec/ci-cd/workflow-self-trigger.bats   (neu — Guard, liegt im Stage-Commit vor)
openspec/changes/workflow-self-trigger/design.md      (neu)
openspec/changes/workflow-self-trigger/specs/ci-cd.md (neu — Delta-Spec)
```

Keine Budget-Angaben: die Production-Änderung umfasst vier Zeilen in YAML-Trigger-Blöcken, die
S1-Größenschwellen sind hier ohne Aussagekraft.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der Guard `tests/spec/ci-cd/workflow-self-trigger.bats` liegt
      bereits im Stage-Commit dieses Branches. Vor der Implementierung ausführen und den roten
      Stand bestätigen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/workflow-self-trigger.bats
# expected: FAIL — beide Tests rot. Test 1 nennt die Abweichler namentlich:
# "brain-merge-hook.yml build-brett.yml build-docs.yml render-fleet-artifact.yml"
```

      Nennt die Ausgabe andere oder zusätzliche Dateien, ist seit der Planung ein Workflow
      hinzugekommen — dann gehört er in denselben Durchgang, nicht in ein Folgeticket.

- [ ] **Fix-Step (GREEN).** In allen vier Workflows die eigene Datei in den `push.paths`-Block
      aufnehmen. Drei nutzen die Blockform, `build-brett.yml` eine Inline-Liste:

```yaml
# render-fleet-artifact.yml, build-docs.yml, brain-merge-hook.yml — je eine Zeile im paths-Block:
      - '.github/workflows/render-fleet-artifact.yml'
      - '.github/workflows/build-docs.yml'
      - .github/workflows/brain-merge-hook.yml

# build-brett.yml — Inline-Liste erweitern:
    paths: ['brett/**', '.github/workflows/build-brett.yml']
```

      Die Quoting-Form der jeweiligen Datei übernehmen: `brain-merge-hook.yml` führt seine Pfade
      ohne Anführungszeichen, die übrigen mit einfachen. Sonst entsteht ein uneinheitlicher Block
      ohne Nutzen. Danach muss der Guard grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/workflow-self-trigger.bats
```

- [ ] **Wirkungskontrolle nach dem Merge.** Der Merge dieses Changes ändert
      `render-fleet-artifact.yml` und ist damit sein eigener Nachweis: mit korrigiertem Filter
      muss der Renderer anspringen.

```bash
gh-axi run list --workflow render-fleet-artifact.yml --limit 3
# erwartet: ein Lauf mit event=push auf den Merge-Commit dieses PRs — genau das,
# was beim T002837-Merge ausblieb.
```

      Bleibt er aus, ist die Annahme über den Trigger-Mechanismus falsch und der Befund gehört
      zurück in die Analyse, statt den Guard anzupassen.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
