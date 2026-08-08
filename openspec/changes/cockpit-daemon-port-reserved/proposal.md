# Proposal: cockpit-daemon-port-reserved

## Why

Der Cockpit-Daemon war auf Port 49152 voreingestellt, der Runtime-Test auf 49199. Beide liegen im
Bereich **49152–49251**, den Windows/Hyper-V auf WSL2-Hosts reserviert
(`netsh interface ipv4 show excludedportrange protocol=tcp`). Ein `bind()` dort liefert
`EADDRINUSE`, obwohl `ss -ltnp` niemanden zeigt und kein Daemon-Prozess läuft.

Folge: `tests/spec/sdlc-cockpit/daemon-runtime-contract.bats` Test 3 ist auf jedem WSL2-Rechner
reproduzierbar rot, und der Daemon lässt sich dort auch produktiv nicht starten. Das Cockpit ist
Development-only — WSL2 ist damit die Zielumgebung, nicht ein Randfall. Auf dem Linux-CI-Runner ist
der Bereich frei, weshalb CI den Defekt strukturell nicht sehen konnte.

Die im Ticket vermutete Ursache (doppelter `listen()`-Aufruf) ist widerlegt: es existiert genau ein
`serve()`, und ein Sechs-Zeilen-Reproducer ohne Repo-Code zeigt dasselbe Verhalten. Beleg und
Messreihe: `design.md`.

Verstärkt wurde die Fehldiagnose durch die Ausgabe selbst: `server.ts` meldete `listening on …`
**vor** dem `serve()`-Aufruf. Der Daemon behauptete Erfolg, den es nicht gab.

## What

- **Portwechsel auf 39152** (Default) bzw. 39199/39198 (Tests) — geprüft frei vom
  Hyper-V-Ausschluss (ab 49152) und vom lokalen Ephemeral-Range (44620–48715). Betrifft
  `server.ts`, `adapter.js`, `canvas-store.js`, `Taskfile.yml` und die vier
  `tests/spec/sdlc-cockpit/`-Dateien, die einen Port verdrahten.
- **Ehrliche Startmeldung**: `listening` wandert in den `serve()`-Callback und erscheint erst bei
  tatsächlichem Bind.
- **Verständlicher Fehlerfall**: ein `error`-Handler fängt `EADDRINUSE` ab, nennt Port, Ursache und
  Abhilfe und beendet den Prozess mit Exit ≠ 0 — statt eines Unhandled-`error`-Stacktraces.
- **Guard gegen Rückfall**: neuer Test `tests/spec/sdlc-cockpit/daemon-port-binding.bats` prüft,
  dass kein Cockpit-Port im reservierten Block liegt und dass kein Erfolgs-Log ohne Erfolg erscheint.
- **Reparatur einer wirkungslosen Assertion**: `daemon-runtime-contract.bats:132` nutzt
  `! echo … | grep -q`, was `set -e` abschaltet und nie fehlschlagen kann.

_Ticket: T002708_
