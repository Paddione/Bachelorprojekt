---
ticket_id: T001845
plan_ref: null
status: active
date: 2026-07-15
---

# wakeup-dispatcher-bridge-wiring — Fix Spec

## Root Cause

`scripts/factory/wakeup.sh` runs one dispatcher tick by shelling out to the closed-source
`claude` CLI with a prompt that forces the model to call
`Workflow({scriptPath:'scripts/factory/dispatcher.js'}, {...})` (lines 111-197). When
`ANTHROPIC_MODEL`/the local backend is the LM Studio-hosted `qwythos-9b-v2` model, its GGUF
chat template emits tool calls in a non-standard nested XML form
(`<tool_call><function=X><parameter=Y>value</parameter></function></tool_call>`) rather than
the Hermes/Qwen JSON form (`<tool_call>{"name":...,"arguments":{...}}</tool_call>`) the
harness's tool-call parser expects.

Observed live 2026-07-15 ~02:06 CEST via `journalctl --user -u factory.service` and the LM
Studio server log (`~/.lmstudio/server-logs/2026-07/2026-07-15.2.log`): the tick retried
building the `Workflow` call three different ways ("directly invoking the script path,
wrapping parameters in an `args` object, and adding metadata fields like `description`"),
each failing identically with `Unexpected token '{'. import call expects one or two
arguments.` — a Node/V8 dynamic-`import()` syntax error surfacing from inside the
closed-source `claude` binary's tool-call argument construction. The tick exited 0 (queue was
empty) but burned 43.694s CPU on the failed retries before giving up and reporting the error
verbatim, per the harness's own instruction not to loop on identical failures.

This is a distinct failure mode from T001843 (Skill-tool hallucination + false "scriptPath
unsupported" refusal) — T001843's fixes (commits `3f63504bc`, `af86321c1`) are
prompt-engineering only and do not touch how the model's raw tool-call *syntax* gets parsed by
the harness.

## Fix Approach

`scripts/factory/dispatcher-bridge.sh` already exists, is already referenced
(`DISPATCHER_BRIDGE="${REPO}/scripts/factory/dispatcher-bridge.sh"` at `wakeup.sh:109`), but is
**never invoked** — dead code. Its own header comment states its purpose exactly matches this
bug: "Replaces the Workflow-tool-based dispatcher.js call with a bash loop that reads the prep
file, runs budget checks, and launches each pipeline as its own `claude -p` session. This
avoids the need for Qwythos to call Workflow()." For the empty-queue case (tonight's exact
failure), `dispatcher-bridge.sh` makes **zero** LLM/tool calls — pure bash, `jq`-driven,
exits 0.

Fix: in `wakeup.sh`, replace the `claude -p "${RUN_PROMPT}"` refusal-retry loop (lines
172-197, which forces `Workflow({scriptPath:'scripts/factory/dispatcher.js'},...)`) with a
direct call to `bash "${DISPATCHER_BRIDGE}" "${PREP_FILE}" ${DRY_RUN:+--dry-run}`. This removes
the LLM/Workflow-tool round trip for the dispatcher-tick step entirely, eliminating the
XML-tool-call-parsing failure mode at its source instead of continuing to prompt-engineer
around a harness-internal parsing bug.

`PROMPT`, `CLAUDE_BIN` invocation for the tick-level `Workflow(dispatcher.js)` call, and the
refusal-retry regex/loop (`REFUSAL_RETRIED`, `CLAUDE_OUT` grep) become dead code and are
removed along with it, since `dispatcher-bridge.sh` never emits an LLM refusal in the first
place (it either runs pure bash or launches per-ticket `claude -p` pipeline sessions inside
its own loop).

## Affected Subsystems

- `scripts/factory/wakeup.sh` — the only file changed. Tick loop control flow (TICK_EXIT,
  IDLE_RETICK check after) must be preserved: `dispatcher-bridge.sh` should be treated as
  always-exit-0-unless-fatal (it already `|| true`s its own internal steps), so `TICK_EXIT`
  becomes the bridge script's own exit code.
- `scripts/factory/dispatcher-bridge.sh` — **not modified**. Still internally builds
  `Workflow({scriptPath:'scripts/factory/pipeline.js'},...)` per launched ticket (line 71) —
  same failure class, but out of scope: that inner call only fires when `launch_count > 0`,
  is a materially different (larger, harder to bash-reimplement) call, and needs its own
  follow-up ticket. Noting it here so it isn't lost.

## Edge Cases

- **`launch_count > 0` (tickets ready to dispatch):** `dispatcher-bridge.sh` still shells out
  to `claude -p` per ticket with a `Workflow(pipeline.js)`-forcing prompt (line 65-84) — this
  fix does not change that path's exposure to the same bug class. Out of scope; call out as a
  known follow-up in the PR description.
- **`DISPATCHER_BRIDGE` script missing/non-executable:** `dispatcher-bridge.sh` already
  guards `[[ ! -f "$PREP_FILE" ]]` for its own input but wakeup.sh must still check the bridge
  script itself exists before invoking (`[[ -x "${DISPATCHER_BRIDGE}" ]]`) and fail loudly
  (non-zero exit) rather than silently no-op if the file were ever moved/renamed.
- **`DRY_RUN` propagation:** `wakeup.sh`'s `DRY_RUN` variable must map to
  `dispatcher-bridge.sh`'s `--dry-run` flag (bridge script already supports it, see its
  `--dry-run` arg parsing).

## Follow-up (not in this fix)

File a new ticket for the `dispatcher-bridge.sh:71` `Workflow(pipeline.js)` call — same root
cause, needs a bash-native per-ticket pipeline launcher (already partially designed: the
bridge script already launches each ticket's `claude -p` session in the background and
`wait`s; the remaining piece is replacing that inner prompt-forced `Workflow()` call the same
way this fix replaces the outer one).
