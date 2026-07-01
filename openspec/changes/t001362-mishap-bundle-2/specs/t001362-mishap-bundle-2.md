## ADDED Requirements

### Requirement: vda ticket triage non-interactive mode SHALL accept partial field updates

`scripts/vda/ticket/triage.sh` in non-interactive mode (`--apply`, `VDA_NONINTERACTIVE=1`,
or no TTY) SHALL require only that **at least one** of `--priority`, `--severity`,
`--status`, `--type`, `--attention-mode` is provided, instead of requiring all three
of `--priority`/`--severity`/`--status` unconditionally. The subsequent SQL UPDATE
SHALL leave any field not explicitly provided unchanged (`COALESCE(NULLIF(:'x',''), x)`)
rather than requiring every field to be re-specified on every call.

#### Scenario: setting only --attention-mode in non-interactive mode

- **GIVEN** a ticket `T000XXX` currently has `priority=hoch`, `severity=major`,
  `status=in_progress`
- **WHEN** `triage.sh --apply --id T000XXX --attention-mode ai_ready` runs
  (no `--priority`/`--severity`/`--status` given)
- **THEN** the call succeeds (does not exit 2 with "required" error) and only
  `attention_mode` changes; `priority`, `severity`, and `status` retain their
  prior values

### Requirement: dev-flow subagent-provisioning prompts SHALL mandate an explicit worktree `cd`

The subagent-dispatch instructions in `.claude/skills/dev-flow-execute/SKILL.md`,
`.claude/skills/dev-flow-plan/SKILL.md`, and `.claude/skills/references/subagent-provisioning.md`
SHALL require that every dispatched subagent's prompt begins with an explicit
`cd <WORKTREE_PATH>` command, because a subagent has no implicit CWD context and
otherwise falls back to writing files into the main checkout instead of its
designated worktree.

#### Scenario: dispatching a planning subagent for a staged plan

- **GIVEN** a worktree has been created at `/tmp/wt-<slug>` for ticket `T000XXX`
- **WHEN** a dev-flow skill composes the prompt for the planning/execution subagent
- **THEN** the prompt's first instruction is `cd /tmp/wt-<slug>`, followed by the
  branch name and remaining context, so the subagent cannot mistakenly write plan
  or implementation files into the orchestrator's own checkout
