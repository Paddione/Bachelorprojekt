# p2 — Claude Code mirrors + routing

Mirrors the three primaries for Claude Code and rewires the routing table.
Content mirrors the p1 prompts; frontmatter `description` carries role +
signals (2 lines), body keeps library includes, escalation protocol, and
active-plans injection with the full role name.

## Tasks

- [ ] Write `.claude/agents/bp-build.md` — mirror of the build prompt, model
  opus (matches former infra/security tier).
- [ ] Write `.claude/agents/bp-run.md` — mirror of the run prompt, model
  sonnet (matches former ops/db tier), keeps the session-integrity probe.
- [ ] Write `.claude/agents/bp-ship.md` — mirror of the ship prompt, model
  sonnet (matches former test/website tier).
- [ ] Edit `AGENTS.md` routing table: replace the six `bachelorprojekt-*`
  rows with three `bp-*` rows (signals from design §3); update the skill
  dispatch map (`infra-ops` to build, `incident-response` + `database-specialist`
  to run, `website-specialist` + `web-audit` + `dev-flow-e2e` to ship).

## Acceptance

- [ ] Each new agent file names its OMO counterpart capability and references
  (not copies) topology and runbook sources.
- [ ] No stale `bachelorprojekt-*` name remains in `AGENTS.md` prose or tables:
  `grep -rn 'bachelorprojekt-' AGENTS.md` returns only historical mentions, if any.
