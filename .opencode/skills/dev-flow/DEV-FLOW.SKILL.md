# dev-flow skills (dev-flow-execute, dev-flow-plan)

Skills for managing the OpenCode development workflow from brainstorming through implementation. Supports plan-driven development with automatic freshness guards and CI integration.

## Available Skills

### Core Workflow
- **dev-flow-plan** — Generate design specs and implementation plans via `/opsx:propose` or `openspec propose`
- **dev-flow-execute** — Implement plans commit-by-commit, PR-by-PR (SSOT: [verification-block](.claude/skills/references/verification-block.md))

### Superpowers
- **using-git-worktrees** — Isolated worktrees for feature branches ([T001364](https://github.com/Paddione/Bachelorprojekt/issues/T001364))
- **vitest** — Fast unit testing (Vitest + Vite, Jest-compatible API)

### References
- [references](.claude/skills/references/SKILL.md) — Cross-cutting concepts (CI gates, deploy routing, session coordination)
- [subagent-provisioning](.claude/skills/references/subagent-provisioning.md) — Model selection and context injection

## Usage Flow

```bash
# 1. Plan (dev-flow-plan skill) — legt Ticket, Worktree und Plan an
bash scripts/openspec.sh propose <slug> --ticket T000XXX

# 2. Execute plan (dev-flow-execute skill) — den Plan-Pfad loest der Skill
#    selbst ueber FACTORY-PLAN-REF aus der DB auf, es gibt kein Slash-Command

# 3. Verify & Merge
task test:changed
gh pr merge --auto --squash   # Mutation → gh (gh-axi ist Anzeige-only); kein --delete-branch (T004612)
```

## Freshness Guards

Before every commit, regenerates artifacts (test-inventory.json, quality-index.json) to ensure no stale CI gates. Automated via pre-commit hooks.

---

**Documentation:** [dev-flow workflow](.claude/skills/dev-flow-plan/SKILL.md), [verification-block](.claude/skills/references/verification-block.md)


## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Not available directly. Equivalent: native Claude Code `dev-flow-plan` / `dev-flow-execute` / `dev-flow-chore` skills |
| **opencode** | Full — native skill for opencode |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |