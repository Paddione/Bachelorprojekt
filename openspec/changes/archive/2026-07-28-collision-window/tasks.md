---
title: "collision-window — Implementation Plan"
ticket_id: T002444
domains: [bachelorprojekt-test]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# collision-window — Implementation Plan

_Ticket: T002444 · Design: `openspec/changes/collision-window/design.md`_

## File Structure

| Datei | Ist | Budget |
|---|---|---|
| `scripts/agent-collision.sh` | 121 | 379 |
| `tests/spec/software-factory/collision-window.bats` | 228 | — (`.bats` unterliegt keinem S1-Limit) |
| `openspec/changes/collision-window/specs/software-factory.md` | neu | — |

`scripts/agent-collision.sh` ist nicht gebaselined; wirksame Schwelle ist das statische
`.sh`-Limit 500. Die geplanten Änderungen liegen bei rund 40 Zeilen, das Budget ist damit
komfortabel. Kein Split nötig.

`scripts/agent-lock.sh` wird bewusst **nicht** angefasst — drei offene Worktrees
(`chore/fix-ticket-tracking-T002279`, `chore/mishap-T002341`, `chore/mishap-T002374`) ändern die
Datei bereits. Die Drift-Ursache adressiert stattdessen der Guard-Test in Task 1.

## Task 1 — RED bestätigen

Der Test liegt bereits auf dem Branch (Fix-Pfad-Pflicht: failing Test vor Plan). Dieser Schritt
bestätigt nur, dass er aus den richtigen Gründen rot ist, bevor irgendetwas implementiert wird.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/collision-window.bats
# expected: FAIL — 6 von 8 rot (D1 ohne Override, D1-Drift-Guard, D2, D3, D4 ×2)
```

Die zwei grünen Tests sind Absicht: „numerisch-toter Peer bleibt tot" und „committete
Peer-Änderung an anderer Datei" sichern ab, dass der Fix nicht über sein Ziel hinausschießt. Sie
müssen am Ende grün bleiben.

- [ ] Lauf ausgeführt, 6 rot / 2 grün bestätigt
- [ ] Jeder Fehlschlag sitzt auf einer Defekt-Assertion, nicht auf einem Fixture-Fehler

## Task 2 — D1: Harness-SIDs als lebendig behandeln

In `scripts/agent-collision.sh`, Funktion `_sid_alive`: den Zweig aus `scripts/agent-lock.sh:64`
spiegeln. Er gehört **nach** die `AGENT_LOCK_FAKE_ALIVE`-Abfrage und **vor** den `pgrep`-Aufruf,
damit die Test-Overrides weiter Vorrang haben.

```bash
  # Spiegelt scripts/agent-lock.sh:_sid_alive [T001268]: nicht-numerische SIDs sind
  # harness-vergebene Session-IDs (CLAUDE_SESSION_ID), die `pgrep -s` nicht aufloesen
  # kann. Bei Aenderung dort HIER nachziehen — Guard: der Drift-Test in
  # tests/spec/software-factory/collision-window.bats vergleicht beide Urteile.
  case "$1" in *[!0-9]*) return 0;; esac
```

Numerische SIDs bleiben `pgrep`-verifiziert; tote Sessions bleiben tot.

- [ ] Zweig ergänzt, Kommentar mit T001268-Verweis gesetzt
- [ ] `bats tests/spec/software-factory/collision-window.bats` — die drei D1-Tests grün
- [ ] `bats tests/unit/agent-collision.bats` — alle 8 Bestandstests weiter grün

## Task 3 — D2: Peer-Menge um committete Divergenz erweitern

In `cmd_check`, in der Peer-Schleife: die Peer-Dateimenge wird zur Vereinigung aus committeter
Branch-Divergenz, unstaged und staged. Der Drei-Punkt-Operator ist zwingend — der Zwei-Punkt-Diff
wurde gemessen und verworfen (er zieht den `main`-Fortschritt seit dem Fork mit, 52–386 statt
0–13 Dateien pro Worktree).

```bash
  # Drei-Punkt gegen den Merge-Base: nur was DIESER Branch geaendert hat.
  # Schlaegt die Aufloesung von main fehl (detached HEAD, fehlender Branch), entfaellt
  # nur der committete Anteil — der Working-Tree-Anteil laeuft weiter (fail-open).
  peer="$( { git -C "$wt" diff --name-only main...HEAD 2>/dev/null; \
             git -C "$wt" diff --name-only HEAD 2>/dev/null; \
             git -C "$wt" diff --cached --name-only 2>/dev/null; } | sed '/^$/d' | sort -u )"
```

- [ ] Peer-Menge erweitert, fail-open beim Auflösen des Base-Refs erhalten
- [ ] `bats … collision-window.bats` — beide D2-Tests grün
- [ ] Gegenprobe von Hand im echten Repo: `bash scripts/agent-collision.sh check --all` meldet
      `scripts/agent-lock.sh` als Kollision mit den drei bekannten Worktrees

## Task 4 — D3: Blob-Filter gegen squash-gemergte Peers

Nach der Schnittmengenbildung, vor der Ausgabe: für jede Kollisionsdatei den Blob im
Peer-Worktree gegen den in `main` vergleichen. Sind sie gleich, ist die Arbeit bereits in `main`
und der Eintrag entfällt. Der Vergleich läuft nur auf der Schnittmenge, nicht auf allen
Peer-Dateien.

```bash
  # Squash-Merge: die Peer-Commits sind keine Ancestors von main, main...HEAD listet die
  # Datei weiter — aber wenn der Blob identisch ist, ist nichts mehr offen.
  # Fehlschlagende rev-parse (Datei in main nicht vorhanden) => behalten, nicht verwerfen.
  peer_blob="$(git -C "$wt" rev-parse "HEAD:$file" 2>/dev/null || true)"
  main_blob="$(git rev-parse "main:$file" 2>/dev/null || true)"
  [ -n "$peer_blob" ] && [ "$peer_blob" = "$main_blob" ] && continue
```

Die Richtung des fail-open ist hier bewusst umgekehrt: bei unklarer Datenlage wird **behalten**,
also gewarnt. Ein Fehlalarm ist billiger als eine verschwiegene Kollision.

- [ ] Blob-Filter ergänzt
- [ ] `bats … collision-window.bats` — D3-Test grün, inklusive seines Positiv-Ankers

## Task 5 — D4: `--branch`-Modus

In der Argument-Schleife von `cmd_check` neben `--staged` und `--all`. Im Modus `branch` wird die
eigene Dateimenge zur Vereinigung aus `main...HEAD`, unstaged und staged; die Peer-Seite bleibt
unverändert. Der Usage-String am Ende von `main()` wird mitgezogen.

Nach der Implementierung `.claude/skills/references/session-coordination.md` um den neuen Modus
ergänzen (Abschnitt „Agent-Collision"), damit die Skill-Referenz nicht hinter dem Skript
zurückbleibt.

- [ ] `--branch` implementiert, Usage-String ergänzt
- [ ] `bats … collision-window.bats` — beide D4-Tests grün
- [ ] `session-coordination.md` um `--branch` ergänzt

## Task 6 — Abschluss-Verifikation

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/collision-window.bats
tests/unit/lib/bats-core/bin/bats tests/unit/agent-collision.bats
task test:inventory
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] Alle 8 Tests der neuen Datei grün, alle 8 Bestandstests grün
- [ ] `website/src/data/test-inventory.json` regeneriert und mitcommittet
- [ ] `docs/code-quality/baseline.json` hat **keine** neuen Keys
- [ ] `bash scripts/openspec.sh validate` grün
