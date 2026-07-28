# Proposal: spec-test-selection

## Why

`task test:changed` ist das verpflichtende Gate vor jedem PR. Für Änderungen unter
`scripts/**` läuft die spec-Suite nicht — aus zwei unabhängigen Gründen.

Erstens setzt der Taskfile `RUN_SPEC` nur bei Diffs unter `tests/spec/` oder
`scripts/llm-proxy/`. Eine Änderung an `scripts/factory/queue.sh` setzt `RUN_SCRIPTS` und
`RUN_FACTORY`; `RUN_FACTORY` fährt `tests/local/FA-SF-*.bats`, nicht
`tests/spec/software-factory.bats`.

Zweitens könnte der spec-Finder `scripts/**` ohnehin nicht präzise auflösen: Sein
`scripts/*`-Zweig versucht einen Namensabgleich und setzt bei Fehlschlag `RUN_ALL=true`
gefolgt von `continue` — womit er über die Pfad-Probe hinwegspringt, die den geänderten Pfad
in den spec-Dateien greppt und den tiefsten Treffer wählt.

Gemessen am 2026-07-28: `scripts/factory/queue.sh` liefert 138 Suiten (~10–20 min Laufzeit),
während die Pfad-Probe genau `tests/spec/software-factory.bats` geliefert hätte.

Zusammen ergibt das ein False-Green. Bei T002333 lag der absichernde Test nur deshalb im
Lauf, weil dieselbe Änderung zufällig auch die Testdatei anfasste. Ein Gate, das man
unbemerkt umgehen kann, ist schlechter als kein Gate, weil es Vertrauen erzeugt.

T002336 hat `scripts/llm-proxy/` punktuell in die Regex aufgenommen — ein Pflaster für einen
Fall. Jede der 138 Suiten hat dieselbe Lücke, solange ihr Prüfgegenstand außerhalb von
`tests/spec/` liegt.

## What

Zwei zusammengehörige Änderungen, in dieser Reihenfolge:

1. `scripts/find-changed-tests.sh`: Der `scripts/*`-Zweig fällt bei fehlgeschlagenem
   Namensabgleich zur Pfad-Probe durch, statt sofort auf `RUN_ALL` zu gehen. `RUN_ALL` bleibt
   Fallback, greift aber erst, wenn Namensabgleich **und** Probe leer bleiben.
2. `Taskfile.yml`: `RUN_SPEC` wird auch für `scripts/**` gesetzt, damit der Finder überhaupt
   konsultiert wird. Der punktuelle `scripts/llm-proxy/`-Zweig wird dadurch redundant.

Die Reihenfolge ist bindend: Schritt 2 allein würde bei jeder Skript-Änderung `RUN_ALL`
auslösen und `test:changed` faktisch zu `test:all` machen.

Bewusst **kein** generiertes Mapping-Artefakt: Die Ableitung existiert bereits als
Laufzeit-Probe mit Memoisation über `PROBE_CACHE`. Eine committete Map würde dieselbe
Information duplizieren und ein Staleness-Gate benötigen, das die Live-Ableitung nicht hat.

_Ticket: T002345_
