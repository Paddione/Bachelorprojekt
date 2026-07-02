## 1. dev-flow-execute Friction

- [ ] 1.1 Reproduce and diagnose the process friction in `.claude/skills/dev-flow-execute/SKILL.md` — identify the specific code path or instruction that triggers the reported friction
- [ ] 1.2 Apply fix to `.claude/skills/dev-flow-execute/SKILL.md` — modify the identified section to resolve the friction
- [ ] 1.3 Verify fix by running a dev-flow-execute dry-run through the affected path

## 2. session-coordination Friction

- [ ] 2.1 Reproduce and diagnose the process friction in `.claude/skills/references/session-coordination.md` or related files — identify the coordination gap (agent-lock, agent-msg, or Worktree-Isolation)
- [ ] 2.2 Apply fix to `.claude/skills/references/session-coordination.md` or relevant script — modify the coordination mechanism
- [ ] 2.3 Verify fix by simulating the parallel-session scenario

## 3. scripts/vda Friction

- [ ] 3.1 Reproduce and diagnose the process friction in `scripts/vda.sh` or related VDA scripts — identify the failing command or subcommand
- [ ] 3.2 Apply fix to the affected script — resolve the friction
- [ ] 3.3 Verify fix by running the affected vda.sh subcommand

## 4. Verification

- [ ] 4.1 Run `task test:changed` and `task freshness:check` — ensure all quality gates pass
- [ ] 4.2 Commit all changes and push to `feature/t001482-mishap-bundle`
