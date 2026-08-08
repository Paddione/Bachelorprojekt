---
ticket_id: T002721
plan_ref: openspec/changes/cockpit-daemon-runtime-files/tasks.md
status: active
date: 2026-08-08
---

# Design: Laufzeitdateien des Cockpit-Daemons erst nach dem Bind schreiben

_Ticket: T002721 · Ziel-Spec: `openspec/specs/sdlc-cockpit.md`_

## Symptom (verifiziert, nicht bloß vermutet)

Der Befund entstand bei der Code-Lektüre während T002708 und war im Ticket ausdrücklich als
**nicht verifiziert** markiert. Er ist inzwischen mit einem Reproducer belegt.

Ablauf: Daemon A auf 39152 starten, dann Daemon B auf demselben Port. B scheitert erwartungsgemäß
(seit T002708 mit klarer Meldung und Exit 1) — hat aber vorher den Zustand von A zerstört.

| Messung | Ergebnis |
|---|---|
| PID-Datei nach B's Fehlstart | 988533 → **989518** (B's PID) |
| Prozess 989518 | **tot** |
| Prozess 988533 (Daemon A) | lebt weiter, über die Datei nicht mehr auffindbar |
| Token-Datei | **rotiert** |
| `POST /api/cockpit/ticket-action` mit Token *aus der Datei* | **HTTP 401** |
| dasselbe mit A's echtem Token | HTTP 200 |

Die letzte Zeile ist der eigentliche Schaden: Der dokumentierte Weg an das Token führt über die
0600-Datei. Nach einem Fehlstart liefert dieser Weg ein Geheimnis, das der laufende Daemon nicht
kennt — und die Datei sieht dabei völlig gültig aus. Ebenso zielt das im Dateikopf von `server.ts`
dokumentierte `kill $(cat /tmp/cockpit-daemon.pid)` danach auf einen toten Prozess.

## Ursache

`server.ts` schreibt beide Dateien am Modul-Top-Level, bevor `serve()` bindet:

```typescript
// Write token file with tight permissions BEFORE starting server
writeTokenFile('/tmp/cockpit-daemon.token', token);
fs.writeFileSync('/tmp/cockpit-daemon.pid', String(process.pid));
```

Ein Prozess, der nie ein Socket bekommt, hinterlässt damit trotzdem seine Spuren.

## Die vorhandene Begründung ist nicht im Weg

Der Kommentar „Write token file with tight permissions BEFORE starting server" zielt auf ein
echtes Risiko: kein Request darf bedient werden, bevor das Token auf Platte liegt.

Der `listen`-Callback erfüllt das genauso. Er feuert beim `listening`-Event; Node nimmt
eingehende Verbindungen erst danach an und verarbeitet den ersten Request frühestens im
darauffolgenden Tick. Die Sorge und der Fix schließen sich also nicht aus — die bisherige
Reihenfolge war strenger als nötig und hat sich diese Strenge mit dem beschriebenen Nebeneffekt
erkauft.

## Entscheidung

**Beide Schreibvorgänge wandern in den `listen`-Callback**, direkt neben die Startmeldung, die
aus demselben Grund bereits dorthin gewandert ist (T002708).

**Zusätzlich Cleanup beim Beenden.** Verwaiste Dateien entstehen heute auch ohne zweiten Start:
nach jedem `kill` bleiben PID- und Token-Datei liegen und zeigen auf einen toten Prozess. Für
einen Leser ist das genauso irreführend wie der überschriebene Stand, nur ohne beteiligten
Fehlstart. Der Daemon entfernt seine Laufzeitdateien deshalb bei `SIGINT`, `SIGTERM` und beim
regulären `exit`.

Beim Löschen wird geprüft, dass die PID-Datei die **eigene** PID enthält. Ohne diese Prüfung
könnte ein Prozess die Dateien eines anderen Daemons entfernen — dieselbe Klasse von Fremdeingriff,
die dieses Ticket überhaupt erst auslöst, nur mit umgekehrtem Vorzeichen.

## Notwendige Nebenänderung: konfigurierbarer State-Pfad

Die Pfade `/tmp/cockpit-daemon.{pid,token}` sind fest verdrahtet. Ein Test, der das Cleanup prüft,
würde damit die Dateien eines echten laufenden Entwickler-Daemons löschen — der Test wäre selbst
die Schadensquelle, gegen die er sich richtet.

Deshalb wird das Verzeichnis über `COCKPIT_DAEMON_STATE_DIR` umstellbar (Default `/tmp`, analog zu
`COCKPIT_DAEMON_PORT`). Das ist keine Bequemlichkeit, sondern die Voraussetzung dafür, dass der
Fix überhaupt kollateralfrei prüfbar ist.

## Verworfene Alternativen

- **Preflight-Check auf `/health` vor dem Schreiben**: würde den häufigsten Fall abfangen, aber ein
  Rennen offen lassen (zwei gleichzeitige Starts) und den Fehlerpfad um eine Netzwerkabfrage
  erweitern, die der Bind ohnehin autoritativer beantwortet.
- **Dateinamen um den Port ergänzen** (`cockpit-daemon-39152.pid`): löst den Konflikt zwischen
  Daemons auf *verschiedenen* Ports, nicht den hier gemeldeten Fall — zwei Starts auf demselben
  Port kollidieren weiterhin. Zudem müssten alle Leser die Portkenntnis mitbringen.

## Prüfbarkeit des roten Tests

Der neue Test scheitert im aktuellen Stand am Positiv-Anker, weil `COCKPIT_DAEMON_STATE_DIR` noch
nicht beachtet wird. Er unterscheidet damit noch nicht zwischen „State-Dir fehlt" und „Reihenfolge
falsch". Der Plan enthält deshalb eine Mutationsprobe: State-Dir implementieren, Reihenfolge
bewusst noch nicht ändern, und belegen, dass Test 1 dann **weiterhin** rot ist — an der
eigentlichen Aussage.
