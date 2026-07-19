package tools

import (
	"context"
	"fmt"
	"os"
	"slices"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"github.com/korczewski/bachelorprojekt/ticket-mcp/internal/runner"
)

func RegisterTriageTools(s *server.MCPServer) {
	s.AddTool(
		mcp.NewTool("triage_ticket",
			mcp.WithDescription("Setzt Triage-Felder eines Tickets: type, severity, priority, attention_mode, status, component."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)"),
				mcp.Enum("mentolder", "korczewski")),
			mcp.WithString("type", mcp.Description("bug, feature, task, project"),
				mcp.Enum("bug", "feature", "task", "project")),
			mcp.WithString("severity", mcp.Description("critical, major, minor, trivial"),
				mcp.Enum("critical", "major", "minor", "trivial")),
			mcp.WithString("priority", mcp.Description("hoch, mittel, niedrig"),
				mcp.Enum("hoch", "mittel", "niedrig")),
			mcp.WithString("attention_mode", mcp.Description("auto, ai_ready, needs_human"),
				mcp.Enum("auto", "ai_ready", "needs_human")),
			mcp.WithString("status", mcp.Description("Ziel-Status z.B. triage, planning, backlog")),
			mcp.WithString("component", mcp.Description("Betroffene Komponente, z.B. website, infra, scripts")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			brand, _ := a["brand"].(string)
			if brand == "" {
				brand = "mentolder"
			}
			mtype, _ := a["type"].(string)
			severity, _ := a["severity"].(string)
			priority, _ := a["priority"].(string)
			attentionMode, _ := a["attention_mode"].(string)
			component, _ := a["component"].(string)
			status, _ := a["status"].(string)
			if status == "" {
				status = "triage"
			}

			validTypes := []string{"bug", "feature", "task", "project"}
			if mtype != "" && !slices.Contains(validTypes, mtype) {
				return mcp.NewToolResultError(fmt.Sprintf("Ungültiger type: %s. Erlaubt: %s", mtype, strings.Join(validTypes, ", "))), nil
			}
			validSeverities := []string{"critical", "major", "minor", "trivial"}
			if severity != "" && !slices.Contains(validSeverities, severity) {
				return mcp.NewToolResultError(fmt.Sprintf("Ungültiger severity: %s. Erlaubt: %s", severity, strings.Join(validSeverities, ", "))), nil
			}
			validPriorities := []string{"hoch", "mittel", "niedrig"}
			if priority != "" && !slices.Contains(validPriorities, priority) {
				return mcp.NewToolResultError(fmt.Sprintf("Ungültiger priority: %s. Erlaubt: %s", priority, strings.Join(validPriorities, ", "))), nil
			}
			validAttentionModes := []string{"auto", "ai_ready", "needs_human"}
			if attentionMode != "" && !slices.Contains(validAttentionModes, attentionMode) {
				return mcp.NewToolResultError(fmt.Sprintf("Ungültiger attention_mode: %s. Erlaubt: %s", attentionMode, strings.Join(validAttentionModes, ", "))), nil
			}

			args := buildTriageArgs(id, status, priority, severity, mtype, attentionMode, component)

			if status == "triage" {
				fmt.Fprintf(os.Stderr, "[triage_ticket debug] id=%s component=%q args=%v\n", id, component, args)
			}
			raw, err := runner.RunTicket(args, map[string]string{"BRAND": brand, "VDA_NONINTERACTIVE": "1"})
			if err != nil {
				return nil, err
			}
			return mcp.NewToolResultText(strings.TrimSpace(raw)), nil
		},
	)

	s.AddTool(
		mcp.NewTool("backfill_ticket_id",
			mcp.WithDescription("Findet Tickets ohne external_id (T-Nummer) und setzt die nächste Sequenznummer."),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)"),
				mcp.Enum("mentolder", "korczewski")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			brand, _ := a["brand"].(string)
			if brand == "" {
				brand = "mentolder"
			}
			raw, err := runner.RunTicket([]string{"backfill-id", "--brand", brand}, map[string]string{"BRAND": brand})
			if err != nil {
				return nil, err
			}
			text := strings.TrimSpace(raw)
			if text == "" {
				text = "Keine Tickets ohne ID gefunden."
			}
			return mcp.NewToolResultText(text), nil
		},
	)
}

// buildTriageArgs assembles the CLI args for `vda.sh ticket triage` from the
// optional triage fields. Only non-empty fields are passed through, so a
// partial triage_ticket call never clobbers unrelated ticket fields (the CLI
// itself only updates columns whose flag was explicitly provided).
func buildTriageArgs(id, status, priority, severity, mtype, attentionMode, component string) []string {
	args := []string{"triage", "--id", id, "--status", status, "--apply", "--no-comment"}
	if priority != "" {
		args = append(args, "--priority", priority)
	}
	if severity != "" {
		args = append(args, "--severity", severity)
	}
	if mtype != "" {
		args = append(args, "--type", mtype)
	}
	if attentionMode != "" {
		args = append(args, "--attention-mode", attentionMode)
	}
	if component != "" {
		args = append(args, "--component", component)
	}
	return args
}
