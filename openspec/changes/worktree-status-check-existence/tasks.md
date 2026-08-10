---
title: "worktree-status-check-existence — Implementation Plan"
ticket_id: T002932
domains: [bachelorprojekt-test, agent-skills]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# worktree-status-check-existence — Implementation Plan

_Ticket: T002932_

## File Structure

| Datei | Ist | Budget |
|---|---|---|
| `scripts/worktree-clean-check.sh` | 0 (neu) | 800 |
| `tests/spec/repo-hygiene/worktree-clean-check-existence.bats` | 133 (in dieser PR bereits angelegt) | — |
| `.claude/skills/references/repo-hygiene-ops.md` | 444 | — |
| `openspec/changes/worktree-status-check-existence/specs/agent-skills.md` | Delta-Spec | — |
| `website/src/data/test-inventory.json` | Generat | — |

Zu den Budgets: `.sh` hat laut `yq '.s1.limits' docs/code-quality/gates.yaml` das statische
Limit 800 und das neue Skript ist nicht gebaselined, geplanter Umfang ~80 Zeilen — reichlich
Reserve. `.md` und `.bats` stehen nicht in `s1.limits`, sind also nicht S1-gated; für sie
wird bewusst keine Zahl behauptet.

Kontext, warum diese Dateien und nicht mehr: der Defekt sitzt in einer Kopiervorlage im
Runbook. Die Entscheidung „Skript statt Textschärfung" samt Gegenargument steht in
`proposal.md`; sie ist die Begründung dafür, dass hier überhaupt eine `.sh`-Datei entsteht.

<!-- vitest: kein neuer Test nötig, weil kein Code unter website/src/ berührt wird -->

## Task 1 — RED: der Guard schlägt fehl, weil es den Vorcheck nicht gibt

Die Testdatei `tests/spec/repo-hygiene/worktree-clean-check-existence.bats` liegt bereits
auf dem Branch (mit diesem Plan gestaged). Sie prüft gegen Wegwerf-Repos unter
`BATS_TEST_TMPDIR`, nie gegen das Repo des Laufs.

