# brain-k7-agenten-mcp

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu brain-k7-agenten-mcp ergänzen._

## Requirements

### Requirement: Drei-Ebenen-Diagramm mit beschrifteten Kanten (REQ-k7-01)

Die Dokumentation der Agenten- und MCP-Harness-Ebene MUSS SSOT-Registry, generierte
Configs und laufende Prozesse als getrennte Ebenen darstellen und an jeder Kante
vermerken, ob sie zum Erhebungszeitpunkt trägt.

#### Scenario: Das Diagramm trennt die drei Ebenen

- **GIVEN** die K7-Dokumentation unter `docs/brain/k7-agenten-mcp.md`
- **WHEN** ein Leser das Diagramm betrachtet
- **THEN** sind die Ebenen SSOT-Registry, generierte Configs und laufende Prozesse
  als getrennte Blöcke erkennbar
- **AND** jede Kante trägt eine Beschriftung mit Transport und Trage-Status

### Requirement: Erhebung von Registry, Renderern und Listenern (REQ-k7-02)

Die Dokumentation MUSS für jeden in `docs/agent-guide/registry/mcp.yaml` geführten
MCP-Server Transport, Endpunkt und gemessenen Listener-Status ausweisen, und die
Rollen- und Runtime-Einträge aus `agents.yaml` erfassen.

#### Scenario: Jeder Registry-Eintrag erscheint mit Messergebnis

- **GIVEN** die Registry führt einen MCP-Server
- **WHEN** die K7-Erhebungstabelle gelesen wird
- **THEN** stehen dort Transport, Endpunkt bzw. Bridge-URL und der gemessene Status
- **AND** nicht messbare Punkte sind ausdrücklich als "unklar" gekennzeichnet

### Requirement: Defekt-Referenz gegen T002430 (REQ-k7-03)

Die Dokumentation MUSS die für K7 einschlägigen Defekte des Epics T002430 (D4–D9)
sowie Befund B3 aus T002398 mit Stand der Vorerhebung, heutiger Messung und
Bewertung gegenüberstellen.

#### Scenario: Jeder einschlägige Defekt wird neu bewertet

- **GIVEN** ein Defekt D4–D9 aus T002430 betrifft die Agenten- oder MCP-Ebene
- **WHEN** die Defekt-Referenz gelesen wird
- **THEN** stehen dort Vorbefund, heutige Messung und eine Bewertung
  (behoben, teilweise behoben, offen oder unklar)

### Requirement: Silent-Failure-Pfade (REQ-k7-04)

Die Dokumentation MUSS die Pfade benennen, auf denen ein Bruch zwischen Registry,
generierter Config und laufendem Prozess ohne Fehlermeldung folgenlos bleibt.

#### Scenario: Ungeprüfte Kanten sind ausgewiesen

- **GIVEN** eine generierte Config wird von `task mcp:check` nicht auf Drift geprüft
- **WHEN** die Silent-Failure-Tabelle gelesen wird
- **THEN** ist diese Kante dort mit dem Verhalten bei Bruch beschrieben

<!-- merged from change delta brain-k7-agenten-mcp.md (9cffedbf62d7) -->