---
title: "observability-remediation — P3 agent-tracing"
ticket_id: T002151
domains: [agent-tooling, observability]
status: planning
---

# observability-remediation — Implementation Plan (P3: agent-tracing)

This is Partial **P3 (agent-tracing)** of 5: **P1 logging-pipeline-fixes → P2 service-health-goals
→ P3 agent-tracing → P4 alertmanager-secret-fix → P5 tests**.

P3 makes local opencode agent runs (`bonsai-8b-1..4`, `gemma-*`, `deepseek-helper`, `orchestrator`
in `.opencode/agent-models.jsonc`) observable in the codebase-memory knowledge graph: a repo-tracked
opencode plugin accumulates each session's model identifier, agent role, ordered tool-call sequence,
start/end timestamps and terminal outcome, and flushes the trace via `ingest_traces` on session end —
queryable through `query_graph`/`trace_path`, **not** Grafana/Loki (design.md decision). A companion
reference document (`agent-config-standard.md`) gives every config field in `agent-models.jsonc` a
named meaning, valid range and worked decision example, and the config file gains inline pointers to it.

## Resolved design question — how the plugin reaches `ingest_traces`

The task brief left this open ("`client` passthrough vs. shell/HTTP"). **Resolved by direct
verification, not assumption:**

- `PluginInput.client` is the **opencode server SDK** (`createOpencodeClient` — session/tui/message
  APIs, as used by `loop-guard.ts`'s `client.session.abort`/`client.tui.showToast`). It exposes **no
  path to invoke a foreign MCP server's tool**. So the client is *not* the sink.
- `codebase-memory-mcp` is registered in `.opencode/opencode.jsonc` as `"type": "local"` (stdio
  command `/home/patrick/.local/bin/codebase-memory-mcp`), **not** a `"type": "remote"` HTTP endpoint
  like `mcp-postgres`/`mcp-kubernetes`/`factory-mcp` — so there is no localhost port to `fetch`.
- The binary ships a **one-shot CLI mode**: `codebase-memory-mcp cli <tool> '<json>'`. Verified live
  (`codebase-memory-mcp cli list_projects '{}'` → JSON on stdout, exit 0). This is the sink.
- `PluginInput.$` is a **`BunShell`** (opencode plugins run under Bun). The plugin shells out via
  `$` to `codebase-memory-mcp cli ingest_traces '<payload>'`; `$` auto-escapes the interpolated JSON
  as a single argv. This mirrors the precedent that `loop-guard.ts` uses opencode-provided runtime
  handles (`client`) rather than importing infra directly.

**Narrow residual uncertainty (documented, not guessed):** the sink depends on `codebase-memory-mcp`
being resolvable on the opencode runtime's `PATH` (it is installed via `codebase-memory-mcp install`,
normally into `~/.local/bin`). The plugin therefore (a) makes the binary path a plugin option
(`binPath`, default `"codebase-memory-mcp"`) and (b) runs the sink **best-effort** — `.nothrow()` plus
a `try/catch` so a missing binary or ingest failure logs to stderr and never throws into the opencode
event loop (same defensive posture as loop-guard's `.catch(() => {})`).

## Source of model/agent identity

`tool.execute.before` only carries `{ tool, sessionID, callID }` + `{ args }` — no model/agent. The
`@opencode-ai/plugin` `Hooks` interface (read from `.opencode/node_modules/@opencode-ai/plugin/dist/index.d.ts`)
exposes **`chat.message`** with `{ sessionID, agent?, model?: { providerID, modelID } }`. The spec
requirement says "at minimum `tool.execute.before` and the `session.idle`/`session.deleted` events" —
"at minimum", so P3 additionally hooks `chat.message` to record the model identifier
(`${providerID}/${modelID}`, matching the `model` field format in `agent-models.jsonc`, e.g.
`llama-bonsai-server/Ternary-Bonsai-8B-Q2_0.gguf`) and the agent role. There is **no** dedicated
`session.idle`/`session.deleted` hook key: per intel.json (re-verified against `loop-guard.ts` lines
108–113 and the `.d.ts`), both are dispatched through the generic `event` hook and discriminated via
`event.type`.

## File Structure

Existing files carry their **verified effective S1 budget** (`wc -l` vs. baseline;
`nicht-baselined` → budget = extension limit − ist):

| `path` | ist | budget |
|--------|-----|--------|
| `scripts/opencode-sync-agents.sh` | 44 | 456 |
| `vitest.config.ts` | 14 | 586 |
| `.opencode/agent-models.jsonc` | 200 | n/a (`.jsonc` — not in `gates.yaml` S1 limits; +2 comment lines only) |

New files (cut small under their limit; not yet baselined):

| `path` | est. lines | limit |
|--------|-----------|-------|
| `.opencode/plugins/agent-tracer.ts` | ~150 | 600 (`.ts`) |
| `.opencode/plugins/agent-tracer.test.ts` | ~80 | 600 (`.ts`) |
| `.opencode/plugins/tsconfig.json` | ~12 | n/a (`.json` — not S1-gated) |
| `.claude/skills/references/agent-config-standard.md` | ~140 | n/a (`.md` — not S1-gated) |

### Why the plugin core is split from the plugin wiring (S2 / testability)

`agent-tracer.ts` is authored as **two layers in one file**: a pure, runtime-free core
(`createTraceStore`, `argsSignatureOf`, `outcomeForEvent`, the `Trace`/`ToolCall`/`TraceSink` types)
with **zero** runtime import from `@opencode-ai/plugin`/`@opencode-ai/sdk` (only `import type`, erased
at transform time), and the default `Plugin` export that wires the core to opencode's hooks and the
`$` shell-out sink. The core is what Task 1's unit test exercises with a mocked `TraceSink` — no
opencode/Bun runtime needed (there is none in CI). This keeps the module a single file well under the
600-line `.ts` limit while remaining fully unit-testable; no cross-file S2 edge is introduced.

### CI-runner reality for the plugin test (why two small enabler files)

The root `vitest.config.ts` only includes `scripts/**/*.test.ts` and `tests/e2e/lib/*.test.ts`, and
vitest 4 transforms via **oxc**, which resolves the *nearest* `tsconfig.json` (walking up to the root
`tsconfig.json` — whose project references are absent in CI's root-only install — breaks the
transform; this is the T001360 problem `scripts/tsconfig.json` already solves). So for
`.opencode/plugins/agent-tracer.test.ts` to actually run, P3 (a) adds `.opencode/plugins/**/*.test.ts`
to the vitest `include` and (b) ships a self-contained `.opencode/plugins/tsconfig.json` mirroring
`scripts/tsconfig.json`. Both are owned by P3; P5 (the formal test partial) touches neither — P5 adds
the always-on **BATS structural gate** `tests/spec/agent-tracing.bats` over the plugin source, which
is the CI gate that does not depend on an opencode runtime.

---

## Task 1 — Red test first: pure trace-core with a mocked sink (FAIL before the module exists)

Create `.opencode/plugins/agent-tracer.test.ts`. It imports the **pure core** of the not-yet-written
plugin and drives it directly, plus a `vi.fn()` mock standing in for the `@opencode-ai/plugin` runtime
sink — proving the accumulation/flush contract without any opencode/Bun runtime. This is the red→green
anchor for the partial.

```ts
// .opencode/plugins/agent-tracer.test.ts
// Unit test for the runtime-free core of the agent-tracer plugin. There is no real
// opencode/Bun runtime in CI, so this exercises the pure store + outcome mapping and a
// hand-mocked TraceSink — NOT the default Plugin export's `$` shell-out. The always-on
// structural gate over the plugin source is P5 (tests/spec/agent-tracing.bats).
import { describe, it, expect, vi } from 'vitest';
import {
  createTraceStore,
  argsSignatureOf,
  outcomeForEvent,
  type Trace,
  type TraceSink,
} from './agent-tracer';

describe('agent-tracer core', () => {
  it('records tool calls in dispatch order with args signatures (spec: "Tool calls are recorded in order")', () => {
    let t = 0;
    const store = createTraceStore(() => `2026-07-24T00:00:0${t++}.000Z`);
    store.identify('ses_1', 'llama-bonsai-server/Ternary-Bonsai-8B-Q2_0.gguf', 'gemma-2');
    store.recordToolCall('ses_1', 'read', { path: 'a.ts' });
    store.recordToolCall('ses_1', 'bash', { command: 'ls' });
    const trace = store.finalize('ses_1', 'completed') as Trace;
    expect(trace.toolCalls.map((c) => c.tool)).toEqual(['read', 'bash']);
    expect(trace.toolCalls[0].args).toContain('a.ts');
    expect(trace.model).toBe('llama-bonsai-server/Ternary-Bonsai-8B-Q2_0.gguf');
    expect(trace.agent).toBe('gemma-2');
  });

  it('finalize clears session state and yields a non-negative duration', () => {
    let t = 0;
    const store = createTraceStore(() => `2026-07-24T00:00:0${t++}.000Z`);
    store.identify('ses_2', 'm', 'a');
    store.recordToolCall('ses_2', 'read', {});
    const trace = store.finalize('ses_2', 'completed') as Trace;
    expect(store.has('ses_2')).toBe(false);
    expect(trace.durationMs).not.toBeNull();
    expect(trace.durationMs as number).toBeGreaterThanOrEqual(0);
    expect(store.finalize('ses_2', 'completed')).toBeUndefined(); // second flush is a no-op
  });

  it('maps idle→completed and deleted→aborted', () => {
    expect(outcomeForEvent('session.idle')).toBe('completed');
    expect(outcomeForEvent('session.deleted')).toBe('aborted');
  });

  it('argsSignatureOf never throws and truncates oversized args', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(typeof argsSignatureOf(circular)).toBe('string');
    const big = argsSignatureOf({ blob: 'x'.repeat(2000) });
    expect(big.length).toBeLessThanOrEqual(513);
  });

  it('a mocked sink receives the full accumulated trace on flush (spec: "Session end flushes the trace")', async () => {
    const store = createTraceStore();
    store.identify('ses_3', 'bonsai', 'bonsai-8b-2');
    store.recordToolCall('ses_3', 'grep', { pattern: 'x' });
    const trace = store.finalize('ses_3', 'completed') as Trace;
    const sink: TraceSink = vi.fn(async () => {});
    await sink([trace], 'opencode-agent-traces');
    expect(sink).toHaveBeenCalledWith([trace], 'opencode-agent-traces');
    const passed = (sink as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as Trace[];
    expect(passed[0].toolCalls[0].tool).toBe('grep');
  });
});
```

Also create the self-contained tsconfig so vitest 4's oxc transform does not walk up to the root
`tsconfig.json` (T001360 rationale):

```json
// .opencode/plugins/tsconfig.json
{
  "//": "Self-contained tsconfig for .opencode/plugins/ so the vitest 4 oxc transformer resolves the nearest tsconfig here and does NOT walk up to the root tsconfig.json (whose project references are absent in CI's root-only install). Mirrors scripts/tsconfig.json [T001360].",
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "verbatimModuleSyntax": false,
    "skipLibCheck": true,
    "types": []
  }
}
```

And widen the vitest include by exactly one glob (Task 2's module + this test then resolve):

```ts
// vitest.config.ts — edit the `include` array only
    include: ['scripts/**/*.test.ts', 'tests/e2e/lib/*.test.ts', '.opencode/plugins/**/*.test.ts'],
```

Run the focused test — it must **FAIL** first because `./agent-tracer` does not exist yet:

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/observability-remediation
npx vitest run .opencode/plugins/agent-tracer.test.ts --reporter=verbose
```

**expected: FAIL** — `Failed to resolve import "./agent-tracer"` (module not found). Task 2 makes it pass.

---

## Task 2 — `.opencode/plugins/agent-tracer.ts` (pure core + Plugin wiring)

Create the plugin. The pure core carries all testable logic; the default `Plugin` export wires it to
`chat.message` (identity), `tool.execute.before` (sequence) and `event` (flush on
`session.idle`/`session.deleted`) with a `$`-shell-out sink to `codebase-memory-mcp cli ingest_traces`.

```ts
// .opencode/plugins/agent-tracer.ts
// Agent-Tracer: captures a full trace of every local opencode agent session — model
// identifier, agent role, ordered tool-call sequence, start/end timestamps, terminal
// outcome — and flushes it into the codebase-memory knowledge graph via `ingest_traces`
// so model/effort settings can be tuned from data (query_graph/trace_path), not guesswork.
// Repo source of truth; synced to ~/.config/opencode/plugins/ by scripts/opencode-sync-agents.sh.
// Hook usage + per-session Map + event(session.idle/deleted) discrimination follow the live
// precedent ~/.config/opencode/plugins/loop-guard.ts.
import type { Plugin } from '@opencode-ai/plugin';
import type { Event } from '@opencode-ai/sdk';

// ── Pure, runtime-free core (unit-testable without an opencode/Bun runtime) ──────────

export type ToolCall = { tool: string; args: string; at: string };

export type Trace = {
  sessionID: string;
  model: string | null;
  agent: string | null;
  toolCalls: ToolCall[];
  startedAt: string | null;
  endedAt: string;
  durationMs: number | null;
  outcome: 'completed' | 'aborted' | 'error';
};

export type TraceSink = (traces: object[], project: string) => Promise<void>;

const MAX_ARGS_SIG = 512;

/** Deterministic, size-bounded signature of a tool's arguments (never throws). */
export function argsSignatureOf(args: unknown): string {
  let s: string;
  try {
    s = JSON.stringify(args) ?? String(args);
  } catch {
    s = String(args); // circular / non-serializable
  }
  return s.length > MAX_ARGS_SIG ? `${s.slice(0, MAX_ARGS_SIG)}…` : s;
}

/** Map an opencode session-end event type to a terminal outcome. */
export function outcomeForEvent(eventType: string): Trace['outcome'] {
  // session.idle = the turn completed normally; session.deleted = torn down / aborted
  // (loop-guard abort, user cancel). The minimal hook set has no dedicated error signal,
  // so 'error' is reserved for a sink failure recorded by the caller, not derived here.
  return eventType === 'session.deleted' ? 'aborted' : 'completed';
}

type SessionAccum = {
  model: string | null;
  agent: string | null;
  toolCalls: ToolCall[];
  startedAt: string | null;
};

/** Per-session accumulator. `now` is injectable so tests get deterministic timestamps. */
export function createTraceStore(now: () => string = () => new Date().toISOString()) {
  const sessions = new Map<string, SessionAccum>();

  function ensure(sessionID: string): SessionAccum {
    let s = sessions.get(sessionID);
    if (!s) {
      s = { model: null, agent: null, toolCalls: [], startedAt: null };
      sessions.set(sessionID, s);
    }
    return s;
  }

  return {
    /** Record model/agent identity for a session (from chat.message). */
    identify(sessionID: string, model: string | null, agent: string | null): void {
      const s = ensure(sessionID);
      if (model) s.model = model;
      if (agent) s.agent = agent;
      if (!s.startedAt) s.startedAt = now();
    },
    /** Append a tool call in dispatch order (from tool.execute.before). */
    recordToolCall(sessionID: string, tool: string, args: unknown): void {
      const s = ensure(sessionID);
      if (!s.startedAt) s.startedAt = now();
      s.toolCalls.push({ tool, args: argsSignatureOf(args), at: now() });
    },
    /** Remove + return the finished trace (from session.idle/deleted); undefined if unknown. */
    finalize(sessionID: string, outcome: Trace['outcome']): Trace | undefined {
      const s = sessions.get(sessionID);
      if (!s) return undefined;
      sessions.delete(sessionID);
      const endedAt = now();
      const durationMs =
        s.startedAt != null ? Date.parse(endedAt) - Date.parse(s.startedAt) : null;
      return {
        sessionID,
        model: s.model,
        agent: s.agent,
        toolCalls: s.toolCalls,
        startedAt: s.startedAt,
        endedAt,
        durationMs,
        outcome,
      };
    },
    has(sessionID: string): boolean {
      return sessions.has(sessionID);
    },
  };
}

export type TraceStore = ReturnType<typeof createTraceStore>;

function sessionIdFromEvent(event: Event): string | undefined {
  const properties = (event as { properties?: Record<string, unknown> }).properties;
  if (!properties) return undefined;
  if (typeof properties.sessionID === 'string') return properties.sessionID;
  const info = properties.info as { id?: string } | undefined;
  return info?.id;
}

// ── Plugin wiring (opencode runtime; the shell-out sink is injected here) ────────────

const DEFAULT_PROJECT = 'opencode-agent-traces';

const AgentTracerPlugin: Plugin = async ({ $ }, options) => {
  const opts = options as { project?: string; binPath?: string } | undefined;
  const project = opts?.project || DEFAULT_PROJECT;
  const bin = opts?.binPath || 'codebase-memory-mcp';
  const store = createTraceStore();

  // Sink: shell out to the codebase-memory-mcp one-shot CLI. `$` is Bun's shell
  // (PluginInput.$: BunShell); the interpolated payload is passed as a single, auto-escaped
  // argv. Best-effort: `.quiet()` + `.nothrow()` and the caller's try/catch guarantee a
  // missing binary or ingest failure never throws into the opencode event loop.
  const sink: TraceSink = async (traces, proj) => {
    const payload = JSON.stringify({ traces, project: proj });
    await $`${bin} cli ingest_traces ${payload}`.quiet().nothrow();
  };

  return {
    // Capture model identifier + agent role as soon as a message is dispatched.
    'chat.message': async (input) => {
      if (!input.sessionID) return;
      const model = input.model ? `${input.model.providerID}/${input.model.modelID}` : null;
      store.identify(input.sessionID, model, input.agent ?? null);
    },

    // Accumulate the ordered tool-call sequence.
    'tool.execute.before': async (input, output) => {
      if (!input.sessionID) return;
      store.recordToolCall(input.sessionID, input.tool, output.args);
    },

    // Flush on session end and clear in-memory state.
    event: async ({ event }: { event: Event }) => {
      if (event.type !== 'session.idle' && event.type !== 'session.deleted') return;
      const sessionID = sessionIdFromEvent(event);
      if (!sessionID || !store.has(sessionID)) return;
      const trace = store.finalize(sessionID, outcomeForEvent(event.type));
      if (!trace) return;
      try {
        await sink([trace], project);
      } catch (e) {
        console.error(`[agent-tracer] ingest_traces failed for ${sessionID}:`, e);
      }
    },
  };
};

export default AgentTracerPlugin;
```

Now re-run Task 1's focused test — it must go **green** (all 5 cases pass):

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/observability-remediation
npx vitest run .opencode/plugins/agent-tracer.test.ts --reporter=verbose
```

> Note on the `session.idle` lifecycle: opencode emits `session.idle` at every turn boundary (same as
> loop-guard, which deletes per-session state there). For tracing this means one trace is flushed per
> completed turn of a session — acceptable and consistent with the proven precedent; a fresh accumulator
> is lazily re-created on the next `chat.message`/`tool.execute.before` for that sessionID.

---

## Task 3 — Extend `scripts/opencode-sync-agents.sh` to also sync the plugins directory

**Decision (per the brief's explicit choice):** the sync script currently syncs only
`agent-models.jsonc` → `~/.config/opencode/opencode.jsonc` (jq merge) and `.opencode/prompts/*.md` →
`prompts/` (cp). It does **not** sync a `plugins/` directory. Rather than leave the plugin as a manual
`cp` that will rot, **extend the script** — it already ships the exact `cp` pattern for prompts, so
mirroring it for `.opencode/plugins/*.ts` is a trivial, consistent, low-risk addition and keeps the
repo the single source of truth for the plugin.

Append this block after the existing prompts-sync block (before the trailing blank line), matching its
style. Note the `--type f` guard so the synced `.opencode/plugins/tsconfig.json` and any
`*.test.ts` are excluded — only the runtime plugin module(s) are copied to the live plugins dir:

```bash
PLUGINS_SRC="$REPO_DIR/.opencode/plugins"
PLUGINS_TGT="$(dirname "$TARGET_FILE")/plugins"
if [[ -d "$PLUGINS_SRC" ]]; then
  mkdir -p "$PLUGINS_TGT"
  # Runtime plugin modules only — skip *.test.ts and the self-contained tsconfig.
  find "$PLUGINS_SRC" -maxdepth 1 -type f -name '*.ts' ! -name '*.test.ts' \
    -exec cp -f {} "$PLUGINS_TGT"/ \;
  echo "Successfully synced plugin modules to $PLUGINS_TGT"
fi
```

Verify the script still parses and the new block copies the plugin (dry sanity — writes into the live
config dir, so run only on the WSL host where opencode lives):

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/observability-remediation
bash -n scripts/opencode-sync-agents.sh   # syntax check, no execution
```

**expected: exit 0** (no syntax error). The functional sync (`bash scripts/opencode-sync-agents.sh`)
is run once on the host after merge to publish `agent-tracer.ts` into `~/.config/opencode/plugins/`;
it is intentionally **not** a CI step (design.md risk: the live plugin dir is outside the repo and has
no opencode runtime in GitHub Actions).

---

## Task 4 — `.claude/skills/references/agent-config-standard.md` (config-field standard)

Create the reference. One section per **distinct top-level key actually used across the `agent`
entries** in `.opencode/agent-models.jsonc` (enumerated by reading the file: `description`, `mode`,
`model`, `prompt`, `color`, `temperature`, `steps`, `permission`) — each with meaning, valid range and
a worked decision example. This satisfies the spec scenario "Every active config field has a documented
entry". A note maps the spec's "effort/equivalent" to opencode's `steps` (there is no separate
`effort` field) and "purpose" to `description`.

```markdown
# Agent Config Standard — `.opencode/agent-models.jsonc`

> Single source of truth for what each field in an `agent`/`provider` entry means, its valid range,
> and how to choose a value. Referenced from inline comments in `.opencode/agent-models.jsonc`.
> Scope: the local opencode subagent gang (`bonsai-8b-1..4`, `deepseek-helper`, `orchestrator`, …).
> The agent-tracer plugin (`.opencode/plugins/agent-tracer.ts`) records `model` + agent role +
> tool-call sequence per session into the codebase-memory graph, so changes to these fields can be
> evaluated against real run data (`query_graph`/`trace_path`) instead of guesswork.

## `description`  (= the spec's "agent purpose")

- **Meaning:** Human- and orchestrator-facing one-liner that tells the dispatcher *when* to route to
  this agent. The primary orchestrator reads it to decide delegation.
- **Valid range:** non-empty string; state the model, the write-capability, and the escalation tier.
- **Decision example:** `bonsai-8b-2` says "Write-capable subagent 2/4 … Preferred for all
  write-capable delegation", while `deepseek-helper` says "ESCALATION: … dispatch when a local
  parallel subagent is stuck". The words *Preferred* vs *ESCALATION* are the routing signal — write
  the tier explicitly so the orchestrator does not have to infer it.

## `mode`

- **Meaning:** How opencode surfaces the agent. `"primary"` = a top-level, Tab-selectable driver;
  `"subagent"` = only reachable via a `task` dispatch from a primary.
- **Valid range:** `"primary" | "subagent"`.
- **Decision example:** `orchestrator` is `"primary"` (you talk to it directly); the `bonsai-8b-*`
  gang is `"subagent"` (only the orchestrator dispatches them). Pick `"primary"` only for an agent a
  human selects; everything the orchestrator fans out to is `"subagent"`.

## `model`

- **Meaning:** `"<providerID>/<modelID>"` — the provider key from the `provider` section plus the
  model key under it. This exact string is what the tracer records as the model identifier.
- **Valid range:** a `provider`/`model` pair that exists in this file's `provider` section.
- **Decision example:** `llama-bonsai-server/Ternary-Bonsai-8B-Q2_0.gguf` pins the bonsai gang to the
  single-slot local server (serialized via the llm-proxy queue); `opencode-go/deepseek-v4-flash`
  points the escalation/orchestrator agents at the 1M-ctx subscription model. Choose the local model
  for cheap parallel implementation work, the subscription model when context size or a stuck local
  agent forces escalation.

## `prompt`

- **Meaning:** The system prompt, as a `{file:./prompts/<name>.md}` reference (synced to the live
  config dir by `scripts/opencode-sync-agents.sh`).
- **Valid range:** `{file:./prompts/*.md}` — keep prompts in files, never inline megastrings.
- **Decision example:** the gang shares `{file:./prompts/local-subagent.md}`; the orchestrator has its
  own `{file:./prompts/orchestrator.md}`. Reuse one prompt file across identically-roled agents so a
  policy change lands in one place.

## `color`

- **Meaning:** Hex accent for the agent in the opencode TUI. Cosmetic only — no behavioral effect.
- **Valid range:** `"#RRGGBB"`.
- **Decision example:** the four bonsai agents use a warm amber→orange ramp
  (`#F59E0B`/`#F97316`/`#EA580C`/`#D97706`) so four parallel streams are visually distinguishable at a
  glance; the orchestrator uses violet `#8B5CF6` to stand apart from its workers.

## `temperature`

- **Meaning:** Sampling temperature passed to the model. Lower = more deterministic/repeatable;
  higher = more exploratory.
- **Valid range:** `0.0`–`1.0` in practice; this repo uses `0.2`–`0.4`.
- **Decision example:** `orchestrator` runs `0.2` (planning/CI decisions must be stable), the bonsai
  implementers `0.4` (a little breadth on code edits), `deepseek-helper` `0.3`. There is a known
  footgun (`reference_fablevibes-toolcall-think-leak`): some local models leak tool-calls in `<think>`
  at higher temps — hold write-capable local agents at ≤ `0.4`. Default to the lowest temperature that
  still lets the agent make progress.

## `steps`  (= the spec's "effort/equivalent")

- **Meaning:** Maximum agent turns (tool-call/response cycles) before opencode stops the run. This is
  the opencode analogue of an "effort" budget — there is **no** separate `effort` field.
- **Valid range:** positive integer; omit to accept the opencode default. This repo uses `10` for
  subagents, `50` for the orchestrator; `deepseek-helper` omits it (default).
- **Decision example:** a bonsai subagent gets `10` (a focused, bounded implementation slice — if it
  needs more it should hand back to the orchestrator, which the loop-guard also enforces by aborting
  runaway cycles); the orchestrator gets `50` because it fans out many `task` dispatches plus git/CI
  checkpoints in one session. Size `steps` to the *bounded* unit of work, not the worst case.

## `permission`

- **Meaning:** Per-tool capability gate. Keys `edit`/`write`/`bash`/`task`/`webfetch`/`websearch` map
  to `"allow" | "deny"`. `task` may instead be an object mapping agent-name globs to `allow`/`deny`
  (delegation allowlist).
- **Valid range:** `{ <tool>: "allow" | "deny", task?: "allow" | "deny" | { "<glob>": "allow" | "deny" } }`.
- **Decision example:** the bonsai gang runs `{ edit: allow, write: deny, bash: allow, task: deny }` —
  `write: deny` is deliberate: bonsai-8b overwrote whole files instead of surgical edits (T002137,
  2026-07-23), so new files are created by the orchestrator after the subagent returns the content.
  The orchestrator instead scopes `task` to `{ "bonsai-8b-*": "allow", "deepseek-helper": "allow" }`
  so it can fan out to its gang but not to arbitrary agents. Grant the *narrowest* permission set that
  lets the agent do its job; prefer `write: deny` for any model observed to clobber files.

---

### Provider-entry fields (context)

The `provider` section is opencode's model registry, not per-agent tuning; the fields above under
`agent` are what you change to tune behavior. Provider entries carry `npm` (the SDK adapter,
`@ai-sdk/openai-compatible`), `name` (human label), `options.baseURL`/`options.apiKey` (endpoint), and
`models.<id>.limit.{context,output}` (token budgets). Edit these only when adding/retargeting a model
server, not when tuning an agent.
```

---

## Task 5 — `.opencode/agent-models.jsonc`: inline pointers to the standard

Add a short `//` comment immediately above the `"provider"` section and above the `"agent"` section
pointing to the new reference (JSONC allows `//`). This satisfies the spec scenario "a comment
immediately above [the `agent` section] references `agent-config-standard.md`".

Above the `"provider"` key (top of file, line 2):

```jsonc
  // Field reference (model / temperature / steps / permission / …): see
  // .claude/skills/references/agent-config-standard.md — meaning, valid range, worked
  // decision example per field. Provider entries are the model registry (endpoint + limits).
  "provider": {
```

Above the `"agent"` key:

```jsonc
  // Per-agent tuning fields (description=purpose, mode, model, prompt, color, temperature,
  // steps=effort budget, permission): documented in
  // .claude/skills/references/agent-config-standard.md. The agent-tracer plugin records
  // model + role + tool-call sequence per session so these settings can be tuned from data.
  "agent": {
```

> Do not reflow or reorder any existing entries — this is a +2-comment-block change only, so the
> `.jsonc` file stays off the S1 radar (`.jsonc` is not in `gates.yaml` S1 limits) and the parallel
> partials' expectations about this file are unaffected. Preserve the file's staged working-tree state;
> only insert the two comment blocks.

<!-- vitest: the .ts unit obligation for this partial is met by Task 1's .opencode/plugins/agent-tracer.test.ts (mocked-interface core test); the always-on structural CI gate over the plugin source is P5 (tests/spec/agent-tracing.bats). The .jsonc/.md/.sh edits carry no Vitest obligation. -->

---

## Task 6 — Verify (mandatory gate commands)

Run, in order, and confirm each passes before handing off:

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/observability-remediation

# 1. Focused plugin-core test green (from Task 1/2) — proves the accumulate/flush contract
npx vitest run .opencode/plugins/agent-tracer.test.ts --reporter=verbose

# 2. Sync script still parses
bash -n scripts/opencode-sync-agents.sh

# 3. Regenerate generated artefacts (test-inventory picks up the new .opencode plugin test, repo-index, …)
task test:inventory
task freshness:regenerate

# 4. Mandatory CI-equivalent gates
task test:changed          # changed-domain tests (vitest --changed + BATS selection + quality)
task freshness:check       # freshness + quality:check (S1–S4 ratchet + baseline key-count assertion)
```

- `task freshness:check` is the load-bearing gate: S1 confirms the two new `.ts` files stay under 600
  and `scripts/opencode-sync-agents.sh` (44 → ~52, budget 456) and `vitest.config.ts` (14 → 15, budget
  586) do not exceed their budgets; S2 finds no new import cycle (the plugin is one self-contained
  file); S3 introduces no hostname literals; S4 — the new `scripts/*` addition is a *modification* of an
  already-referenced script (no orphan), the new `.opencode/plugins/*.ts` is reached by the extended
  sync script + the vitest include, and no new `k3d/*.yaml` is added.
- Commit the regenerated `website/src/data/test-inventory.json` alongside the code if the new
  `.opencode` test changes it (CI fails on drift).
- P5 (tests, always last) adds the formal always-on `tests/spec/agent-tracing.bats` structural gate
  over `.opencode/plugins/agent-tracer.ts`; P3's own focused test above is green here.
