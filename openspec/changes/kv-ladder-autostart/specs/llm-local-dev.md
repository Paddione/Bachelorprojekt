# llm-local-dev Delta

## MODIFIED Requirements

### Requirement: Measured Context Limits for FreeToken Checkpoints

The `limit.context` values in the `freetoken-local` provider SHALL equal the measured usable KV
capacity of the serving configuration: `65536` for `gpt-oss-20b`, `32768` for
`Gemma-4-26B-A4B-NVFP4`. For `Qwen3.6-35B-A3B-NVFP4` the declared `limit.context` SHALL equal the
KV-ladder ceiling (`LADDER_CEILING`, currently `200000`) instead of the static calibrated value,
because the operator grows that model's KV pool budget-conform up to the ceiling via the KV
ladder (`scripts/llm/freetoken-kv-ladder.sh`). A plugin `freetoken-active.ts` SHALL set the alias
entry's limit at opencode startup from the daemon's resident-model report and SHALL advertise at
most `SDLC_CONTEXT_CEILING` (default `200000`) — and only when the engine is running AND the
calibrated limit is at least `100000`; with the daemon unreachable the calibrated static fallback
remains unchanged.

Rationale: opencode auto-compacts at 95 % of the advertised context (~190k at a 200000 ceiling),
so advertising beyond what the KV pool actually serves reproduces the dropped-request failure
class (`Input sequence length exceeds`). The ladder contract closes this gap only when both sides
hold: the declared ceiling matches `LADDER_CEILING`, and the operator grows the server-side KV
cache (`ft ctl cache --kv <n>`); the plugin itself never touches the server.

#### Scenario: Declared limits match measured capacity or the documented ladder ceiling

- **GIVEN** the parsed `freetoken-local.models` object
- **WHEN** each concrete checkpoint entry's `limit.context` is compared against the documented
  values
- **THEN** Qwen3.6-35B-A3B-NVFP4 declares `200000`, gpt-oss-20b declares `65536`, and
  Gemma-4-26B-A4B-NVFP4 declares `32768`

#### Scenario: Plugin resolves the alias limit from the daemon

- **GIVEN** the FreeToken daemon answers the engine status endpoint with the resident model path
- **WHEN** opencode starts and the plugin's config hook runs
- **THEN** the alias entry carries the resident checkpoint's limit grown to the ceiling only
  under the guard conditions, and with the daemon unreachable the static fallback remains
  unchanged

#### Scenario: Ceiling is not advertised without engine or headroom

- **GIVEN** the FreeToken engine is stopped, or the resident checkpoint's calibrated limit is
  below `100000`
- **WHEN** the plugin's config hook runs
- **THEN** the alias keeps the calibrated static limit and does not advertise
  `SDLC_CONTEXT_CEILING`

## ADDED Requirements

### Requirement: Restart autostarts the KV ladder and reaps stale pollers

`scripts/llm/restart-freetoken.ps1` SHALL start the KV ladder
(`scripts/llm/freetoken-kv-ladder.sh`) as a detached WSL background process after the FreeToken
server reports readiness, logging to `/tmp/opencode/kv-ladder.log`. Before starting a new
instance it SHALL terminate any stale ladder poller still bound to the previous engine port, so a
restart never leaves two pollers racing. A `-NoLadder` switch SHALL skip the autostart entirely.

#### Scenario: Restart leaves exactly one poller

- **GIVEN** a KV-ladder poller from a previous engine run is still polling the old port
- **WHEN** `restart-freetoken.ps1` restarts the engine
- **THEN** the stale poller is terminated before the new one starts and exactly one ladder
  process remains afterwards

#### Scenario: Opt-out keeps the calibrated limit effective

- **GIVEN** the operator starts the engine with `-NoLadder`
- **WHEN** the restart completes without the ladder
- **THEN** no ladder process is launched and sessions operate at the statically calibrated
  context limit until the operator grows the KV cache manually
