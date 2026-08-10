---
title: "worktree-create-git-op-guard — Implementation Plan"
ticket_id: T003215
domains: [bachelorprojekt-infra, bachelorprojekt-test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# worktree-create-git-op-guard — Implementation Plan

_Ticket: T003215 — `worktree-create.sh` verwendet einen Worktree mitten in Rebase/Merge stillschweigend weiter._

## File Structure

| Datei | Ist-Zeilen | Budget (.sh-Limit 800, keine Baseline) |
|---|---|---|
| `scripts/worktree-git-op-guard.sh` | 116 | 684 |
| `scripts/worktree-create.sh` | 560 | 240 |
| `tests/spec/divergence-guard/worktree-create-git-op-guard.bats` | 133 | neu, kein S1-Scope für `.bats` |
| `openspec/changes/worktree-create-git-op-guard/specs/divergence-guard.md` | — | Delta-Spec (Parent-SSOT `divergence-guard`) |
| `website/src/data/test-inventory.json` | — | generiert, via `task test:inventory` |

Keine der beiden Shell-Dateien ist in `docs/code-quality/baseline.json` eingetragen; wirksame
Schwelle ist damit das statische `.sh`-Limit 800 aus `docs/code-quality/gates.yaml`. Beide
bleiben nach der Änderung weit unter 80 % davon, ein Split ist nicht einzuplanen.

Der Test liegt bereits auf dem Branch (RED, siehe Task 1). `scripts/worktree-git-op-guard.sh`
und `scripts/vda/factory-prep.sh` sind bestehende Dateien; factory-prep wird **nicht** geändert
— sein vorhandener Fehlerpfad (`SKIP reason=worktree_failed`, Slot-Freigabe, Status zurück auf
`plan_staged`) trägt den neuen Exit-Code unverändert.

## Task 1 — RED: der Failing-Test liegt vor

Der Test `tests/spec/divergence-guard/worktree-create-git-op-guard.bats` ist mit diesem Plan
bereits committet und rot. Er baut sein Fixture in einem Wegwerf-Repo (`git init` in
`mktemp -d`) und fasst niemals einen Worktree des Hauptrepos an.

- [ ] Rotlauf reproduzieren, bevor irgendeine Zeile Produktivcode entsteht:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/divergence-guard/worktree-create-git-op-guard.bats
# expected: FAIL — 3 von 5 Tests rot (Abbruch, Zustandserhalt, Exit-Code 5);
# die beiden Positiv-Anker (sauberer Zielpfad, fremder Worktree im Rebase) sind grün.
```

Gemessen am 2026-08-10 gegen `8d77df268`: `not ok 2/3/4`, `ok 1/5`. Bleiben Test 1 oder 5 nicht
grün, ist das Fixture defekt und nicht die Implementierung — dann erst das Fixture reparieren.

## Task 2 — GREEN Teil 1: `--worktree <path>` im Guard

- [ ] In `scripts/worktree-git-op-guard.sh` die Option `--worktree <path>` in der bestehenden
      `while`-Argumentschleife ergänzen. Ist sie gesetzt, wird die aus
      `git worktree list --porcelain` gefüllte Liste `worktrees` durch genau diesen einen
      (kanonisierten) Pfad ersetzt; die Prüfschleife und die Ausgabe bleiben unverändert.
- [ ] Pfad-Vergleich über den aufgelösten Pfad führen (`cd "$path" && pwd -P`), damit
      `.worktrees/x` und `/abs/.worktrees/x` derselbe Worktree sind.
- [ ] Ist der angegebene Pfad kein Verzeichnis oder kein Worktree dieses Repos: Exit `2`
      (Invocation-Fehler) mit Meldung auf stderr — nicht Exit 0, sonst schweigt der Guard bei
      einem Tippfehler.
- [ ] Usage-Zeile und den Kopfkommentar (Exit-Code-Tabelle) um die Option erweitern.
- [ ] Repo-weites Verhalten unverändert lassen: ohne Flag dieselben Exit-Codes 0/1/2.

Regressionsnachweis für den bestehenden Guard-Test:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/worktree-mid-rebase-guard.bats
```

## Task 3 — GREEN Teil 2: Aufruf im Anlege-/Wiederverwendungspfad

- [ ] In `scripts/worktree-create.sh` den Guard-Aufruf **vor**
      `git worktree remove --force "$WT_PATH"` (aktuell Zeile 301) einsetzen, also innerhalb
      bzw. unmittelbar nach dem bestehenden `if [ -d "$WT_PATH" ]`-Block, der schon den
      Agent-Lock prüft (T002896). Reihenfolge: Agent-Lock-Guard zuerst (Exit 4), dann dieser
      Guard (Exit 5) — der Lock-Befund ist die speziellere Aussage.
- [ ] Aufruf: `bash "$(dirname "$0")/worktree-git-op-guard.sh" --quiet --worktree "$WT_PATH"`.
      Exit 0 → weiter wie bisher. Exit ≠ 0 → abbrechen mit Exit `5`, Meldung auf stderr, die
      `$WT_PATH`, die erkannte Operation und den Reparaturweg
      (`git -C <pfad> rebase --continue` bzw. `--abort`) nennt.
- [ ] Fehlt `scripts/worktree-git-op-guard.sh` oder liefert es Exit `2`, ebenfalls abbrechen —
      ein nicht ausführbarer Guard darf nicht als „sauber" durchgehen (fail-closed, Lehre aus
      dem gitleaks-Fail-open T002506/T002554).
