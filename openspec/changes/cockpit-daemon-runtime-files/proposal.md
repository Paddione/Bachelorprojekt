# Proposal: cockpit-daemon-runtime-files

## Why

`server.ts` schreibt Token- und PID-Datei am Modul-Top-Level, also bevor `serve()` gebunden hat.
Ein zweiter Daemon auf einem belegten Port scheitert dadurch zwar sauber, hat aber vorher den
Zustand des **laufenden** Daemons zerstört.

Verifiziert mit Reproducer (Messreihe in `design.md`): nach dem Fehlstart zeigt die PID-Datei auf
einen toten Prozess, und das Token in der Datei liefert gegen den auditierten Write-Endpunkt
**HTTP 401**, während das echte Token 200 liefert. Der dokumentierte Weg an das Token — Lesen der
0600-Datei — führt also ins Leere, und die Datei sieht dabei gültig aus.

Der Befund stammt aus dem Code-Review zu T002708 und war dort ausdrücklich als unverifiziert
markiert. Er ist es jetzt nicht mehr.

## What

- **Beide Schreibvorgänge wandern in den `listen`-Callback** — neben die Startmeldung, die aus
  demselben Grund bereits dorthin gewandert ist (T002708). Die vorhandene Code-Begründung
  („Token vor dem Serverstart schreiben") bleibt erfüllt: der Callback feuert vor der Annahme des
  ersten Requests.
- **Cleanup beim Beenden** (`SIGINT`, `SIGTERM`, `exit`) — entfernt beide Dateien, aber nur, wenn
  die PID-Datei die eigene PID trägt. Beseitigt auch die verwaisten Dateien, die heute nach jedem
  `kill` liegenbleiben.
- **`COCKPIT_DAEMON_STATE_DIR`** (Default `/tmp`) macht das Verzeichnis umstellbar. Ohne das wäre
  der Cleanup-Test selbst die Schadensquelle, gegen die er sich richtet — er würde die Dateien
  eines echten laufenden Daemons löschen.
- **Guard**: `tests/spec/sdlc-cockpit/daemon-runtime-files.bats` prüft ergebnisbasiert, dass ein
  Fehlstart den Zustand unangetastet lässt (inklusive HTTP 200 mit dem Token aus der Datei) und
  dass beim Beenden nichts zurückbleibt.

_Ticket: T002721_
