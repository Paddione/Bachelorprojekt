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

1. `systemctl --user start` in `cmd_release_hold` um `--no-block` ergänzen. Der Aufruf
   stellt den Job dann nur in die Queue und kehrt sofort zurück.
2. Die Bestätigungszeile `execution_released set to true for ticket <id>` **vor** den
   systemctl-Aufruf ziehen, sodass die Zustandsänderung auch dann bestätigt wird, wenn
   systemd nicht erreichbar ist oder klemmt.
3. Verhaltenstest in `tests/spec/software-factory.bats`, der `kubectl` und `systemctl`
   stubbt und die Oneshot-Semantik nachbildet.

Die Semantik bleibt erhalten: `release-hold` schreibt weiterhin den DB-Kontrollschlüssel
`force-tick-requested`, den der nächste Tick konsumiert und löscht. Der systemctl-Aufruf
ist lediglich ein Beschleuniger, kein Träger der Zustandsänderung — auf seinen Abschluss
zu warten war nie beabsichtigt.

**Nicht Teil dieser Änderung:** die übrigen readiness-schreibenden Subkommandos
(`lastenheft lock`, `set-readiness-flag`). Ein Grep über `scripts/ticket.sh` zeigt genau
einen `systemctl`-Aufruf — sie sind vom Fehlerbild nicht betroffen.

_Ticket: T002366_