- [ ] Notfall-Umgehung `WT_ALLOW_INTERRUPTED_OP=1`: statt Abbruch eine Warnung auf stderr und
      Fortsetzung. Analog zu `WT_SKIP_NAME_CHECK` in der Meldung dokumentieren.
- [ ] Exit-Code-Tabelle im Kopfkommentar von `worktree-create.sh` um `5` ergänzen; die
      bestehenden Codes 0/1/3/4 bleiben unberührt. Die Zeichenkette `ready on` in der
      Erfolgsmeldung nicht anfassen — `pipeline.js` matcht darauf.
- [ ] `scripts/vda/factory-prep.sh` NICHT ändern: Zeile 198 wertet nur „Exit ≠ 0" aus und
      behandelt den Fall bereits korrekt (`SKIP reason=worktree_failed`, `release_slot_and_restore`
      auf `plan_staged`).

Grünlauf:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/divergence-guard/worktree-create-git-op-guard.bats
# erwartet: 5 von 5 grün
```

## Task 4 — Dokumentation der neuen Semantik

- [ ] `.claude/skills/references/repo-hygiene-ops.md` §1: einen Satz ergänzen, dass
      `worktree-create.sh` den Guard am Zielpfad selbst fail-closed fährt (Exit 5) und wie die
      Umgehung heißt. Die bestehende Reihenfolge Guard-vor-Vorcheck nicht umstellen — der Test
      `tests/spec/agent-skills/worktree-mid-rebase-guard.bats` prüft sie.
- [ ] Prüfen, ob `docs/superpowers/references/gotchas-footguns.md` einen Eintrag zum
      Worktree-Cleanup führt, der die neue Exit-Bedeutung nennen muss; falls ja, dort ergänzen.

## Task 5 — Abschluss-Verifikation

- [ ] Testinventar nach der Testdatei-Ergänzung regenerieren und mitcommitten (CI ist
      fail-closed gegen `website/src/data/test-inventory.json`):

```bash
task test:inventory
```

- [ ] Beide Worktree-Testdateien gemeinsam laufen lassen — Sammeldatei **und** Verzeichnis
      erfassen (T002696):

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/divergence-guard*
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/worktree-mid-rebase-guard.bats
```

- [ ] Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
