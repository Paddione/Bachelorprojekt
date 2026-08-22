# Proposal: dev-flow-lifecycle-contract

## Why

Die vier `dev-flow-*`-Skills beschreiben denselben Git- und Ticket-Lifecycle derzeit mit
teilweise duplizierten, teilweise widersprüchlichen Regeln. Besonders `dev-flow-execute`
mischt Implementer-, Orchestrator- und Finalizer-Zuständigkeiten in einer nicht linearen
Schrittfolge; der Phase-Chain-Guard steht textlich nach der Auto-Merge-Anforderung.
`dev-flow-e2e` eröffnet für reine Teständerungen einen `feature/*`-Lifecycle, während
`dev-flow-chore` dieselbe Dateiklasse als test-only Chore behandelt. Dadurch muss ein Agent
aus mehreren Skills rekonstruieren, welcher Übergang und welcher Owner tatsächlich gilt.

## What

- Einen gemeinsamen Lifecycle- und Rollenvertrag als Referenz für Plan, Execute, E2E und
  Chore einführen; jeder Skill behält nur seine Entscheidungen, Inputs, Outputs und Gates.
- `dev-flow-execute` als Swimlane ordnen: Implementer erstellt den PR, Orchestrator prüft
  Review und Phase-Chain vor Auto-Merge, CI-Fehler gehen an denselben Implementer zurück,
  ein frischer Finalizer wartet auf den Merge und führt den idempotenten Abschluss aus.
- `dev-flow-e2e` als spezialisierte test-only Chore ausweisen: Playwright-Erkundung und
  Live-Verifikation bleiben dort, Branch/PR/Cleanup folgen dem Chore-/Git-Vertrag.
- Wiederholte Incident-Erklärungen, Framework-Aufrufe und Befehlsmechanik in bestehende
  Referenzen verschieben, ohne maschinengeprüfte Sicherheitsanker zu entfernen.
- Cross-Skill-Guards ergänzen, die Übergänge, Rollen, Branch-Typen und Gate-Reihenfolge als
  zusammenhängenden Vertrag prüfen.

_Ticket: T013482_
