## MODIFIED Requirements

### Requirement: Cross-Harness Guard Parity

Die beiden Plan-Skills (dev-flow-plan für Claude Code, opencode-flow-plan für opencode) SHALL symmetrisch alle Prozess-Guards anwenden.

#### Scenario: Guard-Parity-Deklaration

- **GIVEN** ein neuer Prozess-Guard wird in einer Plan-Skill-Prosa dokumentiert
- **WHEN** er in den Planungs-Flow integriert wird
- **THEN** der Guard SHALL in `docs/agent-guide/registry/plan-guards.yaml` registriert sein (mit `id`, `anchor`, und `applies_to`) UND der Anchor-Substring SHALL in jeder `applies_to`-Datei auffindbar sein
- **AND** `tests/spec/dev-flow-plan/guard-parity.bats` ist das fail-closed Gate, das diese Präsenz für alle Einträge verifiziert

### Requirement: Preflight-Skript-Aufrufe

Beide Plan-Skills SHALL ihre Pre-Commit- und Pre-Worktree-Guards über `scripts/plan-preflight.sh` ausführen statt als Inline-Snippets.

#### Scenario: Pre-Commit-Check

- **GIVEN** ein Plan-Agent (Claude Code oder opencode) hat einen Plan erstellt und will committen
- **WHEN** der Agent `bash scripts/plan-preflight.sh pre-commit --ticket <TICKET_ID>` aufruft
- **THEN** das Skript prüft (a) HEAD ist nicht main, (b) working tree ist clean, (c) ein agent-lock-Claim existiert im ticket- ODER branch-scoped Format [T003102] und matched den aktuellen Branch
- **AND** Exit 0 = alle Checks grün, Exit 1 = Guard verletzt, Exit 2 = Umgebungsfehler

#### Scenario: Pre-Worktree-Check

- **GIVEN** ein Plan-Agent will einen Worktree anlegen
- **WHEN** der Agent `bash scripts/plan-preflight.sh pre-worktree --ticket <TICKET_ID>` aufruft
- **THEN** das Skript prüft via `agent-lock.sh check-merged`, ob das Ticket bereits auf main gemergt ist [T002279]
- **AND** Exit-Codes werden durchgereicht (0 = fortfahren, 1 = bereits gemergt → abbrechen, 2 = Umgebung reparieren)

### Requirement: Stage-Plan-Vertrag

`scripts/vda/ticket/stage-plan.sh` SHALL eine explizite Hold-Entscheidung verlangen und bei leerer `touched_files`-Ableitung hart scheitern.

#### Scenario: Hold-Flag-Pflicht

- **GIVEN** `stage-plan.sh` wird aufgerufen
- **WHEN** weder `--hold` noch `--no-hold` übergeben wurde
- **THEN** das Skript gibt Exit 1 mit einer Meldung, die beide Flags als Pflicht nennt

#### Scenario: Leere touched_files-Ableitung

- **GIVEN** ein Plan wurde noch nicht committed auf den Branch
- **WHEN** `stage-plan.sh` läuft und `plan-touched-files.sh` liefert keine Pfade
- **THEN** das Skript gibt Exit 1 mit Hinweis auf T002673 („Plan im Branch-Commit ist noch das propose-Skeleton? Erst committen, dann stagen" )
- **AND** der Override `--allow-empty-touched` umgeht dieses Gate für legitime Sonderfälle

### Requirement: Regel-Injektion

Jeder Plan-Schreib-Prompt (Claude-Subagent, opencode-Orchestrator, Factory `plan:decompose`) SHALL die Ausgabe von `scripts/plan-lint.sh --rules` enthalten.

#### Scenario: Factory plan:decompose

- **GIVEN** die Factory Pipeline startet die Plan-Dekomposition
- **WHEN** `pipeline.mjs` den `plan:decompose`-Prompt konstruiert
- **THEN** die Ausgabe von `plan-lint.sh --rules` wird dem Prompt als führende Instruktion vorangestellt
- **AND** ein fehlgeschlagener `--rules`-Fetch blockiert die Pipeline nicht (fail-open Qualitätshilfe, das Gate bleibt die unveränderte plan-lint-Schleife)

### Requirement: Pfad-Korrektur

Der SSOT-Spec `openspec/specs/dev-flow-plan.md` SHALL auf den realen Pfad des Claude-Plan-Skills verweisen.

#### Scenario: Toter Pfad ersetzt

- **GIVEN** der SSOT-Spec referenziert `.agents/skills/dev-flow-plan/SKILL.md`
- **WHEN** die Datei existiert nicht (`.agents/agents` ist ein Symlink, kein `skills`-Verzeichnis)
- **THEN** die Referenz wird auf `.claude/skills/dev-flow-plan/SKILL.md` korrigiert
