# T002774 — --hold im Fix-Pfad + MCP stage_plan hold-Parameter

> **Type:** fix | **Severity:** minor | **Effort:** klein

## File Structure

| File | Role |
|------|------|
| `.claude/skills/references/dev-flow-plan-phases.md` | --hold in Fix-Pfad CLI-Fallback + MCP-First |
| `scripts/ticket-mcp/go/internal/tools/workflow.go` | MCP stage_plan hold-Parameter |
| `scripts/ticket-mcp/go/internal/tools/workflow_test.go` | Test für hold-Parameter |

## Tasks

### 1. Doku-Fix: --hold im Fix-Pfad-Beispiel

- [ ] `dev-flow-plan-phases.md:341-345`: `--hold \` als letzte Zeile vor `"` hinzufügen
- [ ] `dev-flow-plan-phases.md:337-338`: MCP-First-Aufruf um hold-Parameter ergänzen

### 2. MCP-Tool: hold-Parameter in stage_plan

- [ ] `workflow.go`: `stage_plan`-Tool-Definition um `mcp.WithBoolean("hold")` ergänzen
- [ ] `workflow.go`: Handler: bei `hold=true` `--hold` an die Ticket-CLI-Args anhängen

### 3. Verifikation

- [ ] `go test ./internal/tools/ -run 'Stage' -v` (falls vorhanden)
- [ ] `go build ./...`
