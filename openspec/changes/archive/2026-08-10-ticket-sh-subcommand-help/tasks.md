---
title: "ticket-sh-subcommand-help — Implementation Plan"
ticket_id: T002843
domains: [scripts-infra, agent-behavior]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ticket-sh-subcommand-help — Implementation Plan

_Ticket: T002843_

## File Structure

```
tests/spec/ticket-system/subcommand-help.bats      NEU  (liegt bereits vor, RED)
scripts/lib/ticket-help.sh                         NEU  (Hilfetexte + Vorabgriff)
scripts/ticket.sh                                  MOD  (Dispatcher + Subkommandos)
scripts/vda/ticket/create.sh                       MOD  (Vorabgriff vor der Schleife)
scripts/lib/ticket-links.sh                        MOD  (Vorabgriff vor der Schleife)
openspec/changes/ticket-sh-subcommand-help/specs/ticket-system.md   NEU (Delta-Spec)
CLAUDE.md                                          MOD  (Bug-Triage-Beispiel)
website/src/data/test-inventory.json               GEN  (task test:inventory)
```

Zeilenbudget (S1): `scripts/ticket.sh` steht namentlich auf der `s1.ignore`-Liste in
`docs/code-quality/gates.yaml` — ein Eingestaendnis, kein Freibrief. Genau deshalb gehoeren die
Hilfetexte in das neue Modul `scripts/lib/ticket-help.sh` und nicht als weitere Here-Docs in die
ohnehin ueberlange Hauptdatei. `scripts/vda/ticket/create.sh` und `scripts/lib/ticket-links.sh`
sind nicht gebaselined und liegen mit 139 bzw. 164 Zeilen weit unter dem `.sh`-Limit; die
Aenderung dort betraegt wenige Zeilen pro Subkommando.

`scripts/lib/ticket-help.sh` wird von `scripts/ticket.sh` gesourct und ist damit erreichbar —
keine S4-Orphan-Verletzung.

## Task 1 — Failing-Test-Step (RED)

Der Test liegt bereits auf dem Branch: `tests/spec/ticket-system/subcommand-help.bats`
(Konvention T002416: eigenes Verzeichnis pro SSOT-Spec, eine Datei pro Vorgang). Er prueft
Semantik statt Darstellung (T002716): Exit-Code, Abwesenheit der "Unknown …"-Zurueckweisung,
Vorhandensein der Flagnamen — nicht den Wortlaut der Hilfe. Der Wortlaut ist damit frei
waehlbar.

