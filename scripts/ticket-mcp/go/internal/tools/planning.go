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

func RegisterPlanningTools(s *server.MCPServer) {
	s.AddTool(
		mcp.NewTool("set_plan_meta",
			mcp.WithDescription("Setzt Planungs-Metadaten: value_prop, effort, areas, depends_on, planning_rank."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
			mcp.WithString("value_prop", mcp.Description("Kern-Nutzen des Features")),
			mcp.WithString("effort", mcp.Description("klein, mittel, gross"),
				mcp.Enum("klein", "mittel", "gross")),
			mcp.WithString("areas", mcp.Description("Komma-separierte Bereiche z.B. auth,chat")),
			mcp.WithString("depends_on", mcp.Description("Komma-separierte Ticket-IDs z.B. T000100,T000101")),
			mcp.WithInteger("rank", mcp.Description("Planungs-Rang (niedrig = höhere Prio)")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			brand, _ := a["brand"].(string)
			if brand == "" {
				brand = "mentolder"
			}
			valueProp, _ := a["value_prop"].(string)
			effort, _ := a["effort"].(string)
			areas, _ := a["areas"].(string)
			dependsOn, _ := a["depends_on"].(string)
			var rank *int
			if v, ok := a["rank"].(float64); ok {
				r := int(v)
				rank = &r
			}

			validEfforts := []string{"klein", "mittel", "gross"}
			if effort != "" && !slices.Contains(validEfforts, effort) {
				return mcp.NewToolResultError(fmt.Sprintf("Ungültiger effort: %s. Erlaubt: %s", effort, strings.Join(validEfforts, ", "))), nil
			}

			args := []string{"plan-meta", "set", "--id", id}
			if valueProp != "" {
				args = append(args, "--value-prop", valueProp)
			}
			if effort != "" {
				args = append(args, "--effort", effort)
			}
			if areas != "" {
				args = append(args, "--areas", areas)
			}
			if dependsOn != "" {
				args = append(args, "--depends-on", dependsOn)
			}
			if rank != nil {
				args = append(args, "--rank", fmt.Sprintf("%d", *rank))
			}

			raw, err := runner.RunTicket(args, map[string]string{"BRAND": brand})
			if err != nil {
				return nil, err
			}
			return mcp.NewToolResultText(strings.TrimSpace(raw)), nil
		},
	)

	s.AddTool(
		mcp.NewTool("set_readiness_flag",
			mcp.WithDescription("Setzt ein einzelnes Readiness-Flag (spec_skizziert, abhaengigkeiten_klar, offene_fragen_geklaert, aufwand_geschaetzt, lastenheft_locked)."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
			mcp.WithString("flag", mcp.Description("spec_skizziert, abhaengigkeiten_klar, offene_fragen_geklaert, aufwand_geschaetzt, lastenheft_locked"),
				mcp.Enum("spec_skizziert", "abhaengigkeiten_klar", "offene_fragen_geklaert", "aufwand_geschaetzt", "lastenheft_locked"),
				mcp.Required(),
			),
			mcp.WithBoolean("value", mcp.Description("true oder false"), mcp.Required()),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			brand, _ := a["brand"].(string)
			if brand == "" {
				brand = "mentolder"
			}
			flag, _ := a["flag"].(string)
			value, _ := a["value"].(bool)

			validFlags := []string{"spec_skizziert", "abhaengigkeiten_klar", "offene_fragen_geklaert", "aufwand_geschaetzt", "lastenheft_locked"}
			if !slices.Contains(validFlags, flag) {
				return mcp.NewToolResultError(fmt.Sprintf("Ungültiger flag: %s. Erlaubt: %s", flag, strings.Join(validFlags, ", "))), nil
			}

			readiness := fmt.Sprintf("%s=%t", flag, value)
			raw, err := runner.RunTicket(
				[]string{"plan-meta", "set", "--id", id, "--readiness", readiness},
				map[string]string{"BRAND": brand},
			)
			if err != nil {
				return nil, err
			}
			return mcp.NewToolResultText(strings.TrimSpace(raw)), nil
		},
	)

	s.AddTool(
		mcp.NewTool("prepare_feature",
			mcp.WithDescription("Convenience: setzt alle Pflichtfelder für ein Feature-Ticket in einem Call und transitioniert zu planning. Führt intern set_plan_meta + alle Readiness-Flags + transition_status(planning) aus."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
			mcp.WithString("priority", mcp.Description("wird nicht an ticket.sh plan-meta durchgereicht (das Verb akzeptiert priority/severity nicht)"),
				mcp.Enum("hoch", "mittel", "niedrig")),
			mcp.WithString("severity", mcp.Description("wird nicht an ticket.sh plan-meta durchgereicht (das Verb akzeptiert priority/severity nicht)"),
				mcp.Enum("critical", "major", "minor", "trivial")),
			mcp.WithString("attention_mode", mcp.Description("auto, ai_ready, needs_human"),
				mcp.Enum("auto", "ai_ready", "needs_human")),
			mcp.WithString("value_prop", mcp.Description("Kern-Nutzen des Features")),
			mcp.WithString("effort", mcp.Description("klein, mittel, gross"),
				mcp.Enum("klein", "mittel", "gross")),
			mcp.WithString("areas", mcp.Description("Komma-separierte Bereiche z.B. auth,chat")),
			mcp.WithString("depends_on", mcp.Description("Komma-separierte Ticket-IDs z.B. T000100,T000101")),
			mcp.WithBoolean("spec_skizziert", mcp.Description("Readiness-Flag")),
			mcp.WithBoolean("abhaengigkeiten_klar", mcp.Description("Readiness-Flag")),
			mcp.WithBoolean("offene_fragen_geklaert", mcp.Description("Readiness-Flag")),
			mcp.WithBoolean("aufwand_geschaetzt", mcp.Description("Readiness-Flag")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			brand, _ := a["brand"].(string)
			if brand == "" {
				brand = "mentolder"
			}
			valueProp, _ := a["value_prop"].(string)
			effort, _ := a["effort"].(string)
			areas, _ := a["areas"].(string)
			dependsOn, _ := a["depends_on"].(string)
			attentionMode, _ := a["attention_mode"].(string)
			specSkizziert, specOk := a["spec_skizziert"].(bool)
			abhaengigkeitenKlar, abhOk := a["abhaengigkeiten_klar"].(bool)
			offeneFragenGeklaert, offenOk := a["offene_fragen_geklaert"].(bool)
			aufwandGeschaetzt, aufwOk := a["aufwand_geschaetzt"].(bool)

			var logLines []string
			env := map[string]string{"BRAND": brand}

			// priority/severity are declared for caller convenience but plan-meta does not accept them, so they are intentionally not forwarded.

			metaArgs := []string{"plan-meta", "set", "--id", id}
			if valueProp != "" {
				metaArgs = append(metaArgs, "--value-prop", valueProp)
			}
			if effort != "" {
				metaArgs = append(metaArgs, "--effort", effort)
			}
			if areas != "" {
				metaArgs = append(metaArgs, "--areas", areas)
			}
			if dependsOn != "" {
				metaArgs = append(metaArgs, "--depends-on", dependsOn)
			}
			if len(metaArgs) > 4 {
				r, err := runner.RunTicket(metaArgs, env)
				if err != nil {
					logLines = append(logLines, fmt.Sprintf("FEHLER plan-meta: %s", err.Error()))
				} else {
					logLines = append(logLines, strings.TrimSpace(r))
				}
			}

			flags := []struct {
				name string
				val  bool
				set  bool
			}{
				{"spec_skizziert", specSkizziert, specOk},
				{"abhaengigkeiten_klar", abhaengigkeitenKlar, abhOk},
				{"offene_fragen_geklaert", offeneFragenGeklaert, offenOk},
				{"aufwand_geschaetzt", aufwandGeschaetzt, aufwOk},
			}
			for _, f := range flags {
				if !f.set {
					continue
				}
				r, err := runner.RunTicket(
					[]string{"plan-meta", "set", "--id", id, "--readiness", fmt.Sprintf("%s=%t", f.name, f.val)},
					env,
				)
				if err != nil {
					logLines = append(logLines, fmt.Sprintf("FEHLER readiness %s: %s", f.name, err.Error()))
				} else {
					logLines = append(logLines, strings.TrimSpace(r))
				}
			}

			if attentionMode != "" {
				r, err := runner.RunTicket(
					[]string{"inject", "--id", id, "--fields", fmt.Sprintf("attention_mode=%s", attentionMode)},
					env,
				)
				if err != nil {
					logLines = append(logLines, fmt.Sprintf("FEHLER attention_mode: %s", err.Error()))
				} else {
					logLines = append(logLines, strings.TrimSpace(r))
				}
			}

			r, err := runner.RunTicket(
				[]string{"update-status", "--id", id, "--status", "planning"},
				env,
			)
			if err != nil {
				logLines = append(logLines, fmt.Sprintf("FEHLER status: %s", err.Error()))
			} else {
				logLines = append(logLines, strings.TrimSpace(r))
			}

			var filtered []string
			for _, l := range logLines {
				if l != "" {
					filtered = append(filtered, l)
				}
			}
			return mcp.NewToolResultText(strings.Join(filtered, "\n")), nil
		},
	)
}
