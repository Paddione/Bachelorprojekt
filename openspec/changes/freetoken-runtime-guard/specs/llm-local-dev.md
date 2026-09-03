## MODIFIED Requirements

### Requirement: Measured Context Limits for FreeToken Checkpoints

The `limit.context` values in the `freetoken-local` provider SHALL equal the
measured usable KV capacity, not the advertised `max_model_len`: `200000` for
`Qwen3.6-35B-A3B-NVFP4`, `65536` for `gpt-oss-20b`, and `32768` for
`Gemma-4-26B-A4B-NVFP4`. The `freetoken-active.ts` plugin SHALL prefer a running
model reported by the daemon. When the daemon does not report a running model
but the serving endpoint is healthy, it SHALL fall back to `/v1/models` and
cap the alias limit to usable KV geometry from `/v1/stats` or
`/v1/cache/status`. It SHALL leave the static fallback unchanged only when
neither discovery path identifies a configured checkpoint.

#### Scenario: Plugin resolves a Desktop-owned server without daemon adoption

- **GIVEN** the daemon reports no running resident model
- **AND** the FreeToken server answers `/v1/models` and exposes usable KV geometry
- **WHEN** OpenCode starts and the plugin's config hook runs
- **THEN** the alias identifies the checkpoint served on port 1919
- **AND** its context limit does not exceed the server's usable KV-token capacity

#### Scenario: Discovery remains fail-silent while the engine is unavailable

- **GIVEN** neither the daemon nor the serving endpoint identifies a configured checkpoint
- **WHEN** OpenCode starts and the plugin's config hook runs
- **THEN** the static alias fallback remains unchanged
