---
title: "local-llm-freetoken-direct — Implementation Plan"
ticket_id: T900208
domains: [software-factory, llm-local-dev]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# local-llm-freetoken-direct — Implementation Plan

_Ticket: T900208_

## File Structure

- `openspec/changes/local-llm-freetoken-direct/`
  - `proposal.md`
  - `tasks.md`
  - `specs/llm-local-dev.md`
  - `specs/software-factory.md`
- `scripts/factory/`
  - `lib.sh`
  - `route-provider.sh`
  - `provider-register-local.sh`
  - `pipeline.mjs`
  - `dispatcher-bridge.sh`
  - `opencode-exec.sh`
  - `mcp-go/main.go`
  - `mcp-go/README.md`
- `scripts/factory-mcp-node/server.mjs`
- `.opencode/`
  - `agent-models.jsonc`
  - `opencode.jsonc`
  - `dcp.jsonc`
  - `prompts/local-subagent.md`
  - `prompts/orchestrator.md`
  - `prompts/qwen38-primary.md`
- `tests/spec/`
  - `software-factory/local-llm-freetoken-direct.bats`
  - `software-factory/partial-deploy-gang.bats`
  - `software-factory/provider-config-baseurl-convention.bats`
  - `factory-escalation-ladder.bats`
  - `llm-local-dev.bats`
  - `local-llm-proxy/factory-default-not-freetoken.bats`
  - `local-llm-proxy/opencode-routes-via-proxy.bats`

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Add the BATS test that reproduces the
      bug in `tests/spec/software-factory/local-llm-freetoken-direct.bats`.
      The test must FAIL on the current branch. Use the phrase
      `expected: FAIL` in the step body so plan-lint STRUCT2 picks it up.

```bash
bash tests/bats tests/spec/software-factory/local-llm-freetoken-direct.bats
# expected: FAIL (red — without routing updates, endpoints target :18235)
```

- [x] **Fix-Step (GREEN).** Implement the fix across all routing surfaces:
      - Update `scripts/factory/lib.sh` (remove `factory_model_pin`)
      - Update `scripts/factory/route-provider.sh` and `scripts/factory/provider-register-local.sh` to target FreeToken `:1919`
      - Update `scripts/factory/pipeline.mjs`, `scripts/factory/dispatcher-bridge.sh`, and `scripts/factory/opencode-exec.sh`
      - Update `scripts/factory-mcp-node/server.mjs`, `scripts/factory/mcp-go/main.go`, and `scripts/factory/mcp-go/README.md`
      - Update `.opencode/agent-models.jsonc`, `.opencode/opencode.jsonc`, `.opencode/dcp.jsonc`, and prompts (`local-subagent.md`, `orchestrator.md`, `qwen38-primary.md`)
      - Update existing tests in `partial-deploy-gang.bats`, `provider-config-baseurl-convention.bats`, `factory-escalation-ladder.bats`, `llm-local-dev.bats`, `factory-default-not-freetoken.bats`, `opencode-routes-via-proxy.bats`
      The BATS tests must now pass.

```bash
bash tests/bats tests/spec/software-factory/local-llm-freetoken-direct.bats
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
