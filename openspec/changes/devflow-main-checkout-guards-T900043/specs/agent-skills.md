# agent-skills — Delta-Spec (T900043 devflow-main-checkout-guards)

## Purpose

Zwei dev-flow-Abläufe verhalten sich im Haupt-Checkout unsicher: Erstens meldet
`scripts/check-pr-automerge.sh` ohne expliziten Branch-/PR-Kontext `OK: Kein PR
gefunden` (rc=0), weil `gh` die PR-Nummer aus dem ambient Branch ableitet — genau
die Regression T006282, die das Gate abfangen soll, bleibt unsichtbar (beobachtet
an PR #5409). Zweitens mutiert der `worktree-create.sh`-Auto-Sync den lokalen
`main` per `pull --rebase` ohne Ankündigung und ohne Opt-out (Reflog:
`pull --rebase (finish): refs/heads/main onto …`, 2026-09-02, direkt nach zwei
lokalen `[T000000]`-Commits im Haupt-Checkout). In
`devflow-post-merge-finalize.sh` und `branch-reaper.sh` steht nachweislich KEIN
pull/rebase — der Auto-Sync ist der einzige Skript-Ort und damit der Fix-Ort.
Beide Befunde werden fail-closed gehärtet: fehlender Kontext bricht ab statt
freizugeben, und ein dirty Baum bricht ab statt still zu syncen.

## MODIFIED Requirements

### Requirement: dev-flow-execute erkennt extern aktivierten Auto-Merge

Die Skill-Datei `.claude/skills/dev-flow-execute/SKILL.md` SHALL den Auto-Merge-Zustand
des Pull Requests über `scripts/check-pr-automerge.sh` prüfen, bevor das Code-Review-Gate
(Schritt 3.8) ein Review-Ergebnis erteilt. Das Skript SHALL den Zustand über
`gh pr view --json number,autoMergeRequest` ermitteln und mit definierten Exit-Codes
beenden: `0` = kein Auto-Merge aktiv (kein PR für den explizit genannten Branch oder
`autoMergeRequest` null), `1` = Auto-Merge aktiv (Meldung nennt die PR-Nummer),
`2` = Umgebungsfehler (gh nicht verfügbar oder technischer gh-Fehler) ODER fehlender
Aufrufkontext. Ein Aufruf OHNE `--pr` und OHNE `--branch` SHALL mit Exit-Code 2
abbrechen und den fehlenden Kontext (`--pr`/`--branch`) in der Fehlermeldung nennen,
statt `gh pr view` gegen den ambient Branch zu proben — es gibt bewusst KEIN
Env-Override für den Kontext (der Kontext ist pro Aufruf zu bestimmen, nicht global).
Bei Exit-Code `1` SHALL das Review-Gate fail-closed abbrechen: kein Review-Ergebnis
wird erteilt, kein Auto-Merge wird still deaktiviert. Die Pre-Flight-Phasen
(`dev-flow-execute-phases.md`, Schritt 1.4.7) SHALL denselben Check mit explizitem
Kontext (`--branch "$BRANCH"`, wie SKILL.md Schritt 3.8 seit T900040) ausführen;
existiert für den Branch bereits ein PR mit aktivem Auto-Merge, bricht die Session
als Doppel-Execution ab und koordiniert sich, statt die Implementierung zu
duplizieren.

Hintergrund: T006282 — während des Review-Gates (Verdict "With fixes") aktivierte der
User Auto-Merge auf PR #4524; der Merge lief bei grüner CI durch, der Review-Fix (2
Doc-Zeilen) kam nach dem Merge und brauchte Folge-Ticket T006330 + PR #4527. Das Gate
kontrolliert nur die eigene `gh pr merge --auto`-Anforderung (T005565); extern
aktiviertes Auto-Merge bleibt unsichtbar. T900043/Befund 2: Der bare Call in
phases.md 1.4.7 fiel auf `main` in genau diese Unsichtbarkeit zurück (PR #5409).

#### Scenario: Barer Aufruf ohne Kontext ist fail-closed

- **GIVEN** das Skript wird ohne `--pr` und ohne `--branch` aufgerufen
- **WHEN** ein beliebiger Branch ausgecheckt ist (einschließlich `main`)
- **THEN** endet es mit Exit-Code 2 und nennt `--pr`/`--branch` als fehlenden Kontext
- **AND** es wird kein `gh pr view` gegen den ambient Branch ausgeführt

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
  kein PR für den explizit genannten Branch
- **WHEN** der Check mit `--pr` oder `--branch` läuft
- **THEN** endet er mit Exit-Code 0 und der Ablauf kann fortfahren

#### Scenario: Ein technischer gh-Fehler ist kein Freibrief

- **GIVEN** `gh` ist nicht verfügbar oder `gh pr view` scheitert aus anderem Grund als
  "kein PR für den Branch"
- **WHEN** der Check läuft
- **THEN** endet er mit Exit-Code 2 und der Aufrufer bricht ab
- **AND** der Zustand wird nicht als "kein Auto-Merge" gelesen

## ADDED Requirements

### Requirement: worktree-create kündigt den main-Sync an und kennt Opt-out

`scripts/worktree-create.sh` SHALL den lokalen `main` im Auto-Sync-Fall (local main
behind `origin/main`) nur nach vorheriger Ankündigung auf stdout/stderr bewegen und
niemals ohne ausdrückliche Behandlung eines dirty Baums: Ist der Haupt-Checkout
dirty, bricht das Skript fail-closed mit Exit-Code ungleich 0 ab, OHNE zu stashen,
zu pullen oder zu poppen (Baum und Stash bleiben unberührt). Ist
`DEVFLOW_NO_MAIN_SYNC=1` gesetzt oder `--no-main-sync` übergeben, wird der
main-mutierende Schritt vollständig übersprungen (kein `pull --rebase`, kein
`checkout -B` auf `main`); der Lauf erstellt den Worktree aus der unveränderten
Basis weiter und meldet das Überspringen. Ist der Baum clean und kein Opt-out
gesetzt, meldet das Skript den Sync VOR der Ausführung (welcher Branch, welche
Richtung) und führt ihn danach wie bisher aus.

#### Scenario: Dirty Baum bricht fail-closed ab

- **GIVEN** der Haupt-Checkout ist dirty und local main liegt hinter `origin/main`
- **WHEN** `worktree-create.sh` ohne Opt-out läuft
- **THEN** endet es mit Exit-Code ungleich 0 und nennt den dirty Zustand
- **AND** `main` zeigt danach auf dieselbe SHA wie vorher
- **AND** die uncommitteten Änderungen liegen unverändert im Baum (kein Stash-Eintrag)

#### Scenario: Opt-out überspringt den main-Touch idempotent

- **GIVEN** `DEVFLOW_NO_MAIN_SYNC=1` ist gesetzt (oder `--no-main-sync` übergeben)
  und local main liegt hinter `origin/main`
- **WHEN** `worktree-create.sh` läuft
- **THEN** wird kein `pull --rebase`/`checkout -B` auf `main` ausgeführt
- **AND** der Worktree wird erstellt (Exit-Code 0) und das Überspringen gemeldet

#### Scenario: Cleaner Baum wird angekuendigt synchronisiert

- **GIVEN** der Haupt-Checkout ist clean, local main liegt hinter `origin/main`,
  kein Opt-out ist gesetzt
- **WHEN** `worktree-create.sh` läuft
- **THEN** meldet es den Sync (Branch und Richtung) vor der Ausführung
- **AND** `main` steht danach auf `origin/main` und der Worktree wird erstellt
