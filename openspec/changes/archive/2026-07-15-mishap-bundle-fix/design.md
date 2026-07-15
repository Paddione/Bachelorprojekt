## Context

Dieses Bundle fasst drei Prozess-Frictions zusammen, die vom mishap-tracker in separaten Sessions gesammelt wurden. Alle drei betreffen die dev-flow-Toolchain und erschweren die reibungslose Automatisierung von Plan-Ausführung, Session-Koordination und VDA-Skript-Nutzung.

## Goals / Non-Goals

**Goals:**
- Jede der drei Frictions durch gezielte Code/Config-Änderung beheben
- Mishap-Bundle abschließen (T001482 → done)

**Non-Goals:**
- Keine grundlegende Überarbeitung der betroffenen Skills/Systeme
- Kein neues Feature — nur Friction-Beseitigung

## Decisions

Die drei Mishaps werden unabhängig voneinander in separaten Tasks bearbeitet. Jeder Task identifiziert die konkrete Ursache und wendet den minimalen Fix an.

## Risks / Trade-offs

- Ohne konkrete Mishap-Details (Buffer geleert nach Ticket-Erstellung) basieren die Tasks auf den aus dem Ticket-Titel bekannten Bereichen und den aktuellen Code-Ständen der betroffenen Dateien.
