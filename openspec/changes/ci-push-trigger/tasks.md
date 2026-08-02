---
title: "ci-push-trigger — Implementation Plan"
ticket_id: T002522
domains: [ci-cd]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ci-push-trigger — Implementation Plan

_Ticket: T002522_

## File Structure

```
scripts/worktree-create.sh                        (geändert — Skip-Marker aus dem Anchor-Subject entfernen)
scripts/check-skip-ci-marker.sh                   (neu     — Guard über einen Commit-Bereich)
.github/workflows/ci.yml                          (geändert — Guard-Step im Job `commit-lint`)
tests/spec/ci-cd/skip-ci-marker-guard.bats        (neu     — RED-Test, bereits vorhanden)
```

S1-Budgets gegen die wirksame Schwelle (`docs/code-quality/gates.yaml`; keine der
Dateien ist in `docs/code-quality/baseline.json` gebaselined):

| Datei | aktuell | Schwelle | Budget |
|---|---|---|---|
| `scripts/worktree-create.sh` | 434 | 800 (`.sh`) | 366 — der Change ist zeilenneutral |
| `scripts/check-skip-ci-marker.sh` | 0 (neu) | 800 (`.sh`) | 800 — geplant ~60 Zeilen |
| `.github/workflows/ci.yml` | 747 | ungated (`.yml`) | n/a |
| `tests/spec/ci-cd/skip-ci-marker-guard.bats` | 130 | ungated (`.bats`) | n/a |

## Kontext

Root Cause, Belege und die verworfene Alternative stehen in `design.md`. Kurz:
`scripts/worktree-create.sh:427` schreibt `chore: anchor branch <branch> [skip ci]`.
Der Squash-Merge faltet dieses Subject in den Body des `main`-Commits, GitHub wertet
Skip-Marker gegen die gesamte Head-Commit-Message aus und unterdrückt daraufhin
**alle** push-getriggerten Workflows.

## Tasks

- [ ] **Failing-Test-Step (RED).** Der Test `tests/spec/ci-cd/skip-ci-marker-guard.bats`
      liegt bereits im Branch und ist vollständig rot (7/7). Vor der Implementierung
      erneut laufen lassen, um den RED-Zustand zu bestätigen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/skip-ci-marker-guard.bats
# expected: FAIL (rot — Guard-Skript fehlt, Anchor trägt noch den Marker)
```

- [ ] **Ursache entfernen.** In `scripts/worktree-create.sh` das Anchor-Subject von
      `chore: anchor branch $BRANCH [skip ci]` auf `chore: anchor branch $BRANCH`
      ändern (eine Zeile, zeilenneutral). Der umgebende Kommentarblock erklärt bislang
      nur `--no-verify` und die Best-Effort-Semantik; er wird um einen Satz ergänzt,
      warum hier **kein** Skip-Marker stehen darf (Squash-Body landet auf `main`).
      Damit bleibt der Grund an der Stelle, an der die Rückänderung sonst naheläge.

- [ ] **Guard implementieren.** `scripts/check-skip-ci-marker.sh` neu anlegen:
      - Aufruf `check-skip-ci-marker.sh [<base-ref>] [<head-ref>]`, Defaults
        `origin/main` und `HEAD`.
      - Über `git log --no-merges` je Commit im Bereich `<base>..<head>` die volle
        Message prüfen; nur Commits **ahead of base** betrachten, damit bereits auf
        `main` liegende Bot-Commits (`freshness-regen`) unberührt bleiben.
      - Erkannte Marker (case-insensitive): `[skip ci]`, `[ci skip]`, `[no ci]`,
        `[skip actions]`, `[actions skip]`.
      - Bei Fund: jeden betroffenen Commit mit Kurz-SHA und Subject auf stdout nennen,
        dazu eine Erklärzeile (Squash-Body unterdrückt die Push-Trigger) und die
        Abhilfe (`git rebase -i` bzw. `git commit --amend`), dann Exit 1.
      - Ohne Fund: Exit 0.
      - `set -euo pipefail`, ausführbares Dateibit setzen.

- [ ] **Guard in CI verdrahten.** In `.github/workflows/ci.yml` im Job `commit-lint`
      (der bereits `if: github.event_name == 'pull_request'`, `fetch-depth: 0` und die
      `BASE_SHA`/`HEAD_SHA`-Ermittlung mitbringt) einen Step
      "No CI skip markers in branch commits [T002522]" ergänzen, der
      `bash scripts/check-skip-ci-marker.sh "$BASE_SHA" "$HEAD_SHA"` aufruft. Der Step
      gehört bewusst in den PR-Lauf und **nicht** in einen Push-Lauf auf `main` — dort
      wäre der Trigger bereits unterdrückt und der Befund nur noch nachträglich.

- [ ] **GREEN bestätigen.** Der BATS-Test muss vollständig grün laufen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/skip-ci-marker-guard.bats
```

- [ ] **Guard gegen den eigenen Branch prüfen.** Der Guard muss den Branch dieses
      Vorgangs akzeptieren — dessen Anchor-Commit wurde bereits bereinigt. Das ist die
      Gegenprobe zum ephemeren Fixture, gegen echte Repo-Historie:

```bash
bash scripts/check-skip-ci-marker.sh origin/main HEAD
```

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Nach dem Merge (Nachziehen der T002522-Folgeschäden)

Der Merge dieses PRs stellt den Push-Trigger wieder her, holt aber die während des
Ausfalls ausgelassenen Läufe nicht nach. Acht `main`-Commits sind betroffen; sieben
berührten `website/**` (kein Image-Build), einer (`1b0f85d7a4`) berührte `k3d/**`
(kein neu gerendertes Flux-Artefakt).

- [ ] `build-website.yml` und `render-fleet-artifact.yml` per `workflow_dispatch` auf
      `main` anstoßen.
- [ ] Verifizieren, dass der Cluster den aktuellen Stand trägt: der `commit`-Wert aus
      `/api/health` muss `git rev-parse origin/main` entsprechen. Ein `Ready=True` von
      Flux allein ist **kein** Nachweis — es gilt auch für eine alte Revision.
