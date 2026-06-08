---
ticket_id: T000523
status: in-progress
domains: [test, infra]
---

# Fix: FA-SF-41 non-hermetic — isolate wakeup.sh single-flight lock + env file

**Ticket:** T000523 · **Branch:** `fix/factory-tick-lock-hermetic`

## Problem

`tests/local/FA-SF-41-wakeup.bats` (behavioral "forwards -p/--allowedTools/…")
false-reds **locally** while green in **CI**. Two non-hermetic couplings to host
state, both surfaced while writing the regression test:

1. **Shared single-flight lock.** `scripts/factory/wakeup.sh` flock's the
   hardcoded `/tmp/factory-tick.lock`. When the live autopilot tick holds it,
   wakeup.sh skips early → the stub `claude` is never exec'd → argv assertions fail.
2. **Prod env-file clobber.** wakeup.sh sources `~/.config/factory/autopilot.env`
   with `set -a`, which **overrides** test-provided env (notably
   `FACTORY_CLAUDE_BIN`) → the real claude is exec'd instead of the stub.

CI has neither a held lock nor the env file, so it stays green — masking the bug.

## Fix (TDD, red→green)

- **Test first (RED):** make the behavioral test hermetic and add a dedicated
  guard that holds an *isolated* override lock and asserts wakeup.sh skips on IT
  (not the shared `/tmp` lock). Update the structural test to assert the
  overridable default. Confirmed red before the script change.
- **Script (GREEN):** two new optional knobs in `wakeup.sh`, defaults unchanged
  so production behavior is identical:
  - `FACTORY_TICK_LOCK` → `LOCKFILE` (default `/tmp/factory-tick.lock`)
  - `FACTORY_ENV_FILE`  → sourced prod config (default `~/.config/factory/autopilot.env`)
  - skip message now interpolates `${LOCKFILE}`.
- Tests pass `FACTORY_TICK_LOCK`/`FACTORY_ENV_FILE` at isolated tmp paths.

## Verification

- `FA-SF-41` deterministically green: 10/10 runs, 0 not-ok, with the live
  autopilot still ticking.
- `task test:factory`: 194 green, exit 0.
- `bash -n scripts/factory/wakeup.sh` clean.
- No other repo references to the hardcoded lock/env paths.

(JS suites `test:docs-gen`/`test:agent-guide` fail in the *worktree* only —
missing node_modules — unrelated to this bash-scoped change; green in CI.)

## Files

- `scripts/factory/wakeup.sh`
- `tests/local/FA-SF-41-wakeup.bats`
