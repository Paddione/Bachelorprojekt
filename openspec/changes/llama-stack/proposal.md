---
title: "EPIC: Lokaler llama.cpp-Stack — Speichersicherheit, Modell-Routing und Harness-Integration"
domains: [scripts, agents]
ticket_id: T002459
status: active
---

# Lokaler llama.cpp-Stack

**Ticket:** T002459

## Zerlegung in Kinder-Tickets

### A1 — Speichersicherheit
`start-gemma-server.sh` auf `-fit on` + `-fitt` + `-fitc` umstellen (von B2),
Koexistenz beider Modelle auf einer GPU über `-fitt`-Margen auslegen,
reduzierte Kontextgröße sichtbar melden.

### A2 — Modell-Routing (Politik)
gpt-oss 20b → schwere Factory-Tickets (ein Slot, maximaler Kontext),
Gemma 4 12B → leichte Aufgaben (mehrere Slots).
Routing-Politik versionieren (bisher nur DB-seitig hinterlegt).

### A3 — Gemma-Konfiguration
Sliding-Window/Context-Shift-Verhalten klären und konfigurieren,
`q4_0`-KV-Messung dokumentieren (bereits gemessen: -3,6% Durchsatz).

### A4 — Werkzeug- und Rechtezuordnung je Harness
Pro Aufgabe tatsächlich benötigte Werkzeuge zuweisen,
unterschiedliche Zugriffsmodelle der Harnesses (Claude Code, opencode, agy) behandeln.

### A5 — MCP-Klärung (OFFEN)
Was „nützliche MCP-Server in den llama-Stack migrieren" konkret bezweckt —
llama-WebUI aufwerten oder etwas anderes. Vor Ticket-Erstellung zu klären.
