# Proposal: ticket-mcp Go-Rewrite mit HTTP-Transport [T001043]

## Why

Der bestehende `scripts/ticket-mcp/` Node.js-Server ist als stdio-MCP konfiguriert
(`"type": "local"` in opencode.jsonc), schlägt aber beim Start durch opencode fehl —
`zod` ist nur transitiv über `@modelcontextprotocol/sdk` verfügbar, nicht in package.json
deklariert, und opencode's Prozess-Spawning toleriert das nicht.

Folge: opencode-Sessions haben keinen Zugriff auf die 12 ticket-mcp-Tools (list_tickets,
get_ticket, export_tickets, triage_ticket, backfill_ticket_id, set_plan_meta,
set_readiness_flag, prepare_feature, transition_status, add_comment, update_fields,
report_mishap).

## What

Rewrite des ticket-mcp-Servers in Go:

- **Single Binary** `scripts/ticket-mcp/ticket-mcp-go` — kein node_modules, kein npm install
- **Dual-Transport**: stdio (Claude Code, unverändert) und StreamableHTTP (opencode via Port 13004)
- **Alle 12 Tools** 1:1 portiert — gleiche Namen, gleiche Parameter, gleiche Semantik
- **Mishap-Buffer** in `.git/mishap-buffer.json` (identisch zum Node-Impl)
- **Transport-Wahl** via Env-Var `TICKET_MCP_HTTP=1` oder `--http` Flag + optionaler Port `TICKET_MCP_PORT=13004`

## Security Constraints

`run_ticket.go` ruft `ticket.sh` via `exec.Command("bash", ticketSh, args...)` auf —
**ohne** `-c`-Flag und ohne String-Interpolation. Argumente werden als separate
Prozess-Parameter übergeben (analog zum Node.js `execFile`), nicht als Shell-String.
Shell-Metacharacter in Tool-Parametern sind damit wirkungslos.

Zusätzlich: `ticketSh`-Pfad wird beim Start gegen den Repo-Root validiert
(`filepath.Clean` + `strings.HasPrefix(repoRoot)`).

## Scope

- `scripts/ticket.sh` bleibt unverändert — Go-Server ruft es via `exec.Command("bash", ...)` auf
- Node.js-Implementierung bleibt als Referenz erhalten (kein Delete)
- opencode.jsonc: `ticket-mcp` wechselt von `"type": "local"` zu `"type": "remote"`
- `scripts/mcp-portforward.sh`: Port 13004 in Status-Schleife ergänzen
- Claude Code `.mcp.json`: stdio zeigt auf Go-Binary

## Technical Approach

```
scripts/ticket-mcp/
  go/
    cmd/ticket-mcp/main.go        # Transport-Wahl (stdio vs HTTP), Server-Init
    internal/tools/
      list.go                     # list_tickets, get_ticket, export_tickets
      triage.go                   # triage_ticket, backfill_ticket_id
      planning.go                 # set_plan_meta, set_readiness_flag, prepare_feature
      lifecycle.go                # transition_status, add_comment, update_fields
      mishap.go                   # report_mishap + mishap-buffer (JSON in .git/)
    internal/runner/
      run_ticket.go               # exec.Command wrapper (kein -c, kein String-Interpolation)
    go.mod / go.sum
    Makefile                      # build → ../ticket-mcp-go (Binary im Root)
```

MCP-SDK: `github.com/mark3labs/mcp-go` (MIT, unterstützt stdio + StreamableHTTP).

_Ticket: T001043_
