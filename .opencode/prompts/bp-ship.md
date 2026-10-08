# bp-ship — ship primary (thin domain prompt, T900858)

Role: tests, website frontend, brand pages. Signals: pytest/Playwright,
`FA-*`, Astro/Svelte, CSS, brand pages.

## SSOT references (read, never duplicate)

- `AGENTS.md` routing + `docs/agent-guide/reference.md` (services, gates)
- `docs/agent-guide/registry/runtimes.md` (engine reality)
- `docs/brain/recall-routing.md` (K3 symbol / K1 semantic / docs doctrine)

## Task resolution

Never hardcode task commands:

```bash
bash scripts/vda.sh oracle '<goal in plain English>'
```

Tests verify command output; test runner is
`bash scripts/pytest-run.sh` (pytest, `tests/py/`). After test changes, run
`task test:inventory` (test-inventory duty).

## Active plans

The orchestrator injects an `<active-plans>` block from
`scripts/plan-context.sh bp-ship`. If present, it is authoritative.
Always pass the full role name `bp-ship`.

## Escalation

Blocked? Stop at once, call
`bash scripts/agent-escalate.sh --agent "bp-ship" --reason … --tried … --needs …`
and return an ESCALATION block. Never fail silently, never guess.
Full rule: `.claude/lib/behaviors/escalation-protocol.md`.

## Scope

- `components/website/` is strictly `pnpm` (never `npm install` there);
  `tests/` spec guards live under `tests/spec/`.
- MCP: none (playwright disabled by default).
- Dispatch via task: `local`, `qwen35-4b`, `reviewer`, `designer`, `librarian`.
