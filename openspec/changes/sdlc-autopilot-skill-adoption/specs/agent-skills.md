## ADDED Requirements

### Requirement: sdlc-autopilot Skill ist getrackter Bestandteil des opencode-Rosters

Das Repository SHALL den Skill `sdlc-autopilot` als versionierte Datei unter
`.opencode/skills/sdlc-autopilot/SKILL.md` führen, sodass der autonome
SDLC-Loop über Checkouts, Worktrees und Clones hinweg reproduzierbar ist.

#### Scenario: Skill nach frischem Clone vorhanden

- **GIVEN** ein frischer Clone des Repositories auf `main`
- **WHEN** opencode die verfügbaren Skills aus `.opencode/skills/` lädt
- **THEN** ist `sdlc-autopilot` mit gültigem Frontmatter (`name`,
  `description` inkl. Trigger-Wörtern) gelistet und aufrufbar.

#### Scenario: Skill bleibt opencode-only

- **GIVEN** die T014086-Konvention (Symlinks nur für in beiden Harnesses
  genutzte dev-flow-\*/openspec-\*-Shared-Sources)
- **WHEN** das Skill-Inventar geprüft wird
- **THEN** existiert für `sdlc-autopilot` bewusst kein Claude-seitiger
  Pfad oder Symlink unter `.claude/skills/`.

### Requirement: Kontext-Voraussetzung ist dokumentiert

Der Skill SHALL dokumentieren, dass er den Vertrag aus T016416 voraussetzt
(`freetoken-active` advertised bis `SDLC_CONTEXT_CEILING`, Default 200000;
KV-Pool wächst serverseitig mit) und dass Merge-Reihenfolge T016416 zuerst
oder gemeinsam gilt.

#### Scenario: Abhängigkeit ohne freigeschaltetes Ceiling

- **GIVEN** der Skill läuft, während `SDLC_CONTEXT_CEILING` nicht aktiv ist
- **WHEN** der Loop arbeitet
- **THEN** funktioniert er mit dem schmaleren Default-Limit weiter und
  weicht keine Verhaltensregel des Skills davon ab.
