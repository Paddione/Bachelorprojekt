---
title: "fix-spec-suite-leaks-website — Implementation Plan"
ticket_id: T011792
domains: [test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
---

# fix-spec-suite-leaks-website — Implementation Plan

## File Structure

| Datei | Ist | Budget | Aktion |
|---|---|---|---|
| `tests/spec/repo-structure/website-moved.bats` | 85 | S1-ignore (`tests/**/*.bats` — kein Ratchet) | setup/teardown-rmdir ergänzen |
| `tests/spec/repo-structure/spec-suite-website-leak.bats` | neu (~75) | S1-ignore (`tests/**/*.bats` — kein Ratchet) | neuer RED-Test (bats-in-bats) |
| `components/website/src/data/test-inventory.json` | generiert | generiert (freshness) | `task test:inventory` regenerieren |

Alle drei Pfade liegen außerhalb der S1-Zeilenlimits (Ignored-Klasse `tests/**/*.bats`
bzw. generiertes Freshness-Artefakt) — es gibt kein Zeilenbudget-Risiko und keine
Baseline-Änderung.

## Tasks

### Task 1: Leak-Quelle diagnostizieren und fixen, falls reproduzierbar

Der Leak ist belegt (Watcher-Messung im Ticket, Minute ~13 des Full-Suite-Laufs,
aktive Slots 463–471), der exakte Verursacher steht noch nicht fest. Die sechs
Kandidaten aus der Messung waren einzeln und parallel je sauber.

1. Instrumentierten Full-Suite-Lauf wiederholen (cwd = Worktree-Root):

```bash
rm -rf website
while [ ! -d website ]; do sleep 0.2; done &
watcher_pid=$!
tests/unit/lib/bats-core/bin/bats -r -j 6 --no-parallelize-within-files tests/spec/
kill "$watcher_pid" 2>/dev/null
```

    Zusätzlich einen PATH-Mkdir-Wrapper voranstellen (`/tmp/mkdir-watch/mkdir` mit
    Logging von `$PWD` + Argumenten, Owner-only 0700), damit ein `mkdir website`-Aufruf
    samt cwd direkt sichtbar wird — Shell-mkdir fängt der Wrapper, Node-
    `fs.mkdirSync`-Aufrufe über den Prozess-Snapshot beim Feuern (`/proc/<pid>/cwd`).
2. Feuert der Watcher erneut: Verursacher anhand des Snapshots/Wrapper-Logs bestimmen
   und die Quelle fixen (Pfad-Korrektur oder Cleanup im aufrufenden Skript).
3. Feuert er nicht: Befund im Ticket dokumentieren („auf aktuellem main nicht mehr
   reproduzierbar — Leak vermutlich durch zwischenzeitliche Merges beseitigt,
   Guard-Härtung aus Task 2 greift als Absicherung").

Akzeptanz: Nach einem vollständigen `bats -r tests/spec/`-Lauf existiert kein
Top-Level-Verzeichnis `website/`.

### Task 2: Guard härten — leerer Streuner weg, nicht-leerer bleibt rot

1. RED bestätigen (der Test ist bereits committet und rot):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/repo-structure/spec-suite-website-leak.bats
# expected: FAIL — "leeres website/ wird weggeraeumt, Guard bleibt gruen" schlägt fehl
```

2. In `tests/spec/repo-structure/website-moved.bats` ergänzen:

```bash
setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  # Suite-Leak wegraeumen: rmdir entfernt NUR leere Verzeichnisse — ein echtes,
  # nicht-leeres website/ (Reorg-Regression) bleibt stehen und der Guard bleibt rot.
  rmdir "$REPO_ROOT/website" 2>/dev/null || true
}

teardown() {
  # Nach einem roten Lauf (Streuner tauchte zwischen setup und Assertion auf)
  # das Root sauber hinterlassen, damit Folge-Läufe nicht vorbelastet sind.
  rmdir "$REPO_ROOT/website" 2>/dev/null || true
}
```

3. GRÜN verifizieren:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/repo-structure/spec-suite-website-leak.bats
tests/unit/lib/bats-core/bin/bats -r tests/spec/repo-structure*
```

### Task 3: Inventory regenerieren und Verify-Gates fahren

1. Test-Inventar aktualisieren (CI-Inventar-Check failt sonst):

```bash
task test:inventory
git add components/website/src/data/test-inventory.json
```

2. Verify:

```bash
task test:changed          # Gezielte Tests für geänderte Domains (BATS-Selection + quality)
task freshness:regenerate  # generierte Artefakte aktualisieren (test-inventory, repo-index, …)
task freshness:check       # CI-Äquivalent: Freshness + quality:check (S1–S4-Ratchet) + Baseline-Assertion
```
