# openspec-workflow — Delta-Spec (T002573)

## Purpose

Definiert das deterministische Bewertungsverfahren fuer `.ticket`-lose OpenSpec-Changes
(aus T002569 ausgegliedert): Abschlussstatus ist maschinell nicht direkt bestimmbar, daher
wird jeder Change gegen referenzierte Tickets und Archiv-Gegenstuecke bewertet.

## ADDED Requirements

### Requirement: .ticket-lose Changes werden deterministisch bewertet

Ein OpenSpec-Change ohne `.ticket`-Datei SHALL nach einem deterministischen Verfahren bewertet
werden: (1) `.ticket`-Existenz pruefen, (2) Archiv-Gegenstueck pruefen (obsoletes Duplikat →
Live-Verzeichnis entfernen, kein Doppel-Archiv), (3) referenzierte Tickets extrahieren
(`grep -rhoE 'T[0-9]{6}'`), (4) Ticket-Status pruefen (alle `done`/`archived` → abgeschlossen,
sonst offen), (5) tasks.md-Status als Zusatzsignal. Ergebnis je Change wird in einem
Bewertungsprotokoll (`evaluation.md`) mit Begruendung festgehalten.

#### Scenario: Change referenziert nur terminale Tickets

- **GIVEN** ein Change ohne `.ticket`-Datei, dessen Inhalt ausschliesslich Tickets mit Status
  `done` oder `archived` referenziert
- **WHEN** das Bewertungsverfahren angewendet wird
- **THEN** wird der Change als `abgeschlossen` klassifiziert und archiviert

#### Scenario: Change referenziert kein Ticket

- **GIVEN** ein Change ohne `.ticket`-Datei und ohne Ticket-Referenz im Inhalt
- **WHEN** das Bewertungsverfahren angewendet wird
- **THEN** wird der Change als `offen` mit begruendetem Vermerk belassen, da der Abschluss
  maschinell nicht belegbar ist

#### Scenario: Change hat ein Archiv-Gegenstueck

- **GIVEN** ein Change ohne `.ticket`-Datei, fuer den bereits ein Archiv-Gegenstueck unter
  `openspec/changes/archive/<slug>/` existiert
- **WHEN** das Bewertungsverfahren angewendet wird
- **THEN** wird das Live-Verzeichnis entfernt (kein erneutes `openspec.sh archive`, das ein
  Doppel-Archiv erzeugen wuerde)
