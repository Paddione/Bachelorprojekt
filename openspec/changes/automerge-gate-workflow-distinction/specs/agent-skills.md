## MODIFIED Requirements

### Requirement: dev-flow-execute erkennt extern aktivierten Auto-Merge

Die Skill-Datei `.claude/skills/dev-flow-execute/SKILL.md` SHALL den Auto-Merge-Zustand
des Pull Requests über `scripts/check-pr-automerge.sh` prüfen, bevor das Code-Review-Gate
(Schritt 3.8) ein Review-Ergebnis erteilt. Das Skript SHALL den Zustand über
`gh pr view --json number,autoMergeRequest,createdAt` ermitteln (PR-Nummer explizit oder
Branch-Auflösung) und mit definierten Exit-Codes beenden: `0` = kein Auto-Merge aktiv
(kein PR für den Branch oder `autoMergeRequest` null) **oder ein maschinell erkennbarer
Auto-Merge wurde erfolgreich deaktiviert**, `1` = Auto-Merge aktiv und nicht als
maschinell erkennbar (menschlich gesetzt oder nicht einordenbar — fail-closed, Meldung
nennt die PR-Nummer), `2` = Umgebungsfehler (gh nicht verfügbar, technischer gh-Fehler
oder gescheiterte Deaktivierung).

Das Skript SHALL einen aktiven Auto-Merge anhand von `autoMergeRequest.enabledBy` als
maschinell gesetzt einordnen, wenn eine von zwei Regeln zutrifft:

1. **Bot-Regel:** `enabledBy.__typename` ist `"Bot"` oder der Login endet auf `[bot]`.
2. **PAT-Regel:** der Login ist in der Allowlist `CHECK_PR_AUTOMERGE_PAT_ACTORS`
   (Default: `Paddione`) UND die Aktivierung liegt innerhalb des Workflow-Fensters:
   `enabledAt − createdAt ≤ CHECK_PR_AUTOMERGE_WORKFLOW_WINDOW_SECS` (Default: 300).

Hintergrund der PAT-Regel (Messung 2026-08-24): Der Workflow 'Auto-enable Auto-Merge'
setzt das Flag mit dem PAT `secrets.GH_PAT`, dessen Identität `Paddione` ist — ein
workflow-gesetzter Auto-Merge trägt daher denselben menschlich benannten Login wie eine
manuelle Aktivierung; nur die Zeitkorrelation zum Aktivierungsfenster trennt beide Fälle.

Trifft keine Regel zu oder sind `enabledBy`/`enabledAt` nicht auswertbar, SHALL das
Skript fail-closed abbrechen (`1`): kein Review-Ergebnis wird erteilt und der Auto-Merge
wird nicht deaktiviert — ein menschlich gesetzter Auto-Merge bleibt Operator-Entscheidung.
Erkennt das Skript einen maschinell gesetzten Auto-Merge, SHALL es ihn über
`gh pr merge --disable-auto` deaktivieren, den Erfolg mit `0` melden und dabei PR-Nummer
sowie Deaktivierung nennen; scheitert die Deaktivierung technisch, SHALL es mit `2`
abbrechen. Die Pre-Flight-Phasen (`dev-flow-execute-phases.md`) SHALL denselben Check
nach dem Doppelarbeit-Guard ausführen; existiert für den Branch bereits ein PR mit
aktivem, nicht-maschinell einordbarem Auto-Merge, bricht die Session als
Doppel-Execution ab und koordiniert sich, statt die Implementierung zu duplizieren;
ein maschinell gesetzter Auto-Merge wird im Pre-Flight ebenso deaktiviert statt abzubrechen.

Hintergrund: T006282 — während des Review-Gates (Verdict "With fixes") aktivierte der
User Auto-Merge auf PR #4524; der Merge lief bei grüner CI durch, der Review-Fix (2
Doc-Zeilen) kam nach dem Merge und brauchte Folge-Ticket T006330 + PR #4527. T015915 —
der Repo-Workflow aktiviert Auto-Merge bei jeder PR-Anlage mit dem PAT des Operators;
GitHub mergte PR #5197 beim ersten grünen Stand (d999b383), bevor das Review-Gate lief,
und der gepushte Review-Fix fb3a823e3 blieb ungemergt (Nachzug über T015860, PR #5200).
Das Gate war reiner Zustandsmelder statt Schranke, weil sein D2-Fail-closed jeden
Aktivierer als Menschen behandelte.

#### Scenario: Workflow-gesetzter Auto-Merge im Aktivierungsfenster wird deaktiviert

- **GIVEN** der PR hat Auto-Merge aktiv, `enabledBy.login` ist `Paddione` und
  `enabledAt` liegt höchstens `CHECK_PR_AUTOMERGE_WORKFLOW_WINDOW_SECS` nach `createdAt`
- **WHEN** der Check läuft
- **THEN** deaktiviert das Skript den Auto-Merge über `gh pr merge --disable-auto`
- **AND** meldet Erfolg mit PR-Nummer und endet mit Exit-Code 0

#### Scenario: Bot-gesetzter Auto-Merge wird unabhängig vom Fenster deaktiviert

- **GIVEN** der PR hat Auto-Merge aktiv und `enabledBy.__typename` ist `"Bot"`
  (oder der Login endet auf `[bot]`)
- **WHEN** der Check läuft
- **THEN** deaktiviert das Skript den Auto-Merge unabhängig vom zeitlichen Abstand zu `createdAt`
- **AND** meldet Erfolg mit PR-Nummer und endet mit Exit-Code 0

#### Scenario: Menschlich gesetzter Auto-Merge außerhalb des Fensters bleibt stehen

- **GIVEN** der PR hat Auto-Merge aktiv, `enabledBy.login` ist in der Allowlist und
  `enabledAt` liegt nach Ablauf des Workflow-Fensters (z. B. Stunden später)
- **WHEN** der Check läuft
- **THEN** bricht das Skript fail-closed mit Exit-Code 1 ab und nennt die PR-Nummer
- **AND** der Auto-Merge wird nicht deaktiviert

#### Scenario: Fremder menschlicher Login bleibt stehen

- **GIVEN** der PR hat Auto-Merge aktiv und `enabledBy.login` ist weder ein Bot-Login
  noch in der Allowlist
- **WHEN** der Check läuft
- **THEN** bricht das Skript fail-closed mit Exit-Code 1 ab und nennt die PR-Nummer
- **AND** der Auto-Merge wird nicht deaktiviert

#### Scenario: Nicht auswertbare enabledBy-Angabe bleibt fail-closed

- **GIVEN** der PR hat Auto-Merge aktiv, aber `enabledBy` fehlt oder ist leer
- **WHEN** der Check läuft
- **THEN** bricht das Skript fail-closed mit Exit-Code 1 ab und nennt die PR-Nummer
- **AND** der Auto-Merge wird nicht deaktiviert

#### Scenario: Gescheiterte Deaktivierung ist kein stiller Erfolg

- **GIVEN** der Auto-Merge wurde als maschinell erkannt
- **WHEN** `gh pr merge --disable-auto` scheitert technisch
- **THEN** endet das Skript mit Exit-Code 2
- **AND** der Zustand wird nicht als "kein Auto-Merge" oder Erfolg gemeldet

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
