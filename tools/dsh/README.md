# dsh-bachelorprojekt

Bachelorprojekt bundle for DeepSeek Harness (dsh).

## Tested Version

dsh 0.1.0-rc.7 (commit 3c84106fd era).

## Start

```bash
cd deepseek-harness && pnpm dsh --profile web --dump-config
```

The `cc-hooks` row should appear in the output, confirming the bridge loaded.

With the web UI:
```bash
bash scripts/dsh/web-up.sh
# Starts on http://127.0.0.1:3080 (configurable via DSH_WEB_PORT)
```

## Bridge Limitations

1. **Only `type: "command"` hooks run.** Hooks of type `http`, `mcp_tool`, `prompt`, or
   `agent` are skipped with a warning. All PreToolUse hooks in `.claude/settings.json`
   are `command` hooks, so this is not a current gap — but a future hook of another type
   would silently not execute under dsh.

2. **`configPath` is process-wide.** The bridge resolves the config path once at load
   time against the process cwd. One dsh process per worktree; no per-session config.

## Plugins

Plugins in `plugins/*.mjs` are autoloaded by `index.js`. Each exports `{ name, setup(ctx) }`.

- `repo-guard.mjs` — Native guard: denies write calls targeting paths outside the session cwd.
- `audit-log.mjs` — Writes factory phase events to `tickets.factory_phase_events` via
  `scripts/dsh/session-audit.sh`.
