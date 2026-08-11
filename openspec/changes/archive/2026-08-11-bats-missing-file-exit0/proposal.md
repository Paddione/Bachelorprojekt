# Proposal: bats-missing-file-exit0

## Why

Der vendierte bats-Binary meldet eine nicht existierende Testdatei auf stdout,
beendet sich aber mit Exit 0. Wer nur den Exit-Code auswertet (Taskfile-Targets,
CI-Schritte, `scripts/find-changed-tests.sh`-Konsumenten, Agenten-Aufträge), sieht
Grün für eine Verifikation, die nie lief. Ein umbenannter oder verschobener Test
verschwindet damit lautlos aus jeder Prüfung, die ihn namentlich aufruft. Das
ist dieselbe Klasse wie die Positiv-Anker-Pflicht (T002356-M1) und der vaknose
`all()`-Fall (T003109): eine Zusicherung, die bei fehlender Substanz trivial besteht
— hier im Verifikationspfad selbst.

## What

Ein zentraler Wrapper `scripts/lib/run-bats.sh` als dünne Vorbedingungsprüfung
(kein Vendor-Patch an `tests/unit/lib/bats-core/`):

1. Prüft für **jeden** explizit genannten Pfad (Datei oder Verzeichnis), ob er
   existiert. Fehlt einer → Fehlermeldung mit dem Pfad + Exit != 0.
2. Existieren alle → Delegation an `tests/unit/lib/bats-core/bin/bats` mit
   denselben Argumenten, Exit-Status wird propagiert.

Die Aufrufstellen werden NICHT in diesem Change umgestellt (Mess-/Umstell-Pfad
eigenes Follow-up) — der Wrapper wird neu eingeführt und in `test:spec`
als Gate beworben; die namentliche `.bats`-Aufrufe in Taskfile/CI wandern
inkrementell auf den Wrapper. Das Reproduktions-Szenario (fehlende Datei) wird
als BATS-Test gegen den Wrapper abgesichert (Rot/Grün), damit der Guard selbst
nie wieder still verrotten kann.

## Messung

- Reproduktion: `tests/unit/lib/bats-core/bin/bats tests/spec/nicht-da.bats; echo "exit=$?"` → `exit=0` (2026-08-10, Repo-Stand 9055fdb17).
- Gegenprobe Verzeichnis: `bats -r tests/spec/definitiv-nicht-vorhanden-xyz` → `exit=1`.
- 114 Aufrufstellen von `bats-core/bin/bats` im Repo (Taskfile, CI, Skripte) —
  Umstellung auf den Wrapper ist ein eigener, inkrementeller Schritt.

_Ticket: T003278_
