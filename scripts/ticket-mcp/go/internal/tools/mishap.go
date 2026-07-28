package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"github.com/korczewski/bachelorprojekt/ticket-mcp/internal/runner"
)

const MISHAP_TRIGGER = 10
const MISHAP_MAX_AGE = 7 * 24 * time.Hour

const ROLLUP_TICKET_TITLE = "Mishap Rollup — fortlaufende Sammlung"
const ROLLUP_BRANCH = "chore/mishap-rollup"
const ROLLUP_CHANGE_DIR = "openspec/changes/mishap-rollup"

type MishapEntry struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Component   string `json:"component"`
	Type        string `json:"type"`
	ReportedAt  string `json:"reported_at"`
}

var mishapMu sync.Mutex

func gitCommonDir(root string) string {
	cmd := exec.Command("git", "rev-parse", "--git-common-dir")
	cmd.Dir = root
	out, err := cmd.Output()
	if err != nil {
		return filepath.Join(root, ".git")
	}
	dir := strings.TrimSpace(string(out))
	if dir == "" {
		return filepath.Join(root, ".git")
	}
	if !filepath.IsAbs(dir) {
		dir = filepath.Join(root, dir)
	}
	return dir
}

func mishapBufferPath() string {
	return filepath.Join(gitCommonDir(runner.RepoRoot()), "mishap-buffer.json")
}

func readBuffer() []MishapEntry {
	mishapMu.Lock()
	defer mishapMu.Unlock()
	data, err := os.ReadFile(mishapBufferPath())
	if err != nil {
		return []MishapEntry{}
	}
	var entries []MishapEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		return []MishapEntry{}
	}
	return entries
}

func writeBuffer(entries []MishapEntry) {
	data, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return
	}
	if err := os.WriteFile(mishapBufferPath(), data, 0644); err != nil {
		fmt.Fprintf(os.Stderr, "[mishap] Buffer-Write nach %s fehlgeschlagen: %v\n", mishapBufferPath(), err)
	}
}

func isIncidentType(mtype string) bool {
	return mtype == "incident" || mtype == "broken" || mtype == "security"
}

func createIncidentTicket(entry MishapEntry, brand string) (string, error) {
	out, err := runner.RunTicket([]string{
		"create", "--type", "task", "--brand", brand,
		"--title", fmt.Sprintf("Mishap-Incident: %s", entry.Title),
		"--description", fmt.Sprintf("### Incident\n\n**Typ:** %s | **Komponente:** %s\n\n%s", entry.Type, entry.Component, entry.Description),
		"--status", "triage", "--severity", "major", "--priority", "hoch",
		"--attention-mode", "needs_human", "--areas", entry.Component,
	}, map[string]string{"BRAND": brand})
	if err != nil {
		return "", err
	}
	ext := strings.TrimSpace(out)
	if i := strings.Index(ext, "|"); i >= 0 {
		ext = ext[:i]
	}
	return ext, nil
}

func findOrCreateRollupTicket(brand string) (string, error) {
	raw, err := runner.RunTicket([]string{
		"list", "--brand", brand, "--status", "triage", "--type", "task", "--limit", "200",
	}, map[string]string{"BRAND": brand})
	if err != nil {
		return "", fmt.Errorf("Rollup-Container-Suche fehlgeschlagen: %w", err)
	}
	var tickets []struct {
		ExternalID *string `json:"external_id"`
		Title      string  `json:"title"`
	}
	if err := json.Unmarshal([]byte(strings.TrimSpace(raw)), &tickets); err == nil {
		for _, t := range tickets {
			if t.ExternalID != nil && t.Title == ROLLUP_TICKET_TITLE {
				return *t.ExternalID, nil
			}
		}
	}
	out, err := runner.RunTicket([]string{
		"create", "--type", "task", "--brand", brand,
		"--title", ROLLUP_TICKET_TITLE,
		"--description", "Fortlaufende Sammlung nicht-kritischer Mishaps. Dieses Ticket bleibt dauerhaft offen.",
		"--status", "triage", "--severity", "minor",
	}, map[string]string{"BRAND": brand})
	if err != nil {
		return "", fmt.Errorf("Rollup-Container-Erstellung fehlgeschlagen: %w", err)
	}
	ext := strings.TrimSpace(out)
	if i := strings.Index(ext, "|"); i >= 0 {
		ext = ext[:i]
	}
	return ext, nil
}

func appendToRollupContainer(entries []MishapEntry, brand string) error {
	if len(entries) == 0 {
		return nil
	}
	containerID, err := findOrCreateRollupTicket(brand)
	if err != nil {
		return err
	}
	var lines []string
	lines = append(lines, fmt.Sprintf("### Mishap-Rollup — %d Eintraege (%s)", len(entries), time.Now().UTC().Format("2006-01-02 15:04 UTC")))
	lines = append(lines, "")
	lines = append(lines, "| # | Typ | Komponente | Titel |")
	lines = append(lines, "|---|---|---|---|")
	for i, e := range entries {
		lines = append(lines, fmt.Sprintf("| %d | %s | %s | %s |", i+1, e.Type, e.Component, e.Title))
	}
	lines = append(lines, "")
	for i, e := range entries {
		lines = append(lines, fmt.Sprintf("**%d. %s** (%s, %s)\n\n%s", i+1, e.Title, e.Type, e.Component, e.Description))
	}
	body := strings.Join(lines, "\n")
	_, err = runner.RunTicket([]string{
		"add-comment", "--id", containerID, "--body", body, "--author", "ticket-mcp", "--visibility", "internal",
	}, map[string]string{"BRAND": brand})
	if err != nil {
		return fmt.Errorf("Rollup-Comment fehlgeschlagen: %w", err)
	}
	return nil
}

