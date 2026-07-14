package tools

import (
	"context"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"github.com/korczewski/bachelorprojekt/ticket-mcp/internal/runner"
)

// RegisterLinkTools registers link_tickets and get_ticket_links as thin
// adapters over the ticket.sh link-tickets and get-ticket-links verbs.
// Business logic (SQL, validation beyond enum check) lives in ticket.sh.
func RegisterLinkTools(s *server.MCPServer) {
	brandOf := func(a map[string]any) string {
		if b, _ := a["brand"].(string); b != "" {
			return b
		}
		return "mentolder"
	}
	text := func(raw string, err error) (*mcp.CallToolResult, error) {
		if err != nil {
			return nil, err
		}
		return mcp.NewToolResultText(strings.TrimSpace(raw)), nil
	}

	s.AddTool(
		mcp.NewTool("link_tickets",
			mcp.WithDescription("Erstellt einen gerichteten Dependency-Link zwischen zwei Tickets (pr, relates_to, blocks, blocked_by, duplicate_of, fixes, fixed_by, child_of). Idempotent — mehrfacher Aufruf mit gleichen Argumenten erzeugt keinen Duplikat-Eintrag. HINWEIS: CLI-Statusübergänge via ticket.sh update-status erscheinen nicht in der Timeline (bekannte Lücke)."),
			mcp.WithString("from", mcp.Description("external_id des Quell-Tickets, z.B. T000100"), mcp.Required()),
			mcp.WithString("to", mcp.Description("external_id des Ziel-Tickets, z.B. T000200"), mcp.Required()),
			mcp.WithString("kind",
				mcp.Description("Art der Verknüpfung: pr, relates_to, blocks, blocked_by, duplicate_of, fixes, fixed_by, child_of"),
				mcp.Enum("pr", "relates_to", "blocks", "blocked_by", "duplicate_of", "fixes", "fixed_by", "child_of"),
				mcp.Required(),
			),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			from, _ := a["from"].(string)
			to, _ := a["to"].(string)
			kind, _ := a["kind"].(string)
			if from == "" || to == "" {
				return mcp.NewToolResultError("from and to are required"), nil
			}
			// Enum validation before shell call — matches ticket.sh validation.
			switch kind {
			case "pr", "relates_to", "blocks", "blocked_by", "duplicate_of", "fixes", "fixed_by", "child_of":
			default:
				return mcp.NewToolResultError("kind must be one of: pr, relates_to, blocks, blocked_by, duplicate_of, fixes, fixed_by, child_of"), nil
			}
			return text(runner.RunTicket(
				[]string{"link-tickets", "--from", from, "--to", to, "--kind", kind},
				map[string]string{"BRAND": brandOf(a)},
			))
		},
	)

	s.AddTool(
		mcp.NewTool("get_ticket_links",
			mcp.WithDescription("Gibt alle Dependency-Links eines Tickets zurück: blocks (von diesem Ticket ausgehend), blocked_by (auf dieses Ticket zeigend), relates (symmetrisch), child_of (Elternticket)."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			if id == "" {
				return mcp.NewToolResultError("id is required"), nil
			}
			return text(runner.RunTicket(
				[]string{"get-ticket-links", "--id", id},
				map[string]string{"BRAND": brandOf(a)},
			))
		},
	)
}