Ausführen und den roten Zustand belegen:

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/repo-hygiene/worktree-clean-check-existence.bats
tests/unit/lib/bats-core/bin/bats tests/spec/repo-hygiene/worktree-clean-check-existence.bats
# expected: FAIL — 5 von 5 rot; vier scheitern an `[ -x "$CHECK" ]` (das Skript fehlt),
# der fünfte daran, dass §1 den Skriptaufruf noch nicht nennt.
```

Die **Ausgabe** prüfen, nicht nur den Exit-Code: `bats` endet auf einer nicht existierenden
Datei mit 0 (T003278, am 2026-08-10 verifiziert) — ein Tippfehler im Pfad sähe sonst aus wie
ein grüner Lauf. Erwartet sind fünf `not ok`-Zeilen.

Für den Syntax-Check `--count` verwenden, **nicht** `bash -n`: `@test "…" { … }` ist keine
gültige Bash-Syntax und `bash -n` meldet einen irreführenden Fehler.

## Task 2 — `scripts/worktree-clean-check.sh` anlegen

Neues Skript, `set -euo pipefail`, Aufruf `scripts/worktree-clean-check.sh <path>`. Die
Reihenfolge ist der eigentliche Fix — jede Stufe läuft erst, wenn die vorige ihre Substanz
belegt hat:

1. **Argumentprüfung.** Kein oder mehr als ein Pfad → Usage nach stderr, Exit 2.
2. **Existenz.** `[ -d "$path" ]` — sonst Meldung, die den Pfad wörtlich enthält, plus den
   Hinweis auf `git worktree prune`, Exit 2.
3. **Git-Status mit Exit-Code.** `out="$(git -C "$path" status --porcelain 2>&1)"` und
   `rc=$?` getrennt auswerten — die Zuweisung darf nicht in einer Pipe stehen, sonst geht
   genau der Exit-Code wieder verloren, um den es hier geht. Bei `rc != 0`: Meldung mit
   Pfad und der git-Ausgabe, Exit 2.
4. **Allowlist-Filter.** Erst jetzt die Pfade aus `cut -c4-` gegen dieselben Muster filtern,
   die §1 dokumentiert (`openspec/changes/`, `docs/code-quality/`, `website/src/data/`,
   `.release-please-manifest.json`, `website/CHANGELOG.md`, `website/package.json`).
   Bleibt etwas übrig: die Pfade ausgeben, Exit 1. Sonst Exit 0.

Exit-Code-Kontrakt im Kopfkommentar festhalten: **0 sauber, 1 Befund, 2 nicht prüfbar.**
Die Trennung von 1 und 2 ist der Zweck des Tickets — ein gemeinsamer Fehlercode machte
„dirty" und „nicht prüfbar" wieder ununterscheidbar, nur eine Ebene höher.

Zur Allowlist: SSOT bleibt `ALLOWLIST=` in `scripts/branch-reaper.sh`, das für Branches
dieselbe Unterscheidung trifft. Das neue Skript spiegelt die Muster mit einem Kommentar,
der auf `branch-reaper.sh` verweist — dieselbe Beziehung, die §1 heute schon dokumentiert.
Eine Zusammenführung der beiden Listen ist ein eigener Vorgang und gehört nicht hierher.

`chmod +x scripts/worktree-clean-check.sh` — der Guard prüft `-x`.

**S4-Orphan-Regel:** jedes neue `scripts/*.sh` muss von Taskfile, CI, Doku oder einem
anderen Skript aus erreichbar sein. Erreichbarkeit entsteht hier über die Runbook-Referenz
aus Task 3; nach Task 3 gegenprüfen mit `task quality:check`.

## Task 3 — Runbook §1 auf den Skriptaufruf umstellen

In `.claude/skills/references/repo-hygiene-ops.md` §1:

- Im ersten Fenced-Block die Zeile `git -C <path> status --porcelain` durch
  `bash scripts/worktree-clean-check.sh <path>` ersetzen, mit dem Exit-Code-Kontrakt als
  Kommentar direkt daneben. Der Aufruf steht neben `worktree-git-op-guard.sh`, dem
  bestehenden ausführbaren Vorcheck desselben Abschnitts.
- Einen kurzen Absatz ergänzen, warum die frühere Pipe-Form nicht genügt: der Exit-Code
  geht in der Pipe verloren, ein fehlendes Verzeichnis liefert dieselbe leere Ausgabe wie
  ein sauberer Baum. Die Verwandtschaft zu §0/§3 („eine leere Antwort ist kein Urteil")
  benennen, damit §1 nicht als Sonderfall gelesen wird.
- Den bestehenden Allowlist-Block **stehen lassen** und als Beschreibung des Filters
  kennzeichnen, den das Skript anwendet. Er ist die Bezugsstelle des Guards aus T003121
  (`tests/spec/repo-hygiene/worktree-remove-generat-allowlist.bats`), der die dort
  dokumentierte Form per `awk` ausschneidet und ausführt. Wird er entfernt oder in seiner
  Struktur verändert, bricht dieser Guard.

Danach beide Testformen desselben Spec-Slugs laufen lassen (T002696 — eine Suche nur nach
der Sammeldatei fände die Verzeichnisform nicht):

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/repo-hygiene*
# erwartet: alle grün — die neuen fünf aus Task 1 und die bestehenden 15 aus
# T003121/T002709, die durch die Umstellung nicht brechen dürfen.
```

Auch hier die Ausgabe lesen, nicht nur den Exit-Code.

## Task 4 — Test-Inventar regenerieren

Die neue `.bats`-Datei taucht im Inventar auf; CI vergleicht fail-closed gegen die
committete Fassung.

```bash
task test:inventory
git status --porcelain website/src/data/test-inventory.json
```

Weicht die Datei ab, mitcommitten.

## Task 5 — Abschließende Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich `bash scripts/plan-lint.sh openspec/changes/worktree-status-check-existence/tasks.md`
(Exit 0) und `task openspec:validate`. Bei `freshness:check` auf die S1/S4-Meldungen zum
neuen Skript achten: eine Orphan-Violation bedeutet, dass die Runbook-Referenz aus Task 3
nicht als Erreichbarkeit gezählt wurde — dann das Skript zusätzlich aus einem bestehenden
Taskfile-Target heraus aufrufbar machen, statt eine Ausnahme einzutragen.
