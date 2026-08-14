# agent-skills — Delta-Spec (T005565 review-gate-enforce)

## Purpose

Härtet das Review-Gate im `dev-flow-execute`-Ablauf: Das formale Code-Review
(`requesting-code-review`) wird zum Orchestrator-Gate VOR `gh pr merge --auto`.
Der Implementer-Auftrag endet nach der PR-Erstellung und enthält keine
Auto-Merge-Anforderung mehr — die Gelegenheit, ohne Review zu mergen, wird
entfernt statt die Direktive zu verschärfen (Repo-Lehre aus T002365).

## ADDED Requirements

### Requirement: Review-Gate ist Orchestrator-Gate vor Auto-Merge

Die Skill-Datei `.claude/skills/dev-flow-execute/SKILL.md` SHALL das Code-Review
(`requesting-code-review` bzw. im opencode-Runtime der delegierte Review) als
**Orchestrator-Schritt** verankern, der PFLICHT **vor** der Anforderung von
`gh pr merge --auto --squash` läuft. Der Implementer-Auftrag (Schritt 2) SHALL
keinen `gh pr merge --auto`-Aufruf enthalten; er endet nach der PR-Erstellung
und SHALL das Review-Gate ausdrücklich als Orchestrator-Zuständigkeit nennen.
Der Abschnitt, der `gh pr merge --auto --squash` ausführt, SHALL dasselbe
Review-Gate benennen (der Auto-Merge-Befehl liegt im Code-Review-Gate-Abschnitt,
nicht in einem eigenständigen Implementer-Schritt).

Hintergrund: T005307 — das Review-Gate wurde als passiver Skill-Abschnitt
übersprungen, der Implementer hat PR + Auto-Merge in einem Zug abgesetzt und
PR #4444 wurde bei grüner CI ohne separaten Review gemergt. Dieselbe Lehre wie
T002365: Prompt-Direktiven allein blieben wirkungslos; die Härtung entfernt die
Gelegenheit.

#### Scenario: Der Implementer erstellt den PR ohne Auto-Merge

- **GIVEN** ein Implementer-Subagent hat implementiert, verifiziert und gepusht
- **WHEN** er seinen Auftrag für den PR-Erstellungs-Schritt liest
- **THEN** erstellt er den PR, fordert aber kein `gh pr merge --auto` an
- **AND** sein Auftrag weist ihn an, zurückzumelden und das Review-Gate dem Orchestrator zu überlassen

#### Scenario: Auto-Merge folgt dem Review-Gate

- **GIVEN** ein Implementer hat den PR erstellt und zurückgemeldet
- **WHEN** der Orchestrator das Review-Gate ausführt
- **THEN** ruft er `requesting-code-review` auf und lässt Findings per `SendMessage` an den bereits gespawnten Implementer zurückgehen
- **AND** er setzt `gh pr merge --auto --squash` erst nach dem Review-Approval ab
- **AND** die Ordnungsgarantie bleibt erhalten: Auto-Merge wird vor dem CI-Watch-Loop (Schritt 5.5) angefordert

## MODIFIED Requirements

### Requirement: dev-flow-execute trennt Implementer- und Orchestrator-Zuständigkeit

Die Skill-Datei `.claude/skills/dev-flow-execute/SKILL.md` SHALL die Zuständigkeit für die
CI-Überwachung beim Orchestrator verankern und nicht beim Implementer-Subagenten. Der
Implementer-Auftrag SHALL nach der **PR-Erstellung ohne Auto-Merge-Anforderung** enden und an
den Orchestrator zurückmelden; `gh pr merge --auto` SHALL der Orchestrator erst nach dem
bestandenen Review-Gate (Code-Review-Gate, PFLICHT vor Auto-Merge) anfordern. Schritt 5.5
(`devflow-ci-watch.sh`) SHALL als Orchestrator-Schritt ausgewiesen sein. Bei Exit-Code `3`
oder `4` SHALL der Orchestrator den Konflikt per `SendMessage` an den **bereits gespawnten**
Implementer zurückgeben und keinen zweiten Subagenten für denselben Branch spawnen.

Hintergrund: Ein reines Prompt-Verbot ("keine Hintergrund-Monitore", T001969) blieb über
mehrere Durchläufe wirkungslos. Die Härtung entfernt die Gelegenheit, statt die Direktive
zu verschärfen — dieselbe Lehre gilt für das Review-Gate (T005307): auch eine dokumentierte
Direktive (Schritt 3.8) wurde übersprungen, solange der Implementer Auto-Merge selbst
anfordern konnte.

#### Scenario: Der Implementer endet nach der PR-Erstellung

- **GIVEN** ein Implementer-Subagent hat implementiert, verifiziert, gepusht und den PR erstellt
- **WHEN** er den nächsten Schritt aus `SKILL.md` bestimmt
- **THEN** weist ihn der Implementer-Auftrag an, zu enden und zurückzumelden, ohne Auto-Merge anzufordern
- **AND** die CI-Überwachung und das Review-Gate sind ausdrücklich als Orchestrator-Zuständigkeit markiert

#### Scenario: Ein Rebase-Konflikt geht an denselben Implementer zurück

- **GIVEN** `devflow-ci-watch.sh` beendet sich mit Exit-Code `3` oder `4`
- **WHEN** der Orchestrator den Konflikt auflösen lässt
- **THEN** gibt er ihn per `SendMessage` an den bereits gespawnten Implementer zurück
- **AND** es wird kein zweiter Subagent für denselben Branch gespawnt (Doppel-Push-Risiko
  aus T001408)
