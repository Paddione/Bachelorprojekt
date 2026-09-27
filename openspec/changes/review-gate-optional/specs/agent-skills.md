# agent-skills — Delta-Spec (T900687 review-gate-optional)

## Purpose

Das Code-Review in `dev-flow-execute` Schritt 3.8 wird optional. Grüne Required Checks plus
Phase-Chain-Assert sind das Merge-Kriterium. Ein Review läuft nur auf ausdrücklichen Zuruf des
Operators. Aktives Auto-Merge (auch vom CI-Workflow „Enable Auto-Merge" gesetzt) wird nicht
deaktiviert und ist kein Abbruchgrund. Anlass: T900655 / PR #6062, Nutzerentscheid 2026-09-27.

## MODIFIED Requirements

### Requirement: dev-flow-execute erkennt extern aktivierten Auto-Merge

Die Skill-Datei `.claude/skills/dev-flow-execute/SKILL.md` SHALL den Auto-Merge-Zustand
des Pull Requests im Merge-Gate (Schritt 3.8) über `scripts/check-pr-automerge.sh --branch "$BRANCH"`
prüfen. Das Skript SHALL den Zustand über
`gh pr view --json number,autoMergeRequest` ermitteln und mit definierten Exit-Codes
beenden: `0` = kein Auto-Merge aktiv (kein PR für den explizit genannten Branch oder
`autoMergeRequest` null), `1` = Auto-Merge aktiv (Meldung nennt die PR-Nummer),
`2` = Umgebungsfehler (gh nicht verfügbar oder technischer gh-Fehler) ODER fehlender
Aufrufkontext. Ein Aufruf OHNE `--pr` und OHNE `--branch` SHALL mit Exit-Code 2
abbrechen und den fehlenden Kontext (`--pr`/`--branch`) in der Fehlermeldung nennen,
statt `gh pr view` gegen den ambient Branch zu proben — es gibt bewusst KEIN
Env-Override für den Kontext (der Kontext ist pro Aufruf zu bestimmen, nicht global).
Bei Exit-Code `1` im Merge-Gate SHALL der Orchestrator NICHT abbrechen und Auto-Merge
NICHT deaktivieren: der Merge läuft bei grünen Required Checks. Bei Exit-Code `2` SHALL
das Merge-Gate als Umgebungsfehler abbrechen. Ein Code-Review SHALL keine
Merge-Voraussetzung sein; es läuft nur, wenn der Operator es in der laufenden Session
ausdrücklich verlangt. Findings eines verlangten Reviews SHALL vor dem Merge per
`SendMessage` an den bereits gespawnten Implementer gehen und nach dem Merge als
Folge-Ticket mit Folge-PR. Die Pre-Flight-Phasen
(`dev-flow-execute-phases.md`, Schritt 1.4.7) SHALL denselben Check mit explizitem
Kontext (`--branch "$BRANCH"`) ausführen;
existiert für den Branch bereits ein PR mit aktivem Auto-Merge, bricht die Session
als Doppel-Execution ab und koordiniert sich, statt die Implementierung zu
duplizieren.

Hintergrund: T006282 führte den Check ein, weil extern aktiviertes Auto-Merge während eines
Reviews mergte. T900655 (PR #6062) zeigte, dass der CI-Workflow „Enable Auto-Merge" Auto-Merge
nach jedem grünen Push wieder aktiviert; ein fail-closed Review-Gate ist so nicht durchhaltbar.
Nutzerentscheid 2026-09-27 (T900687): grüne CI reicht zum Merge. T900043/Befund 2: Der bare
Call in phases.md 1.4.7 fiel auf `main` in die Unsichtbarkeit zurück (PR #5409).

#### Scenario: Barer Aufruf ohne Kontext ist fail-closed

- **GIVEN** das Skript wird ohne `--pr` und ohne `--branch` aufgerufen
- **WHEN** ein beliebiger Branch ausgecheckt ist (einschließlich `main`)
- **THEN** endet es mit Exit-Code 2 und nennt `--pr`/`--branch` als fehlenden Kontext
- **AND** es wird kein `gh pr view` gegen den ambient Branch ausgeführt

#### Scenario: Auto-Merge ist im Merge-Gate bereits aktiv

- **GIVEN** der CI-Workflow, der User oder eine parallele Session hat Auto-Merge auf dem PR aktiviert
- **WHEN** das Merge-Gate (Schritt 3.8) beginnt
- **THEN** prüft der Orchestrator den Auto-Merge-Zustand über `scripts/check-pr-automerge.sh`
- **AND** bei Exit-Code 1 bricht das Gate nicht ab und deaktiviert Auto-Merge nicht
- **AND** der Merge läuft bei grünen Required Checks

#### Scenario: Ohne Zuruf läuft kein Review

- **GIVEN** der Operator hat in der Session kein Code-Review verlangt
- **WHEN** der Orchestrator das Merge-Gate durchläuft
- **THEN** führt er nur den Phase-Chain-Assert und `gh pr merge --auto --squash` aus
- **AND** es wird kein Review-Subagent gestartet

#### Scenario: Ein verlangtes Review liefert Findings nach dem Merge

- **GIVEN** der Operator hat ein Review verlangt und der PR ist bereits gemergt
- **WHEN** das Review Findings liefert
- **THEN** gehen die Findings als Folge-Ticket mit Folge-PR raus
- **AND** Auto-Merge wurde zu keinem Zeitpunkt deaktiviert

#### Scenario: Der Pre-Flight erkennt eine Doppel-Execution mit aktivem Auto-Merge

- **GIVEN** für den Branch existiert bereits ein PR mit aktivem Auto-Merge
- **WHEN** dev-flow-execute den Pre-Flight ausführt
- **THEN** bricht der Pre-Flight mit einer Doppelarbeit-Meldung ab (Exit-Code 1)
- **AND** die Session koordiniert sich statt die Implementierung zu duplizieren

#### Scenario: Kein Auto-Merge ist aktiv

- **GIVEN** der PR hat keinen Auto-Merge (`autoMergeRequest` null) oder es existiert
  kein PR für den explizit genannten Branch
- **WHEN** der Check mit `--pr` oder `--branch` läuft
- **THEN** endet er mit Exit-Code 0 und der Ablauf kann fortfahren

#### Scenario: Ein technischer gh-Fehler ist kein Freibrief

- **GIVEN** `gh` ist nicht verfügbar oder `gh pr view` scheitert aus anderem Grund als
  "kein PR für den Branch"
- **WHEN** der Check läuft
- **THEN** endet er mit Exit-Code 2 und der Aufrufer bricht ab
- **AND** der Zustand wird nicht als "kein Auto-Merge" gelesen

### Requirement: dev-flow-execute delegiert die Post-Merge-Finalisierung an einen frischen Finalizer-Subagenten

Die Skill-Datei `.claude/skills/dev-flow-execute/SKILL.md` SHALL die Schritte 6.4 bis 7.5 (Merge-Wait, Ticket-Abschluss, Plan-Archivierung, Worktree-/Branch-Cleanup, Lock-Release) als Delegation an einen **frischen Finalizer-Subagenten** ausweisen, der nach dem Merge-Gate (Schritt 3.8: Phase-Chain-Assert und Auto-Merge-Request, oder bereits aktives Auto-Merge) gespawnt wird. Der Orchestrator SHALL nach dem Auto-Merge-Request enden und die Finalisierung NICHT im eigenen, bereits kontextbelasteten Kontext ausführen. Der Finalizer-Auftrag SHALL ein kompaktes Lagebild enthalten (Ticket-ID, PR-Nummer, Branch, Worktree-Pfad, Plan-Pfad, Resolution) und die T001571-Standing-Direktive (Kontext-Budget: bei Überlauf strukturierten Handoff-Report liefern). Der Finalizer SHALL die Abschluss-Schritte über das idempotente Finalize-Skript ausführen und den Endzustand strukturiert zurückmelden.

Hintergrund: Beim Incident T006284 (PR #4460) starb der Executor nach dem Merge an Kontext-Erschöpfung — Ticket-Closure, Archiv und Cleanup blieben liegen, die Eskalation musste alles manuell nachholen. Ein reines Prompt-Verbot bleibt wirkungslos (Muster T001571, T002365): Die Härtung entfernt die Gelegenheit, statt die Direktive zu verschärfen — die Finalisierung läuft in einem Kontext, der sie per Konstruktion noch tragen kann.

#### Scenario: Der Executor starb — die Finalisierung ist trotzdem nachholbar

- **GIVEN** ein Executor hat im Merge-Gate den Auto-Merge angefordert oder bereits aktives Auto-Merge vorgefunden
- **WHEN** die Finalisierung an einen frischen Finalizer-Subagenten delegiert ist
- **THEN** sind Merge-Wait, Ticket-Abschluss, Plan-Archivierung und Cleanup im Finalizer-Auftrag enthalten
- **AND** der Orchestrator endet nach dem Auto-Merge-Request statt die Schritte 6.4–7.5 im eigenen Kontext auszuführen

#### Scenario: Der Finalizer läuft gegen sein Kontext-Budget

- **GIVEN** der Finalizer-Subagent bemerkt Anzeichen von Kontext-Überlauf
- **WHEN** er die T001571-Standing-Direktive befolgt
- **THEN** stoppt er und liefert einen strukturierten Handoff-Report (erledigte Schritte, Zustand, offene Schritte in Reihenfolge)
- **AND** die offenen Schritte sind über das idempotente Finalize-Skript von jeder Session nachholbar

