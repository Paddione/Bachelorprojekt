# Proposal: zielfamilien-audit

## Why

T002583 belegt: Von zwei geprüften Zielen der LLM-Stack-Familie ist keins funktionsfähig —
`G-LLM01` liefert seit Einführung nie eine Zahl (Iteration über Objekt statt Liste →
`AttributeError` → SKIP), `G-LLM02` meldet vakuos grün (zählt `providers`, real existiert nur
`degraded`; 2 von 3 Providern tot, Ampel grün). Beim Schwesterticket T002443 fiel zusätzlich
`G-WT02` als vakuos grün auf. Damit sind drei Ziele aus zwei Familien auf derselben Fehlerklasse
kaputt — der Grundsatzverdacht: die Fehlerklasse T002356-M1 (fehlende Grundlage erzeugt Nullwert,
Nullwert gilt als Erfolg) könnte sich durch alle Zielfamilien ziehen, ohne dass es jemand merkt,
weil das Zielsystem selbst kein Signal für "dieses Ziel misst nichts" hat.

Die Behebung der bekannten Fälle läuft in T002442 (`G-LLM*`) und T002443 (`G-WT*`). Dieser
Vorgang macht daraus den **systematischen Durchgang durch alle übrigen Zielfamilien**: ein
wiederholbarer Audit-Mechanismus, der jede Ziel-Messung gegen die Fehlerklassen prüft, die
betroffenen Ziele nach dem T002442-Muster schärft (Positiv-Anker, n/a statt 0) und das Ergebnis
als committed Audit-Protokoll + BATS-Fixture-Suite dauerhaft sichert.

## What

1. **Audit-Runner** `scripts/lib/zielfamilien-audit.sh`: prüft pro Zielfamilie die Mess-Befehle
   aus `scripts/health-goals-check.sh` gegen Fixture-Daten auf die vier Fehlerklassen
   (M1-Nullwert, SKIP-forever, Filter auf nicht-existenten Schlüssel, Text im arithmetischen
   Vergleich) plus Existenz-Anker-Regel (Messpfad/Endpunkt ohne Verifikation → `0` → grün).
2. **Audit-Ausführung** über alle Familien (außer `G-LLM*`/`G-WT*`, die T002442/T002443
   übernehmen): jede Ziel-Messung mit realen Antworten abgeglichen, nicht nur Code-Lektüre.
3. **Nur fehlerhafte Ziele schärfen** (Patrick-Entscheid): betroffene Ziele bekommen
   Positiv-Anker + echte Messung nach dem T002442-Muster; grüne Ziele bleiben unangetastet,
   erhalten aber Fixture-Regressionsschutz.
4. **Committed Audit-Protokoll** `docs/health-goals/zielfamilien-audit.md`: Befund-Tabelle je
   Familie (geprüft / Fehlerklasse / Maßnahme / Status), Ticket T002584 verlinkt darauf.
5. **BATS-Fixture-Suite** `tests/spec/health-goals/zielfamilien-audit.bats` als permanenter
   Guard: SKIP-forever und vakuos-grün müssen den Test rot machen (Command-Output-Verifikation,
   T002448-M4). Kein Meta-Ziel in goals.md (Patrick-Entscheid).
6. **Kein CI-Eingriff**: Messort bleibt lokal (wie T002442); die Suite läuft im Test-Pfad.

Abgrenzung: `G-LLM*` (T002442) und `G-WT*` (T002443) sind explizit ausgeschlossen — sie
bearbeiten dieselben Dateien; der Audit übernimmt deren Muster, nicht deren Familien.

_Ticket: T002584_
