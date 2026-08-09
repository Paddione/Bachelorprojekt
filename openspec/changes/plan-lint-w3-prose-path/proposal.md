# Proposal: plan-lint-w3-prose-path

## Why

`scripts/plan-lint.sh` liest fuer die Regeln **W3** (File-Structure ↔ Tasks
Querpruefung) und **B1a/B1b** (Budget-Integritaet) jeden Backtick-Pfad-Token mit
Quellcode-Endung aus dem gescannten Text — ohne zu pruefen, ob dieser Token in einer
echten Tabellenzeile/einem Listenpunkt steht oder nur in einem Fliesstext-Satz als
Beleg erwaehnt wird. Verifiziert am 2026-08-09 (siehe Ticket T002807): ein Satz wie
"Positiv-Kontrolle: `scripts/agent-lock.sh` gibt ... 265 zurueck" innerhalb des
`## File Structure`-Abschnitts loest eine W3-Warnung aus, obwohl die Datei nirgends
tabellarisch gelistet ist. Dieselbe Verwechslung betrifft B1a/B1b in schaerferer Form —
dort sogar dokumentweit und potenziell als **Hard Fail** (B1a), nicht nur als Warnung.

Die Folge ist unerwuenscht: Autoren lernen, konkrete Datei-Belege in Prosa zu
vermeiden, um die Warnung loszuwerden — das Gegenteil der Konvention, Behauptungen
mit nachpruefbaren, konkreten Angaben zu belegen.

## What

`scripts/plan-lint.sh` bekommt eine gemeinsame Hilfsfunktion, die Pfad-Tokens nur aus
**strukturellen Zeilen** extrahiert — Tabellenzeilen (beginnen mit `|`) oder
Listenpunkte (beginnen mit `-`/`*`). W3 und B1a/B1b werden auf diese Funktion
umgestellt; freie Prosa-Zeilen liefern damit keine Kandidaten mehr, unabhaengig davon,
ob sie einen Backtick-Pfad enthalten.

Design-Details: `docs/superpowers/specs/2026-08-09-plan-lint-w3-prose-path-design.md`.

_Ticket: T002807_
