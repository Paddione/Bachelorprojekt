## ADDED Requirements

### Requirement: dev-flow-execute trennt Implementer- und Orchestrator-Zuständigkeit

Die Skill-Datei `.claude/skills/dev-flow-execute/SKILL.md` SHALL die Zuständigkeit für die
CI-Überwachung beim Orchestrator verankern und nicht beim Implementer-Subagenten. Der
Implementer-Auftrag SHALL nach `gh pr merge --auto` enden und an den Orchestrator
zurückmelden; Schritt 5.5 (`devflow-ci-watch.sh`) SHALL als Orchestrator-Schritt
ausgewiesen sein. Bei Exit-Code `3` oder `4` SHALL der Orchestrator den Konflikt per
`SendMessage` an den **bereits gespawnten** Implementer zurückgeben und keinen zweiten
Subagenten für denselben Branch spawnen.

Hintergrund: Ein reines Prompt-Verbot ("keine Hintergrund-Monitore", T001969) blieb über
mehrere Durchläufe wirkungslos. Die Härtung entfernt die Gelegenheit, statt die Direktive
zu verschärfen.

#### Scenario: Der Implementer endet vor der CI-Überwachung

- **GIVEN** ein Implementer-Subagent hat implementiert, verifiziert, gepusht und
  `gh pr merge --auto` abgesetzt
- **WHEN** er den nächsten Schritt aus `SKILL.md` bestimmt
- **THEN** weist ihn der Implementer-Auftrag an, zu enden und zurückzumelden
- **AND** die CI-Überwachung ist ausdrücklich als Orchestrator-Zuständigkeit markiert

#### Scenario: Ein Rebase-Konflikt geht an denselben Implementer zurück

- **GIVEN** `devflow-ci-watch.sh` beendet sich mit Exit-Code `3` oder `4`
- **WHEN** der Orchestrator den Konflikt auflösen lässt
- **THEN** gibt er ihn per `SendMessage` an den bereits gespawnten Implementer zurück
- **AND** es wird kein zweiter Subagent für denselben Branch gespawnt (Doppel-Push-Risiko
  aus T001408)

### Requirement: Der Implementer entfernt den Worktree nicht

Der Implementer-Auftrag in `.claude/skills/dev-flow-execute/SKILL.md` SHALL explizit
festhalten, dass der Worktree **nicht** vom Implementer entfernt wird. Das Entfernen von
Worktree und Branch SHALL ausschließlich in Schritt 7.5 als Orchestrator-Aufgabe stehen.

Hintergrund: Der Cleanup war zwar als Orchestrator-Schritt dokumentiert, im
Implementer-Auftrag aber gar nicht erwähnt — Implementer entfernten den Worktree trotzdem
und rissen damit die anschließende OpenSpec-Archivierung weg.

#### Scenario: Ein Implementer prüft, ob er aufräumen soll

- **GIVEN** ein Implementer hat seinen PR erstellt und Auto-Merge aktiviert
- **WHEN** er seinen Auftrag auf Cleanup-Anweisungen liest
- **THEN** findet er die ausdrückliche Aussage, dass der Worktree nicht von ihm entfernt wird
- **AND** die Zuordnung zu Schritt 7.5 (Orchestrator) ist benannt

### Requirement: preflight-pr-scope.sh wird mit PR-Titel-Argument dokumentiert

Jede Aufrufstelle von `scripts/preflight-pr-scope.sh` in Skill- und Referenzdateien SHALL
den PR-Titel als erstes Argument zeigen. Das Skript verlangt ihn zwingend als `$1` und
bricht sonst mit einer Usage-Meldung ab.

Hintergrund: Ein argumentloser Beispielaufruf lässt einen Agenten den Fehlschlag als "Gate
nicht anwendbar" lesen und ohne Scope-Prüfung fortfahren.

#### Scenario: Ein Agent kopiert den dokumentierten Aufruf

- **GIVEN** eine Skill- oder Referenzdatei nennt `scripts/preflight-pr-scope.sh`
- **WHEN** ein Agent den dort gezeigten Aufruf übernimmt
- **THEN** enthält dieser den PR-Titel als erstes Argument
- **AND** das Gate läuft, statt mit einer Usage-Meldung abzubrechen
