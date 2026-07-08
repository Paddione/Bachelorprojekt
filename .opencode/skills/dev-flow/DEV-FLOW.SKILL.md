# dev-flow skills (dev-flow-execute, dev-flow-plan)

Skills for managing the OpenCode development workflow from brainstorming through implementation. Supports plan-driven development with automatic freshness guards and CI integration.

## Available Skills

### Core Workflow
- **dev-flow-plan** — Generate design specs and implementation plans via `/opsx:propose` or `openspec propose`
- **dev-flow-execute** — Implement plans commit-by-commit, PR-by-PR (SSOT: [verification-block](file:///home/patrick/Bachelorprojekt/.claude/skills/references/verification-block.md))

### Superpowers
- **using-git-worktrees** — Isolated worktrees for feature branches ([T001364](https://github.com/Paddione/Bachelorprojekt/issues/T001364))
- **vitest** — Fast unit testing (Vitest + Vite, Jest-compatible API)

### References
- [references.md](file:///home/patrick/Bachelorprojekt/.claude/skills/references/README.md) — Cross-cutting concepts (CI gates, deploy routing, session coordination)
- [subagent-provisioning](file:///home/patrick/Bachelorprojekt/.claude/skills/references/subagent-provisioning.md) — Model selection and context injection

## Usage Flow

```bash
# 1. Plan (dev-flow-plan skill)
openspec propose t001xxx --ticket-id=T000XXX

# 2. Execute plan (dev-flow-execute skill)
git checkout -b feature/t001xxx
/devflow:implement { ticketId: "T000XXX" }

# 3. Verify & Merge
task test:changed
gh pr merge --auto --squash
```

## Freshness Guards

Before every commit, regenerates artifacts (test-inventory.json, quality-index.json) to ensure no stale CI gates. Automated via pre-commit hooks.

---

**Documentation:** [dev-flow workflow](file:///home/patrick/Bachelorprojekt/.claude/skills/dev-flow-plan/SKILL.md), [verification-block](file:///home/patrick/Bachelorprojekt/.claude/skills/references/verification-block.md)
