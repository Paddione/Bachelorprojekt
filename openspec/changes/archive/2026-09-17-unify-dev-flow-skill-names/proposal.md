# Proposal: unify-dev-flow-skill-names

## Why

Seit T013724 laden `opencode-flow-{plan,execute,chore}` und `dev-flow-{plan,execute,chore}`
denselben Inhalt (Directory-Symlinks auf die Shared Sources `.claude/skills/dev-flow-*`).
Die doppelte Namensfamilie kostet aber Drift-Schutz: Registry, Tests, Doku und
skill-interne Querverweise müssen beide Namen pflegen, und opencode muss die
`dev-flow-*`-Namen zusätzlich geladen halten, damit Querverweise aufloesen.

## What

- Die drei Symlinks werden von `.opencode/skills/opencode-flow-*` zu
  `.opencode/skills/dev-flow-*` umbenannt (Ziel `../../.claude/skills/dev-flow-*`
  bleibt identisch). Beide Harnesses nutzen damit dieselben Skill-Namen.
- Alle aktiven Referenzen folgen: BATS-Guards (harness-workflow-split,
  guard-parity, devflow-worktree-cwd-guard, ticket-lock-closure-T003102),
  E2E-Walkthrough, Agent-Guide-Registry (tools.yaml) + regenerierte Artifacts,
  `.opencode/opencode.jsonc`, AGENTS.md, `opencode-git-workflow`-Skill,
  Skript-Kommentare.
- SSOT `openspec/specs/harness-workflow-split.md` wird per Delta angepasst
  (Requirement + Szenarien nennen künftig `dev-flow-*`). Archivierte Changes
  bleiben unberührt.

_Ticket: T014086_
