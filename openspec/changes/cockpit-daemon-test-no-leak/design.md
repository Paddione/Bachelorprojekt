---
ticket_id: T002724
plan_ref: openspec/changes/cockpit-daemon-test-no-leak/tasks.md
status: active
date: 2026-08-08
---

# Design: Der Daemon-Runtime-Test darf keinen Prozess zurücklassen

_Ticket: T002724 · Ziel-Spec: `openspec/specs/sdlc-cockpit.md`_

## Symptom (verifiziert)

Nach jedem Lauf von `tests/spec/sdlc-cockpit/daemon-runtime-contract.bats` lauscht ein
Node-Prozess dauerhaft auf `127.0.0.1:39199`. In dieser Session dreimal unabhängig beobachtet —
zuletzt unmittelbar nach einem Suite-Lauf:

```
LISTEN 0 511 127.0.0.1:39199 users:(("node",pid=4109213,fd=52))
```

Der neue Guard reproduziert es deterministisch: Port vorher frei, Contract-Test laufen lassen,
Port danach belegt.

## Ursache (belegt, nicht vermutet)

Test 3 startet den Daemon per `npx tsx … &` und merkt sich `$!`. `npx tsx` erzeugt eine
**vierstufige** Prozesskette — gemessen mit `ps -eo pid,args`:

```
npm exec tsx …
  └─ sh -c tsx …
       └─ node …/tsx/dist/cli.mjs …
            └─ node --require …/preflight.cjs … server.ts   ← der eigentliche Server
```

`$!` liefert nur die oberste Ebene. Das `kill "$(cat "${PIDFILE}")"` vor der Assertion beendet
damit den Wrapper; der Server bleibt am Leben, hält den Port und antwortet weiter auf `/health`.

Der Kommentar im Test nennt die Datei `daemon.pid` — sie enthält aber nicht die PID des Daemons,
sondern die des npm-Wrappers. Der Name legt eine Bedeutung nahe, die der Inhalt nicht hat.

## Warum das mehr ist als Unordnung

Ein geleakter Daemon **antwortet** auf `/health`. Er lässt damit jeden Positiv-Anker bestehen,
der die Erreichbarkeit prüft — schreibt aber in ein längst gelöschtes `BATS_TEST_TMPDIR`. Bei
T002721 hat genau dieses Bild zeitweise wie ein Implementierungsfehler ausgesehen: der Anker war
grün, die Datei fehlte trotzdem.

Der Leak ist außerdem eine zweite, von T002708 unabhängige Quelle der in T002602 als „flaky"
beschriebenen Rotfärbung: Der nächste Lauf findet den Port belegt. Vor T002708 fiel das nicht
auf, weil 49199 im Hyper-V-Reservierungsbereich lag und der Test auf WSL2 ohnehin immer rot war —
die eine Ursache verdeckte die andere.

## Entscheidung

Drei zusammengehörige Änderungen an Test 3:

1. **Start über `./node_modules/.bin/tsx`** statt `npx tsx`. Verkürzt die Kette; so macht es auch
   der `cockpit:daemon`-Task im Taskfile.
2. **Beenden über die PID, die der Daemon selbst schreibt.** Seit T002721 ist das Verzeichnis über
   `COCKPIT_DAEMON_STATE_DIR` isolierbar — der Test setzt es auf `BATS_TEST_TMPDIR` und liest die
   PID dort. Das adressiert genau den Prozess, um den es geht, statt einen Wrapper.
3. **Beide Enden beenden** (Wrapper und Server), damit auch bei einem Abbruch vor dem Schreiben
   der PID-Datei nichts zurückbleibt.

Punkt 2 hat einen zweiten Nutzen: Bisher schrieb der Test in `/tmp/cockpit-daemon.{pid,token}` und
überschrieb damit den Zustand eines echten Entwickler-Daemons — dieselbe Klasse von Fremdeingriff
wie in T002721, nur vom Test ausgehend.

## Nicht Teil dieser Änderung

- `daemon-port-binding.bats:73` verwendet ebenfalls `npx tsx`, aber im **Vordergrund** mit
  `timeout` und in einem Fall, der bewusst scheitert. Dort bleibt kein Prozess zurück; eine
  Umstellung wäre Kosmetik.
- Die weiteren Vermutungen im Kommentarblock von Test 3 über die Ursachen der „Flakiness"
  (volles `/tmp`, Portkonflikt mit dem CI-Daemon) werden nicht neu bewertet. Sie sind nach
  T002708 und diesem Ticket überholt, aber ihre Richtigstellung ist ein eigener Vorgang.