func RegisterMishapTools(s *server.MCPServer) {
	s.AddTool(
		mcp.NewTool("report_mishap",
			mcp.WithDescription(fmt.Sprintf("Fuegt einen Mishap in den Buffer ein. Incident-Typen erzeugen sofort ein Ticket. Bei >=%d nicht-kritischen Eintraegen: Rollup-Container-Append.", MISHAP_TRIGGER)),
			mcp.WithString("title", mcp.Description("Kurztitel"), mcp.Required()),
			mcp.WithString("description", mcp.Description("Beschreibung"), mcp.Required()),
			mcp.WithString("component", mcp.Description("Komponente"), mcp.Required()),
			mcp.WithString("type", mcp.Description("incident (sofort Ticket) | degraded, suspicious, drift, process"),
				mcp.Enum("incident", "broken", "degraded", "suspicious", "security", "drift", "process"), mcp.Required()),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski"), mcp.Enum("mentolder", "korczewski")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			title, _ := a["title"].(string)
			description, _ := a["description"].(string)
			component, _ := a["component"].(string)
			mtype, _ := a["type"].(string)
			brand, _ := a["brand"].(string)
			if brand == "" { brand = "mentolder" }
			validTypes := []string{"incident", "broken", "degraded", "suspicious", "security", "drift", "process"}
			if !slices.Contains(validTypes, mtype) {
				return mcp.NewToolResultError(fmt.Sprintf("Ungueltiger Typ: %s. Erlaubt: %s", mtype, strings.Join(validTypes, ", "))), nil
			}
			entry := MishapEntry{Title: title, Description: description, Component: component, Type: mtype, ReportedAt: time.Now().UTC().Format(time.RFC3339)}
			if isIncidentType(mtype) {
				extID, err := createIncidentTicket(entry, brand)
				if err != nil { return nil, err }
				return mcp.NewToolResultText(fmt.Sprintf("Incident-Ticket angelegt: %s (attention_mode=needs_human). Kein Buffer-Eintrag.", extID)), nil
			}
			buffer := readBuffer()
			buffer = append(buffer, entry)
			if len(buffer) < MISHAP_TRIGGER {
				writeBuffer(buffer)
				return mcp.NewToolResultText(fmt.Sprintf("Mishap gespeichert (%d/%d). Noch %d bis zum Rollup-Container-Append.", len(buffer), MISHAP_TRIGGER, MISHAP_TRIGGER-len(buffer))), nil
			}
			if err := appendToRollupContainer(buffer[:MISHAP_TRIGGER], brand); err != nil {
				writeBuffer(buffer)
				return nil, err
			}
			writeBuffer(buffer[MISHAP_TRIGGER:])
			remaining := len(buffer) - MISHAP_TRIGGER
			return mcp.NewToolResultText(fmt.Sprintf("Rollup-Container-Append: %d Mishaps an den Container angehaengt. Verbleibend: %d.", MISHAP_TRIGGER, remaining)), nil
		},
	)
	s.AddTool(
		mcp.NewTool("get_mishap_buffer", mcp.WithDescription("Zeigt den aktuellen Inhalt des Mishap-Buffers.")),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			buffer := readBuffer()
			if len(buffer) == 0 { return mcp.NewToolResultText("Mishap-Buffer ist leer."), nil }
			var lines []string
			for i, e := range buffer {
				lines = append(lines, fmt.Sprintf("%d. [%s] %s (%s) — %s", i+1, e.Type, e.Title, e.Component, e.ReportedAt))
			}
			return mcp.NewToolResultText(fmt.Sprintf("Buffer: %d/%d Eintraege\n\n%s", len(buffer), MISHAP_TRIGGER, strings.Join(lines, "\n"))), nil
		},
	)
	s.AddTool(
		mcp.NewTool("flush_mishap_buffer", mcp.WithDescription(fmt.Sprintf("Erzwingt einen Append des Buffers an den Rollup-Container, auch unterhalb %d Eintraege.", MISHAP_TRIGGER)),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski"), mcp.Enum("mentolder", "korczewski")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			brand, _ := a["brand"].(string)
			if brand == "" { brand = "mentolder" }
			buffer := readBuffer()
			if len(buffer) == 0 { return mcp.NewToolResultText("Mishap-Buffer ist leer."), nil }
			if err := appendToRollupContainer(buffer, brand); err != nil { return nil, err }
			writeBuffer([]MishapEntry{})
			return mcp.NewToolResultText(fmt.Sprintf("%d Mishaps an den Rollup-Container angehaengt. Buffer geleert.", len(buffer))), nil
		},
	)
}

func BufferIsStale(entries []MishapEntry, now time.Time, maxAge time.Duration) bool {
	for _, e := range entries {
		t, err := time.Parse(time.RFC3339, e.ReportedAt)
		if err != nil { continue }
		if now.Sub(t) >= maxAge { return true }
	}
	return false
}

func FlushStaleBuffer(brand string, maxAge time.Duration) (string, error) {
	buffer := readBuffer()
	if len(buffer) == 0 { return "", nil }
	if !BufferIsStale(buffer, time.Now(), maxAge) { return "", nil }
	if err := appendToRollupContainer(buffer, brand); err != nil { return "", err }
	writeBuffer([]MishapEntry{})
	return "rollup-container", nil
}
