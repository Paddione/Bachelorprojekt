## ADDED Requirements

### Requirement: Feature-Pfad claims the ticket-scoped agent-lock before Schritt 5's guard runs

The Feature-Pfad in `.claude/skills/dev-flow-plan/SKILL.md` MUST create a ticket-scoped
`agent-lock.sh claim ticket` claim at the point where the ticket ID first becomes known
— conditionally in Schritt B.1 (ticket ID already handed in, e.g. by `feature-intake`),
and unconditionally in Schritt 4.5 (right after the ticket is created or reused) — so
that Schritt 5's Pre-Commit-Guard check 3 (branch vs. agent-lock claim) reads a claim
file that actually exists, matching the invariant the Fix-Pfad already satisfies via its
Schritt 2.5.

#### Scenario: Schritt B.1 conditionally claims the ticket when the ID is already known

- **GIVEN** the Feature-Pfad Schritt B.1 ("Worktree anlegen") block in
  `.claude/skills/dev-flow-plan/SKILL.md`
- **WHEN** the block is sliced (from `#### Schritt B.1:` to the next `#### Schritt B.2:`
  header)
- **THEN** the sliced block MUST contain an `agent-lock.sh claim ticket` invocation

#### Scenario: Schritt 4.5 claims the ticket after creation/reuse, before Schritt 5

- **GIVEN** the Feature-Pfad Schritt 4.5 ("Ticket anlegen oder wiederverwenden") block in
  `.claude/skills/dev-flow-plan/SKILL.md`
- **WHEN** the block is sliced (from `### Schritt 4.5:` to the next `### Schritt 5:`
  header)
- **THEN** the sliced block MUST contain an `agent-lock.sh claim ticket` invocation

### Requirement: Schritt 5's Pre-Commit-Guard fails loudly when no ticket-scoped claim exists

Schritt 5's Pre-Commit-Guard check 3 in `.claude/skills/dev-flow-plan/SKILL.md` MUST
verify that the ticket-scoped agent-lock claim file exists before reading its `branch`
field, and MUST emit a dedicated error message distinguishing "no claim" from "branch
mismatch" — a missing claim file must not silently compare against an empty string.

#### Scenario: Schritt 5 guard checks lock-file existence before the jq read

- **GIVEN** the Schritt 5 ("Commit & Push — dann STOPP") block in
  `.claude/skills/dev-flow-plan/SKILL.md`
- **WHEN** the block is sliced (from `### Schritt 5:` to the next `### Schritt 6:`
  header)
- **THEN** the sliced block MUST contain an explicit file-existence check
  (`-f "$LOCK_FILE"` or equivalent) with a dedicated "kein ticket-scoped agent-lock"
  error message, preceding the `jq -r '.branch'` read
