# Proposal: Review-Gate als Orchestrator-Gate vor Auto-Merge (T005565)

## Why

T005307: Das formale Review-Gate (Schritt 3.8, `requesting-code-review` als unabhängige
Prüfung) wurde nicht als separater Schritt ausgeführt — der Implementer-Subagent hat
implementiert, verifiziert und direkt den PR mit Auto-Merge erstellt; der Merge (PR #4444)
erfolgte bei vollständig grüner CI. Ersatz-Evidenz: CI vollständig grün, Orchestrator-
Verifikation (Phase-Chain-Gate OK, Merge-Verifikation).

Ursachen-Verifikation (T002448-M5, Symptom vs. Hypothese):

- **Symptom (Fakt):** Review-Gate nicht ausgeführt, PR bei grüner CI ohne separaten Review
  gemergt.
- **Ursache (mit Quelltext belegt):** Der Implementer-Auftrag in
  `.claude/skills/dev-flow-execute/SKILL.md` (Schritt 2, Zeile 87) enthält PR-Erstellung UND
  `gh pr merge --auto` in einem Zug und erwähnt das Review-Gate mit keinem Wort. Schritt 3.8
  existiert nur als passiver Skill-Abschnitt zwischen Verifikation und PR — ohne Eigentümer,
  ohne Evidenz, ohne Durchsetzungspunkt. Die Orchestrator-Gates (Schritt 5.5 CI-Watch, Schritt 6
  Phase-Chain) prüfen CI und Phasen-Kette, aber kein Review. Die Gelegenheit, ohne Review zu
  mergen, existiert konstruktiv.

Die Repo-eigene Lehre aus `openspec/specs/agent-skills.md` (Requirement
"dev-flow-execute trennt Implementer- und Orchestrator-Zuständigkeit", Hintergrund-Notiz):
"Ein reines Prompt-Verbot blieb über mehrere Durchläufe wirkungslos. Die Härtung entfernt die
Gelegenheit, statt die Direktive zu verschärfen." Schritt 3.8 WAR bereits eine dokumentierte
Direktive und wurde übersprungen — die Härtung muss die Gelegenheit entfernen.

## What Changes

- `.claude/skills/dev-flow-execute/SKILL.md`:
  - Schritt 2 (Implementer-Mandat): endet nach PR-Erstellung, OHNE Auto-Merge-Anforderung;
    `gh pr merge --auto` ist explizit Orchestrator-Aufgabe nach dem Review-Gate.
  - Schritt 3.8: wird zum Orchestrator-Schritt "Code-Review-Gate (PFLICHT vor Auto-Merge)";
    `gh pr merge --auto --squash` wandert von Schritt 5 hierher; Findings gehen per
    `SendMessage` an den bereits gespawnten Implementer zurück (Muster Exit 3/4 aus T002365).
  - Schritt 5: Auto-Merge-Block entfernt, M1-Lesson (T001899) an den neuen Ort verwiesen.
  - Schritt 5.5: "Auto-Merge ist bereits angefordert (Schritt 5)" → angefordert nach dem
    Review-Gate (Schritt 3.8).
- Follow-up (nicht in diesem Fix — Lane-Begrenzung T005565): `.opencode/skills/opencode-flow-execute/SKILL.md`
  — Schritt 4 (Code Review Gate) als PFLICHT-Schritt vor Schritt 6 (Auto-Merge) verankern;
  "Auto-Merge ist bereits angefordert (Schritt 5)" in Schritt 5.5 korrigieren. Gleicher
  Fehlermodus wie der Claude-Code-Pfad; wird als eigenes Ticket nachgezogen, bis dahin gilt die
  Mishap-Klasse im opencode-Runtime als bekannt offen.
- `tests/spec/ci-cd.bats` (T002272-M2): Scan-Anker von "## Schritt 5" auf das
  Code-Review-Gate umstellen; Titel/Semantik an die neue Ordnung anpassen
  (Ordnungsgarantie "Auto-Merge vor CI-Watch" bleibt erhalten).
- Neu: `tests/spec/agent-skills/review-gate-before-auto-merge.bats` — failing Test (Rot-Grün),
  Source-Grep-Modus (dokumentierte Ausnahme, T002448-M4).

## Capabilities

### New Capabilities
- `review-gate-enforced`: Auto-Merge ist ohne vorheriges Review-Gate (Orchestrator) nicht
  anforderbar; Implementer-Mandat enthält kein `gh pr merge --auto`.

### Modified Capabilities
- `agent-skills.md` Requirement "dev-flow-execute trennt Implementer- und
  Orchestrator-Zuständigkeit": Implementer-Auftrag endet nach PR-Erstellung (statt nach
  `gh pr merge --auto`); Auto-Merge wird vom Orchestrator nach dem Review-Gate angefordert.

## Impact

- `.claude/skills/dev-flow-execute/SKILL.md` — Abschnitte 2, 3.8, 5, 5.5
- `.opencode/skills/opencode-flow-execute/SKILL.md` — Follow-up (bekannt offen, eigenes Ticket)
- `tests/spec/ci-cd.bats` — Test T002272-M2 (Anker/Semantik)
- `tests/spec/agent-skills/review-gate-before-auto-merge.bats` — neu (failing Test)
- `openspec/specs/agent-skills.md` — via Delta (ADDED + MODIFIED), Archivierung übernimmt es
- Nicht im Scope: Factory-Pipeline (`pipeline.js`) — betrifft nur den interaktiven
  dev-flow-execute-Pfad; kein GitHub Branch-Protection (zu invasiv, wäre Infra-Entscheidung)
