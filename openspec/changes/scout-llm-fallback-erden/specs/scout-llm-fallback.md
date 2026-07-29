---
title: "scout-llm-fallback erden — Spec"
domains: [scripts, factory]
ticket_id: T002400
status: active
---

# scout-llm-fallback erden — Spec

## Stufe 1 — Retrieval-Kontext

### GIVEN
Das Skript `scripts/factory/scout-llm-fallback.sh` wird aufgerufen, weil die
deterministische Scout-Analyse keinen Treffer geliefert hat.

### WHEN
Vor dem LLM-Aufruf werden relevante Kontextdokumente geladen.

### THEN
1. `find_similar` (aus `scout.sh`, selbes Verzeichnis) wird mit der Ticket-ID
   aufgerufen → liefert ähnliche Tickets + OpenSpec-Spec-Chunks
2. Die Ergebnisse werden als Prompt-Block `[CONTEXT]` formatiert:
   - Ähnliche Tickets (ID, Titel, Status, Kurzbeschreibung)
   - Relevante Spec-Sections (Slug, Section-Title, Text)
3. Der Prompt wird erst an das LLM gesendet, wenn der Kontext vollständig geladen ist

### Acceptance
- Ein Ticket ohne ähnliche Vorgänger erzeugt einen leeren Kontextblock (kein Fehler)
- `find_similar`-Timeout (5s) führt zu leerem Kontext + WARN-Log, nicht zu Abbruch
- Der LLM-Prompt enthält den Kontext als separaten Abschnitt vor der eigentlichen Frage

## Stufe 2 — Optionale Tool-Runde (Decke)

### GIVEN
Der LLM-Prozessor empfängt eine Antwort mit `tool_calls`.

### WHEN
Im Prompt wurde eine Tool-Liste deklariert (Dateisuche, Spec-Lookup), und das Modell
fordert ein Tool auf.

### THEN
1. Der Tool-Call wird an `POST /tools` des lokalen llama.cpp gesendet
2. Das Ergebnis wird als `[TOOL_RESULT]` an das Modell zurückgegeben
3. Maximal **eine** Tool-Runde (keine Schleife)
4. Enthält die Antwort erneut `tool_calls` → wird ignoriert, die letzte Antwort ohne
   Tool-Call wird verwendet

### Non-Goals
- Keine mehrstufige Agentenschleife
- Keine persistenten Tool-Sessions
