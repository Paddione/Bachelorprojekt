# agent-skills — Delta-Spec (T006366 devflow-automerge-preflight)

## Purpose

Erweitert den `dev-flow-execute`-Ablauf um einen Auto-Merge-Zustandscheck: Bevor das
Code-Review-Gate (Schritt 3.8) ein Review-Ergebnis erteilt und im Pre-Flight wird
geprüft, ob auf dem PR bereits Auto-Merge aktiv ist — extern aktiviert durch den User
oder eine parallele Session. Bei aktivem Auto-Merge bricht der Ablauf fail-closed ab:
Der Merge ist dann nicht mehr durch das Gate kontrollierbar, und die Situation gehört
sichtbar gemacht statt still weitergelaufen (Repo-Lehre T002365/T005307: die Gelegenheit
entfernen, statt die Direktive zu verschärfen).

## ADDED Requirements

### Requirement: dev-flow-execute erkennt extern aktivierten Auto-Merge

Die Skill-Datei `.claude/skills/dev-flow-execute/SKILL.md` SHALL den Auto-Merge-Zustand
des Pull Requests über `scripts/check-pr-automerge.sh` prüfen, bevor das Code-Review-Gate
(Schritt 3.8) ein Review-Ergebnis erteilt. Das Skript SHALL den Zustand über
`gh pr view --json number,autoMergeRequest` ermitteln (PR-Nummer explizit oder
Branch-Auflösung) und mit definierten Exit-Codes beenden: `0` = kein Auto-Merge aktiv
(kein PR für den Branch oder `autoMergeRequest` null), `1` = Auto-Merge aktiv (Meldung
nennt die PR-Nummer), `2` = Umgebungsfehler (gh nicht verfügbar oder technischer
gh-Fehler). Bei Exit-Code `1` SHALL das Review-Gate fail-closed abbrechen: kein
Review-Ergebnis wird erteilt, kein Auto-Merge wird still deaktiviert. Die Pre-Flight-
Phasen (`dev-flow-execute-phases.md`) SHALL denselben Check nach dem Doppelarbeit-Guard
ausführen; existiert für den Branch bereits ein PR mit aktivem Auto-Merge, bricht die
Session als Doppel-Execution ab und koordiniert sich, statt die Implementierung zu
duplizieren.

Hintergrund: T006282 — während des Review-Gates (Verdict "With fixes") aktivierte der
User Auto-Merge auf PR #4524; der Merge lief bei grüner CI durch, der Review-Fix (2
Doc-Zeilen) kam nach dem Merge und brauchte Folge-Ticket T006330 + PR #4527. Das Gate
kontrolliert nur die eigene `gh pr merge --auto`-Anforderung (T005565); extern
aktiviertes Auto-Merge bleibt unsichtbar.

#### Scenario: Auto-Merge ist vor dem Review-Gate extern aktiviert

- **GIVEN** der User oder eine parallele Session hat Auto-Merge auf dem PR aktiviert
- **WHEN** das Code-Review-Gate (Schritt 3.8) beginnt
- **THEN** prüft der Orchestrator den Auto-Merge-Zustand über `scripts/check-pr-automerge.sh`
- **AND** bei aktivem Auto-Merge (Exit-Code 1) bricht das Gate ab und nennt die PR-Nummer
- **AND** es wird kein Review-Ergebnis erteilt und kein Auto-Merge deaktiviert

#### Scenario: Der Pre-Flight erkennt eine Doppel-Execution mit aktivem Auto-Merge

- **GIVEN** für den Branch existiert bereits ein PR mit aktivem Auto-Merge
- **WHEN** dev-flow-execute den Pre-Flight ausführt
- **THEN** bricht der Pre-Flight mit einer Doppelarbeit-Meldung ab (Exit-Code 1)
- **AND** die Session koordiniert sich statt die Implementierung zu duplizieren

#### Scenario: Kein Auto-Merge ist aktiv

- **GIVEN** der PR hat keinen Auto-Merge (`autoMergeRequest` null) oder es existiert
  kein PR für den Branch
- **WHEN** der Check läuft
- **THEN** endet er mit Exit-Code 0 und der Ablauf kann fortfahren

#### Scenario: Ein technischer gh-Fehler ist kein Freibrief

- **GIVEN** `gh` ist nicht verfügbar oder `gh pr view` scheitert aus anderem Grund als
  "kein PR für den Branch"
- **WHEN** der Check läuft
- **THEN** endet er mit Exit-Code 2 und der Aufrufer bricht ab
- **AND** der Zustand wird nicht als "kein Auto-Merge" gelesen
