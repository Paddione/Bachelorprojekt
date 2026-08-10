# Proposal: branch-reaper-sweep-cli

## Why

`.claude/skills/references/repo-hygiene-ops.md` §2 („Verwaiste Remote-Branches (ohne PR)") stellt
`scripts/branch-reaper.sh` als das Werkzeug für eine Klasse von Branches vor und begründet das mit
einer Bestandsaufnahme über **alle** Remote-Branches („am 2026-08-01: 24 von 26 Remote-Branches
ohne jeden PR"). Der dort dokumentierte Aufruf zum Nachsehen lautet:

```bash
bash scripts/branch-reaper.sh --ticket T00XXXX --dry-run   # zeigt REAP-/KEEP-Zeilen mit Begründung
```

Das Skript kann beides nicht leisten, was dieser Block verspricht. Zwei Tickets beschreiben
dieselbe Lücke aus zwei Richtungen; sie werden hier **gemeinsam** gelöst.

**T003180 — der Inspektionsblick verlangt eine Ticketnummer.** `scripts/branch-reaper.sh:75-79`
bricht ohne `--ticket` mit Exit 2 ab, auch wenn `--dry-run` gesetzt ist. Verifiziert:

```
$ bash scripts/branch-reaper.sh --dry-run
FEHLER: --ticket ist erforderlich (Format T######)
EXIT=2
```

Der Nachsehen-Fall braucht aber gerade kein Ticket — man will die Kandidatenliste sehen, nicht
eine Löschung einem Vorgang zuordnen. Wer §2 wörtlich befolgt, muss eine Ticketnummer erfinden
oder eine fremde einsetzen. Beides ist unerwünscht: eine erfundene Nummer erzeugt im Zweifel einen
Archiv-Tag unter falscher Zuordnung, eine fremde hängt die Aktion an einen unbeteiligten Vorgang.

**T003074 — den Sweep leistet die Kandidatenauswahl prinzipiell nicht.**
`scripts/branch-reaper.sh:118-125` selektiert Kandidaten über
`git ls-remote --heads "$REMOTE" | grep -i -- "$TICKET_ID"`. Das Skript betrachtet damit
ausschliesslich Branches **eines** Tickets. Verifiziert an einem Wegwerf-Repo mit zwei reapbaren
Branches zu zwei Tickets: ein Lauf mit `--ticket T009001` meldet genau eine `REAP`-Zeile; es gibt
keinen Aufruf, der beide meldet.

Dazu kommt die Falle, die das Ticket „real eingetreten" nennt: der wörtliche Runbook-Platzhalter
liefert

```
$ bash scripts/branch-reaper.sh --ticket T000000 --dry-run
Keine Remote-Branches mit Ticket-ID T000000 gefunden.   # Exit 0
```

Das ist von „es gibt keine verwaisten Branches" nicht zu unterscheiden — dasselbe Muster „leere
Antwort ist kein Urteil", das §0 und §3 desselben Runbooks bereits an anderer Stelle festhalten.

**Warum gemeinsam:** Eine Sichtung am 2026-08-10 hat beide Tickets auf denselben Runbook-Block und
dasselbe Skript zurückgeführt — T003180 auf den Argumentparser, T003074 auf die
Kandidatenauswahl. Getrennt gelöst würde zweimal dieselbe Entscheidung über die CLI-Form
getroffen, und die zweite müsste die erste revidieren: ein ticketloser `--dry-run` (T003180) ist
ohne eine Kandidatenauswahl, die ohne Ticket-ID arbeitet (T003074), gar nicht implementierbar. Es
ist ein Defekt mit zwei Symptomen.

## What

Ein ticketloser **Sweep-Modus** für `scripts/branch-reaper.sh`, der über alle Remote-Heads läuft
und je Branch `REAP`/`KEEP` mit Begründung ausgibt — die Variante, die den Runbook-Text einlöst
(Auflösung (b) aus T003074).

Die CLI-Form, die beide Tickets zugleich bedient:

| Aufruf | Verhalten |
|---|---|
| `--ticket T###### [--dry-run]` | Einzel-Ticket-Modus, **unverändert** — der Post-Merge-Pfad |
| `--dry-run` (ohne `--ticket`) | Sweep über alle Remote-Heads, rein lesend |
| `--sweep [--dry-run]` | Sweep ausdrücklich; ohne `--dry-run` löschend |
| ohne Argumente | Exit ≠ 0, kein Lauf |

Zwei Eigenschaften tragen die Sicherheit dieser Form:

- **Lesend ist ticketlos frei, schreibend nicht.** `--dry-run` schreibt per Definition nichts —
  es entsteht kein Archiv-Tag, es wird kein Ref angefasst. Ein ticketloser Lauf, der **löscht**,
  verlangt dagegen das ausdrückliche `--sweep`; ein blosses `branch-reaper.sh` ohne Argumente
  bleibt abgelehnt, damit ein versehentlicher Aufruf nie ein Massenlöschen wird.
- **Die Ticket-ID wird im Sweep je Branch aus dem Branch-Namen aufgelöst**, nicht aus einer
  einzigen CLI-ID. Kriterium 3 (Ticket-Status `done`/`archived`) bleibt damit auch im Sweep
  wirksam. Ein Branch ohne `T######` im Namen ist nicht zuordenbar → `KEEP`; nicht prüfbar heisst
  verschonen, nicht durchwinken.

Die vier Löschkriterien selbst, die Allowlist und das Archiv-Tag-Sicherheitsnetz bleiben
unangetastet. Der Ausgabevertrag (`REAP <branch>` / `KEEP <branch> — <grund>`), auf den
`tests/spec/ci-cd/branch-reaper.bats` zugreift, bleibt gültig.

Ausserdem wird §2 des Runbooks auf das korrigierte Werkzeug umgeschrieben — inklusive des
Platzhalters `T00XXXX`, der die oben beschriebene Leere-Antwort-Falle erzeugt.

## Mitgelöste Vorgänge

- **T003180** (führend) — `--dry-run` ohne `--ticket` nicht aufrufbar.
- **T003074** (mitgelöst) — Kandidatenauswahl filtert hart auf eine Ticket-ID. Kein eigener
  Vorgang; das Ticket ist mit `relates_to` an T003180 verknüpft.

## Abgrenzung

**T003182** (branch-reaper meldet `DELETED`, löscht aber nur den Remote-Ref) ist **bereits
geplant und gestagt** auf Branch `fix/branch-reaper-local-ref-T003182`. Jenes Ticket fasst die
Löschschleife **ab Zeile 189** (`for branch in "${REAP_LIST[@]}"` — Archiv-Tag-Push, Delete,
`DELETED`-Meldung).

Dieser Vorgang endet **vor** dieser Schleife: geändert werden ausschliesslich der Argumentparser
(`:54-79`) und die Kandidatenauswahl (`:118-130`). Die Löschschleife wird **nicht angefasst** —
damit können sich die beiden Vorgänge beim Merge nicht überschreiben. Wer diesen Plan ausführt und
die Schleife dennoch anfassen möchte, stoppt stattdessen und stimmt sich mit T003182 ab.
