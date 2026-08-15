## ADDED Requirements

### Requirement: Ticket-DB-Routing im psql()-Fallback

The `psql()`-helper documented in `.claude/skills/references/mcp-tool-guide.md`
§mcp-postgres SHALL address the local Ticket-SSOT database (`k3d-mentolder-dev`,
namespace `workspace`) instead of the frozen fleet copy, and SHALL document the
brand routing explicitly: ticket rows of both brands live in the same local
database (mirroring `scripts/ticket.sh` `CTX="${TICKET_CTX:-k3d-mentolder-dev}"`),
while writes against prod business data (`public.*`, `bachelorprojekt.*`,
`mentolder.*` on `fleet`) SHALL remain on `kubectl --context fleet exec ... psql`
behind the prod-write guard. The guide SHALL NOT present the frozen fleet copy
as the write target for ticket data.

#### Scenario: helper points at the local ticket SSOT

- **GIVEN** the `psql()`-helper block in `mcp-tool-guide.md` §mcp-postgres
- **WHEN** its `kubectl exec` invocations are inspected
- **THEN** they reference the `k3d-mentolder-dev` context (pod lookup and exec),
  and the block does not route ticket-write statements to `--context fleet`

#### Scenario: brand routing and fleet freeze are documented

- **GIVEN** the §mcp-postgres section of `mcp-tool-guide.md`
- **WHEN** the section is read
- **THEN** it states that the ticket database (both brands) is the local
  k3d-mentolder-dev database, that the fleet copy is frozen, and that
  fleet-based writes apply only to prod business data behind the prod-write guard

#### Scenario: local writes do not inherit the WireGuard timeout note

- **GIVEN** the §mcp-postgres section of `mcp-tool-guide.md`
- **WHEN** the timeout warning is read
- **THEN** the generous-timeout note (WireGuard) is scoped to fleet-based
  writes and is not stated for local k3d-mentolder-dev writes
