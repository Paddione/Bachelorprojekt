---
title: "scout-llm-fallback erden — Spec"
domains: [scripts, factory]
ticket_id: T002400
status: active
---

## ADDED Requirements

### Requirement: Retrieval-Kontext vor LLM-Aufruf laden

The system SHALL load relevant context documents before calling the LLM, using `find_similar` to retrieve similar tickets and spec chunks.

#### Scenario: Context is loaded before LLM call

- **GIVEN** Das Skript `scripts/factory/scout-llm-fallback.sh` wird aufgerufen, weil die deterministische Scout-Analyse keinen Treffer geliefert hat
- **WHEN** Vor dem LLM-Aufruf werden relevante Kontextdokumente geladen
- **THEN**
  1. `find_similar` (aus `scout.sh`, selbes Verzeichnis) wird mit der Ticket-ID aufgerufen → liefert ähnliche Tickets + OpenSpec-Spec-Chunks
  2. Die Ergebnisse werden als Prompt-Block `[CONTEXT]` formatiert:
     - Ähnliche Tickets (ID, Titel, Status, Kurzbeschreibung)
     - Relevante Spec-Sections (Slug, Section-Title, Text)
  3. Der Prompt wird erst an das LLM gesendet, wenn der Kontext vollständig geladen ist

#### Scenario: Empty context for ticket without predecessors

- **GIVEN** Ein Ticket hat keine ähnlichen Vorgänger
- **WHEN** Der Kontext geladen wird
- **THEN** Ein leerer Kontextblock wird erzeugt (kein Fehler)

#### Scenario: Timeout handling

- **GIVEN** `find_similar`-Timeout (5s)
- **WHEN** Der Timeout tritt ein
- **THEN** Leerer Kontext + WARN-Log werden erzeugt, kein Abbruch

#### Scenario: Prompt contains context block

- **GIVEN** Kontextdaten wurden geladen
- **WHEN** Der LLM-Prompt wird zusammengestellt
- **THEN** Der LLM-Prompt enthält den Kontext als separaten Abschnitt vor der eigentlichen Frage

### Requirement: Optionale Tool-Runde (maximal eine)

The system SHALL allow exactly one tool round: tool calls are executed and the result returned to the model, but a second tool call is silently ignored.

#### Scenario: Tool call is executed

- **GIVEN** Der LLM-Prozessor empfängt eine Antwort mit `tool_calls`
- **WHEN** Im Prompt wurde eine Tool-Liste deklariert (Dateisuche, Spec-Lookup), und das Modell fordert ein Tool auf
- **THEN**
  1. Der Tool-Call wird an `POST /tools` des lokalen llama.cpp gesendet
  2. Das Ergebnis wird als `[TOOL_RESULT]` an das Modell zurückgegeben
  3. Maximal **eine** Tool-Runde (keine Schleife)
  4. Enthält die Antwort erneut `tool_calls` → wird ignoriert, die letzte Antwort ohne Tool-Call wird verwendet

### Non-Goals

- Keine mehrstufige Agentenschleife
- Keine persistenten Tool-Sessions
