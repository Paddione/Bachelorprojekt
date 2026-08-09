---
title: "main-ci-branch-precondition — Implementation Plan"
ticket_id: T003045
domains: [ci-cd, testing]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# main-ci-branch-precondition — Implementation Plan

_Ticket: T003045_

## File Structure

```
tests/spec/ci-cd/bats-no-live-branch-assertion.bats            (neu, 85 Zeilen — im RED-Commit bereits enthalten)
tests/spec/mishap-rollup/container-resolution-and-unattended-worktree.bats  (geändert: 74 → 70 Zeilen)
```

## Partials

| # | Rolle | target_files |
|---|-------|--------------|
| 1 | tests | `tests/spec/ci-cd/bats-no-live-branch-assertion.bats`, `tests/spec/mishap-rollup/container-resolution-and-unattended-worktree.bats` |

## S1-Budget

S1 greift für diesen Change nicht. Beleg, gemessen am 2026-08-09:

- `.bats` steht nicht in `s1.limits` in `docs/code-quality/gates.yaml` (gelistet sind
  `.astro .ts .svelte .sh .mjs .mts .py .js .jsx .tsx .cjs .bash .java .php`).
- `jq -r 'keys[] | select(endswith(".bats"))' docs/code-quality/baseline.json` liefert keine
  Zeile — es existiert keine gebaselinete `.bats`-Datei.

Beide berührten Dateien sind `.bats`. Die geänderte Datei schrumpft ohnehin (74 → 70), die neue
liegt bei 85 Zeilen.

<!-- vitest: kein neuer Test nötig, weil dieser Change ausschließlich BATS-Dateien berührt und
     kein `website/src/lib/**` bzw. `website/src/pages/api/**` anfasst. -->

## Tasks

- [ ] **RED — Guard schlägt am dokumentierten Defekt fehl.** Der Guard
      `tests/spec/ci-cd/bats-no-live-branch-assertion.bats` liegt bereits im Stage-Commit dieses
      Branches. Ausführen und bestätigen, dass er **genau eine** Fundstelle meldet, nämlich
      `tests/spec/mishap-rollup/container-resolution-and-unattended-worktree.bats:47`. Meldet er
      mehr oder andere Zeilen, ist die Erkennungslogik zu weit gefasst und muss vor dem
      Fix-Step korrigiert werden — die sechs Fixture- und Kommentarzeilen im Repo dürfen nicht
      auftauchen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/bats-no-live-branch-assertion.bats
# expected: FAIL (rot — die Branch-Vorbedingung existiert noch)
```

- [ ] **GREEN — Branch-Vorbedingung entfernen.** In
      `tests/spec/mishap-rollup/container-resolution-and-unattended-worktree.bats` die Zeilen
      45–48 ersatzlos löschen: den zweizeiligen Kommentar „Vorbedingung des Tests: wir stehen
      NICHT auf main …", die Zuweisung `current_branch="$(git -C "$REPO_ROOT" rev-parse
      --abbrev-ref HEAD)"` und die Assertion `[ "$current_branch" != "main" ]`. Der Rest des
      Tests bleibt unverändert — insbesondere die drei tragenden Zusicherungen (`status` -eq 0,
      Output nicht leer, keine `FATAL`-Zeile) und die Aussage über `--unattended`.

      Nichts anderes anfassen. `scripts/worktree-create.sh` ist nachweislich in Ordnung: auf
      `main` liefert `--help` dort rc=0, keine `FATAL`-Zeile und nennt `--unattended` zweimal.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/bats-no-live-branch-assertion.bats
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-rollup/container-resolution-and-unattended-worktree.bats
# beide grün — der Guard findet keine Fundstelle mehr, der reparierte Test 3/3
```

- [ ] **Gegenprobe auf `main`.** Die Wirksamkeit des Fixes zeigt sich nur dort, wo der Fehler
      auftrat. Aus dem Hauptcheckout (Branch `main`, sauberer Arbeitsbaum) den reparierten Test
      gegen den Branch-Stand laufen lassen und bestätigen, dass er 3/3 grün ist. Ohne diesen
      Schritt belegt der Worktree-Lauf nur, dass der Test auf einem Feature-Branch grün ist —
      also genau den Zustand, der schon vorher galt.

```bash
git -C "$(git rev-parse --show-toplevel)" fetch origin fix/main-ci-branch-precondition-T003045
# Beide Formen der Spec-Konvention erfassen (CLAUDE.md T002696):
tests/unit/lib/bats-core/bin/bats -r tests/spec/mishap-rollup tests/spec/ci-cd
```

- [ ] **Final Verification.** Die drei Pflicht-Gates ausführen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
