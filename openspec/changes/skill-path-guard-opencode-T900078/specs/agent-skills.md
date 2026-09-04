# agent-skills — Delta: .opencode/skills-Abdeckung im dead-path-references Guard

## Requirement: Der dead-path-references Guard MUSS .opencode/skills/ Pfade erfassen

Die SSOT-Kopfzeile in `tests/spec/agent-skills/skill-path-references.bats` MUSS auf
`openspec/specs/agent-skills.md` verweisen (existiert).

Der Guard MUSS repo-relative Pfadverweise unter `.opencode/skills/` zusammen mit
`.claude/skills/` extrahieren und gegen das Dateisystem auflösen. Der `SKILL_PATH_PATTERN`
MUSS beide Präfixe matchen (Alternation über `\.claude|\.opencode`). Die
`skill_files()`-Funktion MUSS `.opencode/skills` als Scan-Quelle enthalten.

Vendored third-party skills (gitops-*, vitest, unsloth-buddy, ui-ux-pro-max) bleiben
von der Prüfung ausgeschlossen — sie verweisen auf Upstream-Doku oder fremde Projekte.

Der Guard MUSS sicherstellen, dass `.opencode/skills/` Shims ihre `.opencode/skills/`-Ziele
referenzieren und umgekehrt — kein Shim ohne existierendes Ziel, kein Ziel ohne Shim.

#### Scenario: Verweise auf .opencode/skills/ werden geprüft

- **GIVEN** eine Skill-Datei unter `.opencode/skills/references/` enthält
  `(.opencode/skills/references/dev-flow-gotchas.md)`
- **WHEN** der Guard läuft
- **THEN** wird der Pfad extrahiert und auf Existenz geprüft

#### Scenario: Shims haben bidirektionale Abdeckung

- **GIVEN** ein Skill existiert unter `.opencode/skills/dev-flow-execute/SKILL.md`
- **AND** ein Shim existiert unter `.claude/skills/dev-flow-execute/SKILL.md`
- **WHEN** der shim-coverage Test läuft
- **THEN** wird das Shim als existierend bestätigt
