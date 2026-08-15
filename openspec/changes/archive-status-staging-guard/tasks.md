---
title: archive-status-staging-guard
ticket_id: T006371
domains: [scripts, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# archive-status-staging-guard — Implementation Plan

_Ticket: T006371_

## File Structure

- `scripts/openspec.sh` — cmd_archive: T003136-Add-Block offline-unabhaengig + fail-closed machen (D1)
- `scripts/devflow-post-merge-finalize.sh` — Schritt 8: Pre-Push-Freshness-Verifikation in der Archiv-Subshell (D2)
- `tests/spec/openspec-workflow/archive-status-offline-staging.bats` — RED-Guard (liegt im Branch vor)
- `tests/spec/openspec-workflow/archive-terminal-ticket-status.bats` — mkdir -p ins setup() gezogen (liegt im Branch vor)
- `website/src/data/test-inventory.json` — regeneriert (CI-Gate, task test:inventory)
- `openspec/changes/archive-status-staging-guard/specs/scripts.md` — ADDED-Delta (liegt im Branch vor)

> **Koordination T006369 (Parallelplan, gleiche Domäne):** Der Plan `plan-archive-freshness-check`
> härtet `.claude/skills/references/plan-archive-steps.md` + eigenen Guard
> `tests/spec/openspec-workflow/plan-archive-freshness-check.bats` + Delta auf
> `openspec-workflow.md`. Dieser Plan berührt `scripts/openspec.sh` + `devflow-post-merge-finalize.sh`
> + eigenes Delta auf `scripts.md` — keine Datei-Überschneidung (D2 ist die automatisierte
> Skript-Variante der dortigen Referenz-Härtung). Einziger geteilter Pfad: `website/src/data/
> test-inventory.json` (beide registrieren neue Testdateien) — letzter Merge gewinnt, die
> Regeneration im Task 6 gleicht jeden Stand ab.

## Task 1 — RED: Der Guard-Test liegt vor und ist rot

**Status im Stage-Commit bereits erbracht; der Implementer verifiziert den roten Zustand erneut.**

Der Guard `tests/spec/openspec-workflow/archive-status-offline-staging.bats` (T006371) liegt im
Branch vor und ist rot: Test 1 (`TICKET_OFFLINE=1` → openspec-status.json muss gestaged sein)
scheitert, weil der T003136-Add-Block in `cmd_archive` an `TICKET_OFFLINE != 1` hängt; Test 3
(Querschnitt) scheitert, weil `devflow-post-merge-finalize.sh` Schritt 8 kein `task
freshness:check` zwischen cherry-pick und Archiv-Push ausführt. Test 2 (Online-Regression) und
die Bestandsdatei `archive-terminal-ticket-status.bats` (inkl. T003136, mkdir im setup) sind grün.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/archive-status-offline-staging.bats tests/spec/openspec-workflow/archive-terminal-ticket-status.bats
# expected: FAIL (Test 1: "openspec-status.json NICHT gestaged nach archive (TICKET_OFFLINE=1)";
# Test 3: "kein 'task freshness:check' zwischen archive und Push"; Test 2 + Bestand: PASS)
```

Prüfmodus (T002448-M4): Tests 1-2 Output-Verifikation (Sandbox-`git init` + Symlinks auf echte
Scripts, Stub-ticket.sh — Muster aus `archive-terminal-ticket-status.bats`); Test 3
Querschnitts-Doku-Guard mit awk-Bereichsmuster (T003104) und Positiv-Anker (T002356-M1), da sich
das Push-Verhalten des finalize-Skripts nur im Quelltext manifestiert (Push zielt auf origin).

## Task 2 — GREEN: cmd_archive staged die Status-Map bedingungslos und fail-closed (D1)

In `scripts/openspec.sh` den T003136-Block (aktuell unter
`if [[ "${TICKET_OFFLINE:-0}" != "1" ]]; then ... fi`) ersetzen — die Status-Map ist rein lokal
(`openspec-status-map.sh`), die Kopplung an das Cluster-Offline-Flag ist der Konstruktionsfehler
hinter PR #4529/#4533:

> S1-Budget `scripts/openspec.sh` (gemessen 2026-08-15, `wc -l` gegen a34a4a90f): Ist 493, nicht
> gebaselined in `docs/code-quality/baseline.json` → Budget = Limit 800 − Ist 493 = 307 Zeilen.
> Der Ersatz des Blocks (12 → ~15 Zeilen) bleibt weit unter dem Budget.

```bash
  # [T003136] Status-Map-Ergebnis sofort stagen. cmd_archive regeneriert
  # openspec-status.json zwar nach dem Move, aber der Archiv-Commit des
  # Aufrufers (opencode-flow-execute Step 7 / plan-archive-steps.md) staged
  # bisher nur die openspec/changes/-Verschiebung — die JSON blieb unstaged
  # und der Freshness-Gate meldete sie danach als stale (PR #4083). Das
  # Staging hier macht das Ergebnis unabhaengig vom pre-commit-Hook
  # (SKIP_FRESHNESS_REGEN, --no-verify) und vom Flow-Skill.
  # [T006371] Ohne TICKET_OFFLINE-Bedingung und ohne `|| true`: offline
  # laufende Ausfuehrer liessen Regeneration UND Staging still ausfallen, der
  # Archiv-Commit trug die JSON nicht mit (PR #4529/#4533). set -euo pipefail
  # macht eine fehlgeschlagene Regeneration fail-closed — Abbruch statt
  # still leerer Status-Map. KEIN mkdir -p: das Zielverzeichnis existiert im
  # echten Repo immer (Sandbox-Tests legen es im setup an, damit der
  # Fehlerfall testbar bleibt).
  bash "$HERE/openspec-status-map.sh" >/dev/null 2>&1
  git -C "$REPO" add -- "$REPO/website/src/data/openspec-status.json"
```

Danach:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/archive-status-offline-staging.bats tests/spec/openspec-workflow/archive-terminal-ticket-status.bats
# expected: PASS (alle 7: Tests 1-3 + T002569 x3 + T003136)
```

## Task 3 — GREEN: finalize.sh Schritt 8 verifiziert Freshness vor dem Archiv-Push (D2)

In `scripts/devflow-post-merge-finalize.sh` die Archiv-Subshell (Schritt 8) härten: `set -e` in
die Subshell, `task freshness:regenerate` ohne `|| true`, und zwischen `git cherry-pick
"$ARCHIVE_COMMIT"` und `git push -u origin "$ARCHIVE_BRANCH"` die Pre-Push-Verifikation
einfügen (T002252-Muster "regenerated but not staged"):

> S1-Budget `scripts/devflow-post-merge-finalize.sh` (gemessen 2026-08-15, `wc -l` gegen
> a34a4a90f): Ist 294, nicht gebaselined in `docs/code-quality/baseline.json` → Budget = Limit
> 800 − Ist 294 = 506 Zeilen. Die Härtung fügt ~10 Zeilen hinzu.

```bash
  (
    set -e
    cd "$ARCHIVE_DIR"
    bash scripts/openspec.sh archive "$SLUG"
    # Freshness: openspec.sh regeneriert openspec-status.json nach dem Move —
    # Regeneration und explizites Staging nach plan-archive-steps (T002252).
    # [T006371] Ohne `|| true`: set -e macht eine fehlgeschlagene Regeneration
    # fail-closed statt still weiterzulaufen (PR #4529/#4533).
    task freshness:regenerate
    git add openspec/changes/ openspec/changes/archive/ openspec/specs/ website/src/data/openspec-status.json
    git add -u -- website/src/data website/src/lib website/public/learning-assets docs
    git commit -m "chore(plans): archive $SLUG → postgres + openspec/archive [$TICKET_ID]"
    ARCHIVE_COMMIT="$(git rev-parse HEAD)"
    # Der Archiv-Branch MUSS von origin/main abzweigen, nicht vom Fix-Branch
    # (T002256) — squash-and-merge hinterlaesst den Fix-Branch am Pre-Squash-Stand.
    ARCHIVE_BRANCH="chore/plan-archive-${SLUG//\//-}-${TICKET_ID}"
    git fetch origin main
    git checkout -B "$ARCHIVE_BRANCH" origin/main
    git cherry-pick "$ARCHIVE_COMMIT"
    # Pre-Push-Freshness-Verifikation (T006371): freshness:check diffet die
    # regenerierten Artefakte gegen HEAD. Meldet er Drift, werden die
    # regenerierten Artefakte gestaged und der Archiv-Commit ameded — BEVOR
    # der Push den Archiv-Branch nach aussen traegt (PR #4529/#4533).
    if ! task freshness:check; then
      echo "freshness:check meldet Drift — regenerierte Artefakte stagen und Archiv-Commit amenden" >&2
      git add openspec/changes/ openspec/changes/archive/ openspec/specs/ website/src/data/openspec-status.json
      git add -u -- website/src/data website/src/lib website/public/learning-assets docs
      git commit --amend --no-edit
      task freshness:check
    fi
    git push -u origin "$ARCHIVE_BRANCH"
    # PR-Erstellung mit Assert (verhindert ungebuendelte Archiv-Branches, T001331)
    ARCHIVE_PR_URL="$(gh pr create \
      --title "chore(plans): archive $SLUG → postgres + openspec/archive [$TICKET_ID]" \
      --body "Automatischer Archiv-PR für $SLUG (Ticket $TICKET_ID). Plan wurde nach postgres archiviert." \
      --head "$ARCHIVE_BRANCH" \
      --base main)"
    [[ -n "$ARCHIVE_PR_URL" ]] || { echo "FATAL: gh pr create returned empty URL for $ARCHIVE_BRANCH" >&2; exit 1; }
    # Push-Verification vor Auto-Merge (T001268)
    REMOTE_SHA="$(git ls-remote origin "refs/heads/$ARCHIVE_BRANCH" | cut -f1)"
    LOCAL_SHA="$(git rev-parse HEAD)"
    [[ "$REMOTE_SHA" = "$LOCAL_SHA" ]] || { echo "FATAL: remote SHA ($REMOTE_SHA) != local SHA ($LOCAL_SHA)" >&2; exit 1; }
    gh pr merge --auto --squash --delete-branch "$ARCHIVE_PR_URL"
  )
```

Danach:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/archive-status-offline-staging.bats
# expected: PASS (alle 3 Tests, insbesondere der Querschnitts-Guard)
```

## Task 4 — SSOT-Delta ist geschrieben (Verifikation)

Das ADDED-Delta `openspec/changes/archive-status-staging-guard/specs/scripts.md`
(Requirement "archive stages the openspec status map unconditionally", Szenarien
"Offline run stages the status map" / "Failed regeneration aborts the archive") liegt im Branch
vor. Der Implementer verifiziert, dass es beim Archivieren auf `openspec/specs/scripts.md`
merge-fähig ist (kein bestehendes Requirement mit demselben Namen, Szenarien mit GIVEN/WHEN/THEN):

```bash
grep -c "archive stages the openspec status map unconditionally" openspec/specs/scripts.md
# expected: 0 (SSOT traegt das Requirement erst nach dem Archive-Merge)
```

## Task 5 — Beide Richtungen belegen

- **Rot-Richtung:** `git show HEAD:scripts/openspec.sh` gegen die Arbeitsbaum-Version vergleichen
  (oder die Änderung temporär stashen) — der Guard muss ohne den Fix rot sein. Der RED-Beweis aus
  Task 1 ist der Beleg; ein erneuter Lauf gegen den ungehärteten Stand dokumentiert die
  Gegenrichtung.
- **Grün-Richtung:** mit gehärteten Skripten:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/openspec-workflow*
# expected: PASS (auch Bestandsdateien plan-archive-git-add-coverage.bats usw.)
```

## Task 6 — Abschluss-Verifikation

```bash
task test:changed        # Offline-Tests inkl. neuer Guard
task freshness:regenerate && task freshness:check   # Artefakte aktuell, kein Drift
task test:inventory      # Test-Inventar regenerieren (CI-Gate)
```

`website/src/data/test-inventory.json` muss die neue Testdatei enthalten; bei Änderung wird sie
im selben Commit mitgeführt (Koordination T006369: beide Pläne regenerieren diese Datei — der
letzte Merge gewinnt, `task test:inventory` gleicht ab). `git status` zeigt danach nur die
intendierten Dateien: `scripts/openspec.sh`, `scripts/devflow-post-merge-finalize.sh`,
`tests/spec/openspec-workflow/archive-status-offline-staging.bats`,
`tests/spec/openspec-workflow/archive-terminal-ticket-status.bats`,
`website/src/data/test-inventory.json`, `openspec/changes/archive-status-staging-guard/` und
deren Delta.
