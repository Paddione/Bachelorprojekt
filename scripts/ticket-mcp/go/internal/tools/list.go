package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"github.com/korczewski/bachelorprojekt/ticket-mcp/internal/runner"
)

func getArgs(req mcp.CallToolRequest) map[string]any {
	if args, ok := req.Params.Arguments.(map[string]any); ok {
		return args
	}
	return map[string]any{}
}

func RegisterListTools(s *server.MCPServer) {
	s.AddTool(
		mcp.NewTool("list_tickets",
			mcp.WithDescription("Listet Tickets gefiltert nach Status, Typ, Brand oder fehlender ID. Standard-Limit 200 Zeilen, neueste zuerst (created_at DESC); mit --limit erhöhbar (max 1000)."),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)"),
				mcp.Enum("mentolder", "korczewski")),
			mcp.WithString("status", mcp.Description("z.B. triage, planning, plan_staged, backlog")),
			mcp.WithString("type", mcp.Description("bug, feature, task, project"),
				mcp.Enum("bug", "feature", "task", "project")),
			mcp.WithString("attention_mode", mcp.Description("auto, ai_ready, needs_human"),
				mcp.Enum("auto", "ai_ready", "needs_human")),
			mcp.WithBoolean("missing_id", mcp.Description("Nur Tickets ohne external_id zurückgeben")),
			mcp.WithInteger("limit", mcp.Description("Maximale Anzahl Ergebnisse (default: 200)"), mcp.Min(1), mcp.Max(1000)),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			brand, _ := a["brand"].(string)
			if brand == "" {
				brand = "mentolder"
			}
			status, _ := a["status"].(string)
			mtype, _ := a["type"].(string)
			attentionMode, _ := a["attention_mode"].(string)
			missingID, _ := a["missing_id"].(bool)
			limit := 200
			if v, ok := a["limit"].(float64); ok {
				limit = int(v)
			}

			args := []string{"list", "--brand", brand, "--limit", fmt.Sprintf("%d", limit)}
			if status != "" {
				args = append(args, "--status", status)
			}
			if mtype != "" {
				args = append(args, "--type", mtype)
			}
			if attentionMode != "" {
				args = append(args, "--attention-mode", attentionMode)
			}
			if missingID {
				args = append(args, "--missing-id")
			}

			raw, err := runner.RunTicket(args, map[string]string{"BRAND": brand})
			if err != nil {
				return nil, err
			}
			return mcp.NewToolResultText(strings.TrimSpace(raw)), nil
		},
	)

	s.AddTool(
		mcp.NewTool("get_ticket",
			mcp.WithDescription("Gibt vollständige Details eines Tickets per external_id zurück."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)"),
				mcp.Enum("mentolder", "korczewski")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			brand, _ := a["brand"].(string)
			if brand == "" {
				brand = "mentolder"
			}
			raw, err := runner.RunTicket([]string{"get", "--id", id}, map[string]string{"BRAND": brand})
			if err != nil {
				return nil, err
			}
			return mcp.NewToolResultText(strings.TrimSpace(raw)), nil
		},
	)

	s.AddTool(
		mcp.NewTool("export_tickets",
			mcp.WithDescription("Exportiert Tickets als JSON oder Markdown (gleiche Filter wie list_tickets). Default-Limit 200, neueste zuerst (created_at DESC); max 1000. Ohne Filter empfiehlt sich ein Status-Filter, um den Kontextverbrauch gering zu halten."),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)"),
				mcp.Enum("mentolder", "korczewski")),
			mcp.WithString("status", mcp.Description("z.B. triage, planning, plan_staged, backlog")),
			mcp.WithString("type", mcp.Description("bug, feature, task, project"),
				mcp.Enum("bug", "feature", "task", "project")),
			mcp.WithString("format", mcp.Description("json (default) oder markdown"),
				mcp.Enum("json", "markdown")),
			mcp.WithInteger("limit", mcp.Description("Maximale Anzahl Ergebnisse (default: 200)"), mcp.Min(1), mcp.Max(1000)),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			brand, _ := a["brand"].(string)
			if brand == "" {
				brand = "mentolder"
			}
			status, _ := a["status"].(string)
			mtype, _ := a["type"].(string)
			format, _ := a["format"].(string)
			if format == "" {
				format = "json"
			}
			limit := 200
			if v, ok := a["limit"].(float64); ok {
				limit = int(v)
			}

			args := []string{"list", "--brand", brand, "--limit", fmt.Sprintf("%d", limit)}
			if status != "" {
				args = append(args, "--status", status)
			}
			if mtype != "" {
				args = append(args, "--type", mtype)
			}

			raw, err := runner.RunTicket(args, map[string]string{"BRAND": brand})
			if err != nil {
				return nil, err
			}

			if format == "markdown" {
				var tickets []struct {
					ExternalID *string `json:"external_id"`
					Status     string  `json:"status"`
					Title      string  `json:"title"`
				}
				trimmed := strings.TrimSpace(raw)
				if err := json.Unmarshal([]byte(trimmed), &tickets); err != nil {
					return mcp.NewToolResultError(fmt.Sprintf("Fehler beim Parsen der Tickets: %s", err.Error())), nil
				}
				if len(tickets) == 0 {
					return mcp.NewToolResultText("_(keine Tickets)_"), nil
				}
				var lines []string
				for _, t := range tickets {
					eid := "(kein ID)"
					if t.ExternalID != nil {
						eid = *t.ExternalID
					}
					lines = append(lines, fmt.Sprintf("- **%s** [%s] %s", eid, t.Status, t.Title))
				}
				return mcp.NewToolResultText(strings.Join(lines, "\n")), nil
			}

			return mcp.NewToolResultText(strings.TrimSpace(raw)), nil
		},
	)

	s.AddTool(
		mcp.NewTool("export_ticket_timeline",
			mcp.WithDescription("Exportiert die vollständige Ticket-History als chronologisches JSON. Quellen: Kommentare (ticket_comments), Factory-Phasen (factory_phase_events), PR-Links (ticket_links kind=pr), archivierte Pläne (ticket_plans). HINWEIS: CLI-Statusübergänge via ticket.sh update-status erscheinen nicht in der Timeline (bekannte Lücke — Follow-up-Ticket erforderlich)."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)"),
				mcp.Enum("mentolder", "korczewski")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			brand, _ := a["brand"].(string)
			if brand == "" {
				brand = "mentolder"
			}
			if id == "" {
				return mcp.NewToolResultError("id is required"), nil
			}
			raw, err := runner.RunTicket(
				[]string{"get-timeline", "--id", id, "--brand", brand},
				map[string]string{"BRAND": brand},
			)
			if err != nil {
				return nil, err
			}
			return mcp.NewToolResultText(strings.TrimSpace(raw)), nil
		},
	)
}
