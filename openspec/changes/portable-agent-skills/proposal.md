# Proposal: portable-agent-skills

## Why

The repository has two competing skill-layout contracts. The committed documentation and OpenSpec requirements describe `.opencode/skills` as the single source of truth with Claude shims and `.agents/skills` pointing to OpenCode. The checked-out tree instead keeps the substantive corpus under `.claude/skills`, only three OpenCode flow entries are symlinks to it, and `.agents/skills` points to Claude. Discovery, toolset collection, the agent-guide registry, and BATS guards therefore cover different subsets, and Codex is not represented at all.

The resulting topology makes an ordinary skill edit a four-way compatibility risk. It also encourages hard-coded harness tool names in otherwise shared instructions, so a workflow that works in one harness can advertise an unavailable capability in another. The existing `unify-dev-flow-skill-names` and `sdlc-autopilot-skill-adoption` changes have landed; this change builds on that state rather than reviving their stale pre-merge proposals.

## What

- Establish a tracked, harness-neutral portable skill core under `.agents/skills` for skills intentionally shared by Codex, agy, OpenCode, and Claude Code.
- Add a machine-readable skill registry that states each skill's provenance, supported harnesses, exposure, projection type, and any justified harness-specific override.
- Generate or validate explicit Claude and OpenCode projections from that registry, while retaining genuinely native skills only in their owning harness directory.
- Make Codex a first-class row in the agent-guide harness schema and tool/capability maps.
- Replace pairwise shim/allowlist checks with registry-driven four-harness inventory, drift, path-reference, and trigger-safety guards.
- Migrate shared runbooks to capability-oriented language; adapters may contain harness-native invocation syntax, but portable bodies may not.

Out of scope: changing model routing, installing third-party plugins, changing user-home harness configuration, or implementing new business-domain workflows.

_Ticket: T900151_
