## ADDED Requirements

### Requirement: opencode local subagents SHALL be bound to a model id whose context window matches their advertised size

Every `agent` entry in `.opencode/agent-models.jsonc` whose `description` advertises a specific
context size (e.g. "262k ctx") SHALL reference a `model` id in the same file whose `provider.*.models.*`
definition actually carries that `limit.context` value. A subagent MUST NOT be bound to a smaller-context
model variant than its description promises, because dev-flow prompts (plan intel bundles, active-plans
context) routinely approach the advertised limit and silently produce no output when the actual bound
model's context window is exceeded mid-generation.

#### Scenario: qwen35-iq4 is bound to the 262k-context model variant

- **GIVEN** `.opencode/agent-models.jsonc` defines both `qwen3.6-14b-a3b-fablevibes` (32k ctx, 4 parallel
  slots) and `qwen3.6-14b-a3b-fablevibes@262k` (262k ctx, single-session) under the `lmstudio` provider
- **WHEN** the `qwen35-iq4` agent's description advertises "262k ctx"
- **THEN** its `model` field is `lmstudio/qwen3.6-14b-a3b-fablevibes@262k`, not the bare 32k-ctx id

### Requirement: the `triage_ticket` MCP tool SHALL forward `component` to the underlying triage CLI

`scripts/ticket-mcp/go/internal/tools/triage.go`'s `triage_ticket` tool SHALL declare a `component`
parameter in its schema and pass it through as `--component <value>` to the `vda.sh ticket triage`
CLI invocation whenever a non-empty value is supplied, mirroring how the CLI itself already wires
`--component` to `tickets.tickets.component` (T001362/#2366).

#### Scenario: triage_ticket with a component argument sets the ticket's component

- **GIVEN** a `triage_ticket` MCP call with `id=T000XXX` and `component=infra`
- **WHEN** the tool builds its CLI args
- **THEN** the args include `--component infra`

### Requirement: `health-goals-check.sh` network-dependent checks SHALL be bounded by a `timeout`

Every check in `scripts/health-goals-check.sh` that shells out to a network-dependent tool without its
own timeout flag (Lighthouse via `npx @lhci/cli autorun` against a live URL; the `trivy image` scan and
its `kubectl get pods --all-namespaces` pod-image list) SHALL be wrapped in a `timeout <n>` guard, so a
slow or unreachable dependency bounds that single check instead of hanging the whole report
indefinitely — consistent with every other `kubectl` call in the script already using
`--request-timeout`.

#### Scenario: the Lighthouse check cannot hang the report

- **GIVEN** `npx @lhci/cli autorun` is reachable but the target URL never responds
- **WHEN** `health-goals-check.sh` runs without `--fast`
- **THEN** the G-FE05 check aborts after its `timeout` bound instead of hanging indefinitely, and the
  report still reaches its summary line
