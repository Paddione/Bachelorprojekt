# Proposal: factory-attempt-counter-T002389

## Why

Der Attempt-Zähler aus T002361 zählt jede erfolglose Watchdog-Runde gleich — unabhängig ob Modell-Versagen oder Infrastruktur-Abbruch (Server tot, API-Timeout, fehlender Key). Mit der Eskalationsleiter aus T002369 verbrennt ein toter Server drei Sprossen (flash→haiku→sonnet→unfactory), ohne dass je ein Modell einen echten Versuch hatte.

## What

Der Zähler unterscheidet zwei Klassen:
- **Modell-Versagen**: Pipeline lief, Phase-Event geschrieben, Ergebnis unbrauchbar → zählt hoch
- **Infrastruktur-Abbruch**: kein Phase-Event, Spawn fehlgeschlagen, Provider nicht erreichbar → zählt nicht hoch, gleiche Sprosse wiederholen

_Ticket: T002389_
