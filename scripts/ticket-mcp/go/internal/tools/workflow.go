package tools

import (
	"context"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"github.com/korczewski/bachelorprojekt/ticket-mcp/internal/runner"
)

// RegisterWorkflowTools registers thin adapters over the skill-critical
// ticket.sh workflow verbs. Each handler forwards to runner.RunTicket;
// ticket.sh stays the validation/business-logic SSOT, so wrappers are thin.
func RegisterWorkflowTools(s *server.MCPServer) {
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

	// record_phase_event → ticket.sh phase <id> <phase> <state> [--detail] [--driver]
	s.AddTool(
		mcp.NewTool("record_phase_event",
			mcp.WithDescription("Schreibt ein Factory/Devflow-Phasen-Event (tickets.factory_phase_events)."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("phase", mcp.Description("scout|design|plan|implement|verify|deploy"),
				mcp.Enum("scout", "design", "plan", "implement", "verify", "deploy"), mcp.Required()),
			mcp.WithString("state", mcp.Description("entered|done|blocked"),
				mcp.Enum("entered", "done", "blocked"), mcp.Required()),
			mcp.WithString("detail", mcp.Description("Optionaler Detailtext")),
			mcp.WithString("driver", mcp.Description("factory|devflow (default: factory)"),
				mcp.Enum("factory", "devflow")),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			phase, _ := a["phase"].(string)
			state, _ := a["state"].(string)
			args := []string{"phase", id, phase, state}
			if v, _ := a["detail"].(string); v != "" {
				args = append(args, "--detail", v)
			}
			if v, _ := a["driver"].(string); v != "" {
				args = append(args, "--driver", v)
			}
			return text(runner.RunTicket(args, map[string]string{"BRAND": brandOf(a)}))
		},
	)

	// record_grill_answers → ticket.sh grill --id <id> [--questionnaire] (--answer qid=text)… [--no-comment]
	s.AddTool(
		mcp.NewTool("record_grill_answers",
			mcp.WithDescription("Persistiert Grilling-Antworten (tickets.grilling_answers JSONB). 'answers': eine Zeile pro Antwort als qid=text."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("answers", mcp.Description("Antworten, eine pro Zeile: qid=text"), mcp.Required()),
			mcp.WithString("questionnaire", mcp.Description("default: coaching-sessions-v1")),
			mcp.WithBoolean("no_comment", mcp.Description("Kein Timeline-Kommentar (default false)")),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			answers, _ := a["answers"].(string)
			args := []string{"grill", "--id", id}
			if v, _ := a["questionnaire"].(string); v != "" {
				args = append(args, "--questionnaire", v)
			}
			for _, line := range strings.Split(answers, "\n") {
				if line = strings.TrimSpace(line); line != "" {
					args = append(args, "--answer", line)
				}
			}
			if nc, _ := a["no_comment"].(bool); nc {
				args = append(args, "--no-comment")
			}
			return text(runner.RunTicket(args, map[string]string{"BRAND": brandOf(a)}))
		},
	)

	// stage_plan → ticket.sh stage-plan --id --branch --plan
	s.AddTool(
		mcp.NewTool("stage_plan",
			mcp.WithDescription("Stellt ein Ticket in die Kommissionierung (status=plan_staged) mit Branch + Plan-Pfad."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("branch", mcp.Description("Feature/Fix-Branch"), mcp.Required()),
			mcp.WithString("plan", mcp.Description("Plan-Datei-Pfad"), mcp.Required()),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			branch, _ := a["branch"].(string)
			plan, _ := a["plan"].(string)
			return text(runner.RunTicket([]string{"stage-plan", "--id", id, "--branch", branch, "--plan", plan}, map[string]string{"BRAND": brandOf(a)}))
		},
	)

	// create_ticket → ticket.sh create … (returns external_id|uuid, passed through unchanged)
	s.AddTool(
		mcp.NewTool("create_ticket",
			mcp.WithDescription("Legt ein Ticket an. Gibt 'external_id|uuid' zurück (Skills parsen cut -d'|' -f1)."),
			mcp.WithString("type", mcp.Description("bug|feature|task|project"),
				mcp.Enum("bug", "feature", "task", "project"), mcp.Required()),
			mcp.WithString("title", mcp.Description("Ticket-Titel"), mcp.Required()),
			mcp.WithString("description", mcp.Description("Beschreibung (Pflicht in create.sh)"), mcp.Required()),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
			mcp.WithString("priority", mcp.Description("hoch|mittel|niedrig (default mittel)"),
				mcp.Enum("hoch", "mittel", "niedrig")),
			mcp.WithString("severity", mcp.Description("critical|major|minor|trivial"),
				mcp.Enum("critical", "major", "minor", "trivial")),
			mcp.WithString("status", mcp.Description("Start-Status (default triage)")),
			mcp.WithString("attention_mode", mcp.Description("auto|ai_ready|needs_human"),
				mcp.Enum("auto", "ai_ready", "needs_human")),
			mcp.WithString("areas", mcp.Description("Komma-separierte Bereiche z.B. auth,chat")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			brand := brandOf(a)
			typ, _ := a["type"].(string)
			title, _ := a["title"].(string)
			desc, _ := a["description"].(string)
			args := []string{"create", "--type", typ, "--title", title, "--description", desc, "--brand", brand}
			for flag, key := range map[string]string{"--priority": "priority", "--severity": "severity", "--status": "status", "--attention-mode": "attention_mode", "--areas": "areas"} {
				if v, _ := a[key].(string); v != "" {
					args = append(args, flag, v)
				}
			}
			return text(runner.RunTicket(args, map[string]string{"BRAND": brand}))
		},
	)

	// enqueue_ticket → ticket.sh enqueue --id [--branch --plan]
	s.AddTool(
		mcp.NewTool("enqueue_ticket",
			mcp.WithDescription("Reiht ein Ticket in den Software-Factory-Backlog ein (type=feature, status=backlog)."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("branch", mcp.Description("Optionaler Branch")),
			mcp.WithString("plan", mcp.Description("Optionaler Plan-Pfad")),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			args := []string{"enqueue", "--id", id}
			if v, _ := a["branch"].(string); v != "" {
				args = append(args, "--branch", v)
			}
			if v, _ := a["plan"].(string); v != "" {
				args = append(args, "--plan", v)
			}
			return text(runner.RunTicket(args, map[string]string{"BRAND": brandOf(a)}))
		},
	)

	// set_touched_files → ticket.sh set-touched-files --id --files
	s.AddTool(
		mcp.NewTool("set_touched_files",
			mcp.WithDescription("Setzt die touched_files eines Tickets (Konflikt-/Scope-Tracking)."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("files", mcp.Description("Komma- oder Whitespace-getrennte Pfade (wie ticket.sh erwartet)"), mcp.Required()),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			files, _ := a["files"].(string)
			return text(runner.RunTicket([]string{"set-touched-files", "--id", id, "--files", files}, map[string]string{"BRAND": brandOf(a)}))
		},
	)

	// get_attachments → ticket.sh get-attachments --id --out-dir  (out_dir is REQUIRED)
	s.AddTool(
		mcp.NewTool("get_attachments",
			mcp.WithDescription("Lädt die Attachments eines Tickets in ein Zielverzeichnis (out_dir Pflicht)."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("out_dir", mcp.Description("Zielverzeichnis (wird angelegt)"), mcp.Required()),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			outDir, _ := a["out_dir"].(string)
			return text(runner.RunTicket([]string{"get-attachments", "--id", id, "--out-dir", outDir}, map[string]string{"BRAND": brandOf(a)}))
		},
	)

	// archive_plan → ticket.sh archive-plan --id --slug --branch --plan-file [--pr]
	s.AddTool(
		mcp.NewTool("archive_plan",
			mcp.WithDescription("Archiviert einen Plan und mergt den Delta-Spec in die SSOT."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("slug", mcp.Description("OpenSpec-Change-Slug"), mcp.Required()),
			mcp.WithString("branch", mcp.Description("Feature/Fix-Branch"), mcp.Required()),
			mcp.WithString("plan_file", mcp.Description("Pfad zur Plan-Datei"), mcp.Required()),
			mcp.WithString("pr", mcp.Description("Optionale PR-Nummer (integer)")),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			slug, _ := a["slug"].(string)
			branch, _ := a["branch"].(string)
			planFile, _ := a["plan_file"].(string)
			args := []string{"archive-plan", "--id", id, "--slug", slug, "--branch", branch, "--plan-file", planFile}
			if v, _ := a["pr"].(string); v != "" {
				args = append(args, "--pr", v)
			}
			return text(runner.RunTicket(args, map[string]string{"BRAND": brandOf(a)}))
		},
	)

	// add_pr_link → ticket.sh add-pr-link --id --pr  (pr must be integer; ticket.sh validates)
	s.AddTool(
		mcp.NewTool("add_pr_link",
			mcp.WithDescription("Verknüpft eine PR-Nummer mit einem Ticket (tickets.ticket_links kind=pr)."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("pr", mcp.Description("PR-Nummer (integer)"), mcp.Required()),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			pr, _ := a["pr"].(string)
			return text(runner.RunTicket([]string{"add-pr-link", "--id", id, "--pr", pr}, map[string]string{"BRAND": brandOf(a)}))
		},
	)
}
