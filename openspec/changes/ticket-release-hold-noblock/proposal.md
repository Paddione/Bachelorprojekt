# Proposal: ticket-release-hold-noblock

## Why

`scripts/ticket.sh release-hold` gibt ein per `stage-plan --hold` zurückgehaltenes Ticket
für den Factory-Dispatch frei. Das Kommando kehrt jedoch minutenlang nicht zurück und gibt
dabei keinerlei Ausgabe aus — reproduzierbar über mehrere Tickets hinweg (T002350, T002349).

Ursache ist nicht die Datenbank, sondern der letzte Aufruf des Kommandos:

```bash
systemctl --user start factory.service 2>/dev/null || true
```

`factory.service` ist `Type=oneshot` mit `RuntimeMaxSec=3600` und `TimeoutStartSec=3660`.
Ein `systemctl start` auf einen bereits laufenden Oneshot-Job hängt sich an dessen Job an
und wartet auf dessen Abschluss — im Extremfall 61 Minuten. Läuft gerade ein Factory-Tick,
blockiert `release-hold` also genau so lange wie dieser Tick.

Zwei Details machen daraus einen stillen Hang statt einer Fehlermeldung:
`2>/dev/null || true` verschluckt jede Ausgabe, und die Bestätigungszeile steht **hinter**
dem systemctl-Aufruf. Der Aufrufer sieht deshalb weder Erfolg noch Fehler.

Der DB-Write ist zu diesem Zeitpunkt bereits durch — `readiness.execution_released` wird
sehr wohl auf `true` gesetzt. Der ursprüngliche Ticketbefund, das Flag bliebe `false`
stehen, trifft nicht zu; die Auswirkung ist ein blockierter Operator, kein verlorener
Zustand.

## What

1. `systemctl --user start` um `--no-block` ergänzen — an **beiden** Fundstellen:
   `cmd_release_hold` in `scripts/ticket.sh` (Zeile 327) und der Auto-Tick-Wake in
   `scripts/vda/ticket/stage-plan.sh` (Zeile 85, Nicht-`--hold`-Zweig). Der Aufruf stellt
   den Job dann nur in die Queue und kehrt sofort zurück.
2. Die jeweilige Bestätigungszeile **vor** den systemctl-Aufruf ziehen, sodass die
   Zustandsänderung auch dann bestätigt wird, wenn systemd nicht erreichbar ist oder klemmt.
3. Verhaltenstest in `tests/spec/software-factory.bats`, der `kubectl` und `systemctl`
   stubbt und die Oneshot-Semantik nachbildet, plus ein Klassen-Guard über
   `scripts/ticket.sh` und `scripts/vda/ticket/`.

Die zweite Fundstelle erklärt zugleich einen bisher separat geführten Befund:
`stage-plan` hängt ebenfalls >120 s ohne Ausgabe, während der Write durchgeht. Gleiches
Symptom, gleiche Wurzel. Der Kommentar an dieser Stelle (Zeile 69–70) bezeichnet den
Weck-Aufruf ausdrücklich als best-effort und non-fatal — ein blockierendes
`systemctl start` widerspricht dieser Absicht bereits im geschriebenen Code.

Die Semantik bleibt erhalten: `release-hold` schreibt weiterhin den DB-Kontrollschlüssel
`force-tick-requested`, den der nächste Tick konsumiert und löscht. Der systemctl-Aufruf
ist lediglich ein Beschleuniger, kein Träger der Zustandsänderung — auf seinen Abschluss
zu warten war nie beabsichtigt.

**Nicht Teil dieser Änderung:** die übrigen readiness-schreibenden Subkommandos
(`lastenheft lock`, `set-readiness-flag`) rufen kein `systemctl` auf und sind vom
Fehlerbild nicht betroffen. Ebenso `scripts/terminal-sidekick-host.sh:101` — das dortige
ttyd-Unit ist kein `oneshot`, und bei `Type=simple` kehrt `systemctl start` nach dem Fork
sofort zurück.

_Ticket: T002366_
