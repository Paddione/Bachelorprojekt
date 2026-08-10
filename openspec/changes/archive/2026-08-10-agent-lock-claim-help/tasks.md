---
title: "agent-lock-claim-help — Implementation Plan"
ticket_id: T003107
domains: [scripts, agent-skills]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# agent-lock-claim-help — Implementation Plan

_Ticket: T003107 · Spec-Delta: `openspec/changes/agent-lock-claim-help/specs/agent-skills.md`_

## File Structure

| Datei | Ist | Budget |
| --- | --- | --- |
| `scripts/agent-lock.sh` | 675 | 125 |
| `tests/spec/agent-skills/agent-lock-claim-help-flag.bats` | 81 | neu |

- `scripts/agent-lock.sh` — geaendert: `cmd_claim` bekommt eine Help-Abfrage vor der
  Scope-Zuweisung und eine Scope-Validierung. Nicht baselined, statisches `.sh`-Limit 800.
- `tests/spec/agent-skills/agent-lock-claim-help-flag.bats` — neu, liegt bereits auf dem
  Branch und ist ROT.

## Task 1 — RED bestaetigen

Der Test liegt schon auf dem Branch. Vor jeder Codeaenderung ausfuehren und den roten Lauf
belegen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/agent-lock-claim-help-flag.bats
# expected: FAIL — Test 1 bricht an `[ ! -e "$AGENT_LOCK_DIR/--help__.json" ]` ab,
# Test 2 an `[ "$status" -ne 0 ]` fuer den leeren Scope.
```

Wichtig: der Test isoliert sich ueber `AGENT_LOCK_DIR` auf ein `mktemp -d`-Verzeichnis. Diese
Isolation nicht aufweichen — ein Lauf gegen `.git/agent-locks/` legt echte Locks an oder
loescht sie und stoert damit die laufende Factory.

## Task 2 — `--help` vor der Scope-Zuweisung abfangen

In `cmd_claim` (`scripts/agent-lock.sh`, ab Zeile 345) direkt als erste Anweisung — noch vor
dem `cmd_reap`-Aufruf und vor `SCOPE="$1"` — `-h`/`--help` behandeln: Optionsliste auf stdout
ausgeben, Exit 0.

Vorbild ist `scripts/worktree-create.sh` Zeile 33 ff. (T002783: `--help` vor allen Guards).
Dort steht ein `cat <<'HELP'`-Heredoc; dieselbe Form hier verwenden.

Die Hilfeausgabe nennt mindestens: die positionale Reihenfolge `claim <scope> <id> [flags]`
sowie die Flags `--label`, `--worktree`, `--branch`, `--ticket`, `--force`. Der Wortlaut ist
frei — der Test prueft nur, dass ueberhaupt ein Langflag ausgegeben wird, nicht welches
(T002716).

Den Grund als Kommentar mit Ticketbezug festhalten, wie im Rest der Datei ueblich: `--help`
wurde bis T003107 als Scope-Name gelesen und erzeugte `--help__.json`.

## Task 3 — leeren und flag-foermigen Scope zurueckweisen

Nach der Help-Abfrage und vor dem Schreiben des Locks pruefen: ist `$SCOPE` leer oder beginnt
er mit `-`, dann eine Diagnose auf stderr ausgeben und mit Exit != 0 abbrechen. Die bereits
vorhandene Funktion `_reject_arg` (Zeile 332) formuliert die passende Meldung fuer unbekannte
Argumente und nennt die korrekte positionale Form — sie wiederverwenden statt eine zweite
Fehlermeldung mit abweichendem Wortlaut zu schreiben.

Die Pruefung darf `cmd_check_and_claim` (Zeile 487) nicht umgehen: auch dieser Pfad ruft
`cmd_claim` und profitiert von derselben Zurueckweisung. Vorhandenes Verhalten fuer gueltige
Scopes (`ticket`, `branch`, `main-checkout`) bleibt unveraendert.

## Task 4 — GREEN nachweisen und Regressionen ausschliessen

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/agent-lock-claim-help-flag.bats
```

Beide Tests muessen gruen sein. Zusaetzlich die bestehenden agent-lock-Suiten laufen lassen,
weil `cmd_claim` ihr gemeinsamer Einstiegspunkt ist — beide Formen der Testablage erfassen
(Sammeldatei und Verzeichnis, T002696):

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/agent-lock* tests/spec/agent-skills* \
  tests/spec/factory-reclaim-lock-respect*
```

## Task 5 — Abschliessende Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

`task freshness:regenerate` aktualisiert unter anderem `website/src/data/test-inventory.json`
— die neue BATS-Datei muss dort auftauchen, sonst schlaegt der Inventar-Check in CI fehl. Das
regenerierte Artefakt mitcommitten.
