## MODIFIED Requirements

### Requirement: touched_files enthält real geänderte Dateien

The system SHALL plan-touched-files so betreiben, dass `touched_files` die tatsächlich
im Change geänderten Dateien (Diff gegen Branch-Basis) enthält, vereinigt mit den im
Plan erwähnten Pfaden — ABER nur, wenn der Plan überhaupt ableitbare Repo-Pfade
nennt. Liefert die `## File Structure`-Sektion keinen ableitbaren Pfad (leer oder nur
Nicht-Pfade wie Cluster-Ressourcen), SHALL die Ausgabe leer bleiben und eine Warnung
auf stderr erscheinen, unabhängig davon, ob der aktuelle Branch einen Diff gegen den
Merge-Base trägt.

#### Scenario: Datei geändert, aber nicht erwähnt

- **GIVEN** ein Plan erwähnt Pfad A, der Change ändert aber auch Pfad B
- **WHEN** `touched_files` ermittelt wird
- **THEN** enthält es sowohl A als auch B

#### Scenario: Plan ohne ableitbare Pfade bleibt leer, auch wenn der Branch einen Diff trägt

- **GIVEN** ein Plan mit leerer oder nur Nicht-Pfade enthaltender
  `## File Structure`-Sektion
- **AND** der aktuelle Branch hat Commits gegen den Merge-Base (Diff nicht leer)
- **WHEN** `plan-touched-files.sh` auf einem solchen Branch läuft
- **THEN** ist stdout leer
- **AND** steht auf stderr eine Warnung
- **AND** ist der Exit-Code 0 (blockiert das Staging nicht)
