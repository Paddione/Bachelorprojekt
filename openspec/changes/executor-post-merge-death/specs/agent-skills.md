## ADDED Requirements

### Requirement: dev-flow-execute delegiert die Post-Merge-Finalisierung an einen frischen Finalizer-Subagenten

Die Skill-Datei `.claude/skills/dev-flow-execute/SKILL.md` SHALL die Schritte 6.4 bis 7.5 (Merge-Wait, Ticket-Abschluss, Plan-Archivierung, Worktree-/Branch-Cleanup, Lock-Release) als Delegation an einen **frischen Finalizer-Subagenten** ausweisen, der nach dem bestandenen Code-Review-Gate (Schritt 3.8) und dem Auto-Merge-Request gespawnt wird. Der Orchestrator SHALL nach dem Auto-Merge-Request enden und die Finalisierung NICHT im eigenen, bereits kontextbelasteten Kontext ausführen. Der Finalizer-Auftrag SHALL ein kompaktes Lagebild enthalten (Ticket-ID, PR-Nummer, Branch, Worktree-Pfad, Plan-Pfad, Resolution) und die T001571-Standing-Direktive (Kontext-Budget: bei Überlauf strukturierten Handoff-Report liefern). Der Finalizer SHALL die Abschluss-Schritte über das idempotente Finalize-Skript ausführen und den Endzustand strukturiert zurückmelden.

Hintergrund: Beim Incident T006284 (PR #4460) starb der Executor nach dem Merge an Kontext-Erschöpfung — Ticket-Closure, Archiv und Cleanup blieben liegen, die Eskalation musste alles manuell nachholen. Ein reines Prompt-Verbot bleibt wirkungslos (Muster T001571, T002365): Die Härtung entfernt die Gelegenheit, statt die Direktive zu verschärfen — die Finalisierung läuft in einem Kontext, der sie per Konstruktion noch tragen kann.

#### Scenario: Der Executor starb — die Finalisierung ist trotzdem nachholbar

- **GIVEN** ein Executor hat nach dem Review-Gate den Auto-Merge angefordert
- **WHEN** die Finalisierung an einen frischen Finalizer-Subagenten delegiert ist
- **THEN** sind Merge-Wait, Ticket-Abschluss, Plan-Archivierung und Cleanup im Finalizer-Auftrag enthalten
- **AND** der Orchestrator endet nach dem Auto-Merge-Request statt die Schritte 6.4–7.5 im eigenen Kontext auszuführen

#### Scenario: Der Finalizer läuft gegen sein Kontext-Budget

- **GIVEN** der Finalizer-Subagent bemerkt Anzeichen von Kontext-Überlauf
- **WHEN** er die T001571-Standing-Direktive befolgt
- **THEN** stoppt er und liefert einen strukturierten Handoff-Report (erledigte Schritte, Zustand, offene Schritte in Reihenfolge)
- **AND** die offenen Schritte sind über das idempotente Finalize-Skript von jeder Session nachholbar

### Requirement: Post-Merge-Finalisierung als idempotente Skript-Einheit

Das Skript `scripts/devflow-post-merge-finalize.sh <ticket-id>` SHALL existieren und die Abschluss-Schritte (PR-Link, Ticket-Status `done` mit korrekter Resolution, `verify:done`-Phase-Event, Plan-Archiv nach `tickets.ticket_plans`, OpenSpec-Archiv inklusive Archiv-PR, Lock-Release, Worktree-Remove, Branch-Delete) als eine deterministische, **idempotente** Einheit ausführen: Bereits erledigte Schritte (Ticket bereits `done`, Plan bereits archiviert, Lock bereits frei, Worktree bereits entfernt) SHALL erkannt und übersprungen werden. Das Skript SHALL einen klaren Exit-Code liefern (0 = alle Schritte erledigt/übersprungen, 1 = Fehler) und ohne Cluster-/DB-Zugriff für den Offline-Modus einen dokumentierten Fehlerpfad haben.

Hintergrund: Die Einzelschritte existieren als separate Skripte; es fehlte die zusammenfassende, aufrufbare und wiederholbare Einheit. Beim Incident T006284 musste die Eskalation die Abschluss-Schritte manuell in mehreren Schritten nachholen — ein idempotentes Finalize-Skript macht denselben Vorgang zu einem Ein-Befehl-Vorgang für Finalizer, Recovery-Sessions und den Factory-Poller.

#### Scenario: Finalize-Skript ist idempotent

- **GIVEN** `scripts/devflow-post-merge-finalize.sh <ticket-id>` wurde bereits einmal erfolgreich ausgeführt
- **WHEN** es erneut ausgeführt wird
- **THEN** überspringt es alle bereits erledigten Schritte
- **AND** beendet sich mit Exit-Code 0

#### Scenario: Finalize-Skript hat dokumentierten Offline-Fehlerpfad

- **GIVEN** eine Umgebung ohne Cluster-/DB-Zugriff (z. B. `TICKET_OFFLINE`-Modus)
- **WHEN** das Finalize-Skript aufgerufen wird
- **THEN** bricht es mit einer klaren Meldung und Exit-Code ungleich 0 ab, statt still falsche Zustände zu melden