Vor der Implementierung ausfuehren und den roten Zustand bestaetigen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/subcommand-help.bats
# expected: FAIL — 5 von 7 rot (help, --help, create --help, update-status -h,
# add-pr-link --help). Gruen sind nur die beiden Anker: der argumentlose Aufruf
# listet die Kommandos, und eine echt unbekannte Option bleibt ein Fehler.
```

Beide gruenen Tests sind Anker, keine Fuellsel: ohne sie bestuenden die
Abwesenheits-Zusicherungen auch dann, wenn das Skript gar nichts mehr ausgibt oder wenn ein Fix
jede unbekannte Option kommentarlos als Hilfeaufruf behandelt.

## Task 2 — Hilfe-Modul `scripts/lib/ticket-help.sh` anlegen

Neues Modul mit zwei Bestandteilen:

1. `ticket_help_wanted "$@"` — gibt 0 zurueck, wenn das **erste** Argument `--help` oder `-h`
   ist. Nur das erste Argument, damit ein Ticket mit dem Titel `-h` nicht als Hilfeaufruf
   verstanden wird und `--description "… -h …"` unberuehrt bleibt.
2. `ticket_help_subcommand <name>` — gibt den Hilfetext des Subkommandos auf stdout aus. Die
   Texte liegen als Here-Docs in diesem Modul, ein Block pro Subkommando, Pflichtfelder sichtbar
   markiert (z. B. mit dem Zusatz `(required)`, konsistent mit den bestehenden
   `ERROR: … are required.`-Meldungen).

Die Pflichtfelder je Subkommando NICHT frei erfinden, sondern aus der jeweiligen
`if`-Bedingung hinter der Options-Schleife ablesen — dort steht heute schon, was verlangt wird
(Beispiel `scripts/vda/ticket/create.sh`: `--type`, `--title`, `--description`).

Hilfetexte fuer alle im Dispatcher gelisteten Subkommandos anlegen. Fehlt ein Text, gibt
`ticket_help_subcommand` als Rueckfall die Optionsnamen aus, die die Options-Schleife des
Subkommandos kennt, plus den Verweis auf den argumentlosen Aufruf — kein stiller Leerlauf.

## Task 3 — Vorabgriff in den Subkommandos

In jedem Subkommando **vor** der `while`-Schleife (Muster `scripts/worktree-create.sh`, T002783):

```sh
if ticket_help_wanted "$@"; then ticket_help_subcommand <name>; exit 0; fi
```

Drei Dateien, weil die Subkommandos verteilt liegen — ein Fix, der nur die Hauptdatei erfasst,
laesst die ausgelagerten still unveraendert (so geschehen bei T002697):

- `scripts/ticket.sh` — die Subkommandos mit eigener Options-Schleife in dieser Datei.
- `scripts/vda/ticket/create.sh` — `create`.
- `scripts/lib/ticket-links.sh` — `add-pr-link`, `link-tickets`, `get-ticket-links`.

`scripts/ticket-reclaim.sh` wird per `exec` aufgerufen und braucht denselben Vorabgriff, sofern
es eine eigene Options-Schleife hat.

Bei der Gelegenheit den bei T002697 uebersehenen Hinweis in `scripts/vda/ticket/create.sh`
nachziehen: der `*)`-Zweig dort nennt anders als die uebrigen Subkommandos nicht den Weg zur
erwarteten Form.

## Task 4 — `help` / `--help` / `-h` auf oberster Ebene

Den Usage-Block aus `scripts/ticket.sh` (heute im `if [[ $# -lt 1 ]]`-Zweig) in eine Funktion
`ticket_usage` in `scripts/lib/ticket-help.sh` ziehen und an drei Stellen verwenden:

- kein Argument → `ticket_usage`, Exit 1 (unveraendert: ein Aufruf ohne Kommando ist ein
  Fehlaufruf, und `tests/spec/software-factory/ticket-usage-hints.bats` verlaesst sich darauf).
- `help` / `--help` / `-h` als Kommando → `ticket_usage`, **Exit 0**.
- `help <subkommando>` → `ticket_help_subcommand <subkommando>`, Exit 0. Damit ist die
  Optionsebene auch fuer den erreichbar, der die Hilfe-vor-Kommando-Form gewohnt ist.

Die Kommandoliste im Usage-Text ist heute ein handgepflegter String und weicht bereits vom
`case`-Block ab. In dieser Aenderung nicht mitgeloest — sie wird beim Verschieben unveraendert
uebernommen, damit der Diff lesbar bleibt.

## Task 5 — CLAUDE.md-Beispiel ausfuehrbar machen

Im Abschnitt "Bug-Triage-Konvention (CFR-Gate G-DORA03)" die Beispielzeile um `--description`
ergaenzen. Ohne sie bricht der dort genannte kanonische Weg mit
`ERROR: --type, --title, and --description are required.` ab — das war der ausloesende Befund
des Tickets.

## Task 6 — Final Verification

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/subcommand-help.bats
# erwartet: 7/7 gruen

# Regressionsschutz: der Guard aus T002697 darf nicht kippen — er prueft, dass
# unbekannte Argumente weiterhin fehlschlagen und den Weg zur Form nennen.
tests/unit/lib/bats-core/bin/bats -r tests/spec/software-factory tests/spec/ticket-system*

task test:inventory
task test:changed
task freshness:regenerate
task freshness:check
```

`task test:inventory` ist Pflicht, weil eine neue Testdatei hinzukommt; CI vergleicht
`website/src/data/test-inventory.json` gegen den committeten Stand.

Rauchprobe am lebenden Skript, weil der Test nur eine Auswahl von Subkommandos abdeckt:

```bash
for c in create update-status update-fields add-comment add-pr-link stage-plan get list; do
  out=$(bash scripts/ticket.sh "$c" --help 2>&1); rc=$?
  printf '%-16s rc=%s zeilen=%s\n' "$c" "$rc" "$(printf '%s' "$out" | grep -c .)"
done
# erwartet: ueberall rc=0 und zeilen > 0 — der Zeilenzaehler ist der Positiv-Anker,
# ohne ihn wuerde eine leere Ausgabe mit Exit 0 als Erfolg durchgehen.
```

<!-- vitest: kein neuer Test noetig — die Aenderung betrifft ausschliesslich Shell-Skripte,
     kein Code unter website/src/. -->
