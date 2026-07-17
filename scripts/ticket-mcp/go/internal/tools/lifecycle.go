package tools

import (
	"context"
	"fmt"
	"slices"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"github.com/korczewski/bachelorprojekt/ticket-mcp/internal/runner"
)

func RegisterLifecycleTools(s *server.MCPServer) {
	s.AddTool(
		mcp.NewTool("transition_status",
			mcp.WithDescription("Ändert den Status eines Tickets. Bei done/archived ist resolution erforderlich."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)"),
				mcp.Enum("mentolder", "korczewski")),
			mcp.WithString("status", mcp.Description("triage, planning, plan_staged, backlog, in_progress, in_review, qa_review, blocked, awaiting_deploy, done, archived"),
				mcp.Enum("triage", "planning", "plan_staged", "backlog", "in_progress", "in_review", "qa_review", "blocked", "awaiting_deploy", "done", "archived"),
				mcp.Required(),
			),
			mcp.WithString("resolution", mcp.Description("fixed, shipped, obsolete"),
				mcp.Enum("fixed", "shipped", "obsolete")),
			mcp.WithString("notes", mcp.Description("Optionaler Notiztext")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			brand, _ := a["brand"].(string)
			if brand == "" {
				brand = "mentolder"
			}
			status, _ := a["status"].(string)
			resolution, _ := a["resolution"].(string)
			notes, _ := a["notes"].(string)

			validStatuses := []string{"triage", "planning", "plan_staged", "backlog", "in_progress", "in_review", "qa_review", "blocked", "awaiting_deploy", "done", "archived"}
			if !slices.Contains(validStatuses, status) {
				return mcp.NewToolResultError(fmt.Sprintf("Ungültiger status: %s. Erlaubt: %s", status, strings.Join(validStatuses, ", "))), nil
			}

			args := []string{"update-status", "--id", id, "--status", status}
			if resolution != "" {
				args = append(args, "--resolution", resolution)
			}
			if notes != "" {
				args = append(args, "--notes", notes)
			}
			raw, err := runner.RunTicket(args, map[string]string{"BRAND": brand})
			if err != nil {
				return nil, err
			}
			return mcp.NewToolResultText(strings.TrimSpace(raw)), nil
		},
	)

	s.AddTool(
		mcp.NewTool("add_comment",
			mcp.WithDescription("Fügt einem Ticket einen Kommentar hinzu."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)"),
				mcp.Enum("mentolder", "korczewski")),
			mcp.WithString("body", mcp.Description("Kommentartext (Markdown)"), mcp.Required()),
			mcp.WithString("author", mcp.Description("default: claude-code")),
			mcp.WithString("visibility", mcp.Description("default: internal"),
				mcp.Enum("internal", "public")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			brand, _ := a["brand"].(string)
			if brand == "" {
				brand = "mentolder"
			}
			body, _ := a["body"].(string)
			author, _ := a["author"].(string)
			if author == "" {
				author = "claude-code"
			}
			visibility, _ := a["visibility"].(string)
			if visibility == "" {
				visibility = "internal"
			}
			raw, err := runner.RunTicket(
				[]string{"add-comment", "--id", id, "--body", body, "--author", author, "--visibility", visibility},
				map[string]string{"BRAND": brand},
			)
			if err != nil {
				return nil, err
			}
			return mcp.NewToolResultText(strings.TrimSpace(raw)), nil
		},
	)

	s.AddTool(
		mcp.NewTool("update_fields",
			mcp.WithDescription("Bulk-Patch: ändert title, description oder notes eines Tickets."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)"),
				mcp.Enum("mentolder", "korczewski")),
			mcp.WithString("notes", mcp.Description("Wird an bestehende notes angehängt")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			brand, _ := a["brand"].(string)
			if brand == "" {
				brand = "mentolder"
			}
			notes, _ := a["notes"].(string)
			if notes == "" {
				return mcp.NewToolResultText("Keine Felder zum Aktualisieren angegeben."), nil
			}
			raw, err := runner.RunTicket(
				[]string{"add-comment", "--id", id, "--body", notes, "--author", "ticket-mcp", "--visibility", "internal"},
				map[string]string{"BRAND": brand},
			)
			if err != nil {
				return nil, err
			}
			return mcp.NewToolResultText(strings.TrimSpace(raw)), nil
		},
	)
}
