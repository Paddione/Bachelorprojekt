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

// MISHAP_TRIGGER ist die Anzahl gepufferter Einträge, ab der automatisch ein
// Bundle-Ticket entsteht.
//
// Der Wert muss ÜBER der mittleren Mishap-Zahl eines dev-flow-Zyklus liegen
// (T002383). Jedes Bundle-Ticket verbraucht selbst einen Zyklus; liegt die
// Emissionsrate bei ≥ 1 Bundle pro Zyklus, ist der Rückstand per Konstruktion
// nicht abbaubar. Gemessen am 2026-07-28: bei Schwelle 3 entstanden an einem Tag
// 32 Bundles, 19 blieben offen.
const MISHAP_TRIGGER = 10

// MISHAP_MAX_AGE ist das Alter, ab dem der Buffer auch unterhalb von
// MISHAP_TRIGGER gebündelt wird. Der Schnitt erfolgt periodisch (Factory-Tick,
// siehe scripts/factory/wakeup.sh), nicht mehr am Session-Ende — sonst
// entstünden wieder Ein-Eintrag-Bundles.
const MISHAP_MAX_AGE = 7 * 24 * time.Hour

type MishapEntry struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Component   string `json:"component"`
	Type        string `json:"type"`
	ReportedAt  string `json:"reported_at"`
}

type MishapBundle struct {
	Title       string
	Description string
	Severity    string
	Priority    string
	Areas       string
}

var mishapMu sync.Mutex

// gitCommonDir löst das gemeinsame Git-Verzeichnis eines Checkouts auf.
//
// In einem git-Worktree ist `.git` eine DATEI ("gitdir: …"), kein Verzeichnis —
// ein Schreibversuch nach `<root>/.git/mishap-buffer.json` scheitert dort mit
// ENOTDIR, und writeBuffer verwirft den Fehler stillschweigend. Genau so gingen
// Mishaps aus Worktree-Sessions verloren (T002383, Nebenbefund verifiziert).
//
// `git rev-parse --git-common-dir` zeigt aus jedem Worktree auf dasselbe
// Haupt-`.git`, sodass alle Sessions in denselben Buffer schreiben.
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
	// Fehler nicht verschlucken: ein fehlgeschlagener Write bedeutet verlorene
	// Mishaps, und genau dieses stille Scheitern hat den Worktree-Bug oben so
	// lange verborgen (T002383).
	if err := os.WriteFile(mishapBufferPath(), data, 0644); err != nil {
		fmt.Fprintf(os.Stderr, "[mishap] Buffer-Write nach %s fehlgeschlagen: %v\n", mishapBufferPath(), err)
	}
}

func classifyBundle(entries []MishapEntry) MishapBundle {
	hasCritical := false
	for _, e := range entries {
		if e.Type == "broken" || e.Type == "security" {
			hasCritical = true
			break
		}
	}
	severity := "minor"
	priority := "mittel"
	if hasCritical {
		severity = "major"
		priority = "hoch"
	}
	var components []string
	seen := make(map[string]bool)
	for _, e := range entries {
		c := strings.TrimSpace(e.Component)
		if c != "" && !seen[c] {
			seen[c] = true
			components = append(components, c)
		}
	}
	areas := strings.Join(components, ",")
	title := fmt.Sprintf("Mishap-Bundle: %s (%d Einträge)", strings.Join(components, ", "), len(entries))
	var descParts []string
	for i, e := range entries {
		descParts = append(descParts, fmt.Sprintf(
			"### Mishap %d: %s\n**Typ:** %s | **Komponente:** %s\n\n%s",
			i+1, e.Title, e.Type, e.Component, e.Description,
		))
	}
	description := strings.Join(descParts, "\n\n---\n\n")
	return MishapBundle{
		Title: title, Description: description,
		Severity: severity, Priority: priority, Areas: areas,
	}
}

// createMishapBundleTicket creates one bundled task ticket from the given
// entries via ticket.sh create and returns the parsed external_id.
func createMishapBundleTicket(bundle []MishapEntry, brand string) (string, error) {
	c := classifyBundle(bundle)
	out, err := runner.RunTicket([]string{
		"create",
		"--type", "task",
		"--brand", brand,
		"--title", c.Title,
		"--description", c.Description,
		"--status", "triage",
		"--severity", c.Severity,
		"--priority", c.Priority,
		"--attention-mode", "ai_ready",
		"--areas", c.Areas,
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

func RegisterMishapTools(s *server.MCPServer) {
	s.AddTool(
		mcp.NewTool("report_mishap",
			mcp.WithDescription(fmt.Sprintf(
				"Fügt einen Mishap in den Buffer ein. Bei ≥%d Einträgen wird automatisch ein gebündeltes Ticket mit attention_mode=ai_ready angelegt.",
				MISHAP_TRIGGER,
			)),
			mcp.WithString("title", mcp.Description("Kurztitel des Mishaps"), mcp.Required()),
			mcp.WithString("description", mcp.Description("Ausführliche Beschreibung"), mcp.Required()),
			mcp.WithString("component", mcp.Description("Betroffene Komponente z.B. auth, chat, infra"), mcp.Required()),
			mcp.WithString("type", mcp.Description("Mishap-Typ (broken/security → severity major)"),
				mcp.Enum("broken", "degraded", "suspicious", "security", "drift", "process"),
				mcp.Required(),
			),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)"),
				mcp.Enum("mentolder", "korczewski")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			title, _ := a["title"].(string)
			description, _ := a["description"].(string)
			component, _ := a["component"].(string)
			mtype, _ := a["type"].(string)
			brand, _ := a["brand"].(string)
			if brand == "" {
				brand = "mentolder"
			}

			validTypes := []string{"broken", "degraded", "suspicious", "security", "drift", "process"}
			if !slices.Contains(validTypes, mtype) {
				return mcp.NewToolResultError(fmt.Sprintf("Ungültiger Typ: %s. Erlaubt: %s", mtype, strings.Join(validTypes, ", "))), nil
			}

			entry := MishapEntry{
				Title: title, Description: description,
				Component: component, Type: mtype,
				ReportedAt: time.Now().UTC().Format(time.RFC3339),
			}

			buffer := readBuffer()
			buffer = append(buffer, entry)

			if len(buffer) < MISHAP_TRIGGER {
				writeBuffer(buffer)
				return mcp.NewToolResultText(fmt.Sprintf(
					"Mishap gespeichert (%d/%d). Noch %d bis zum automatischen Bundle-Ticket.",
					len(buffer), MISHAP_TRIGGER, MISHAP_TRIGGER-len(buffer),
				)), nil
			}

			extID, err := createMishapBundleTicket(buffer[:MISHAP_TRIGGER], brand)
			if err != nil {
				writeBuffer(buffer)
				return nil, err
			}

			writeBuffer(buffer[MISHAP_TRIGGER:])

			return mcp.NewToolResultText(fmt.Sprintf(
				"Bundle-Ticket angelegt: %s\nBuffer geleert. Verbleibende Mishaps: %d\n\nTicket landet im nächsten Factory-Tick (attention_mode=ai_ready).",
				extID, len(buffer)-MISHAP_TRIGGER,
			)), nil
		},
	)

	s.AddTool(
		mcp.NewTool("get_mishap_buffer",
			mcp.WithDescription("Zeigt den aktuellen Inhalt des Mishap-Buffers (noch nicht zu Tickets gebündelt)."),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			buffer := readBuffer()
			if len(buffer) == 0 {
				return mcp.NewToolResultText("Mishap-Buffer ist leer."), nil
			}
			var lines []string
			for i, e := range buffer {
				lines = append(lines, fmt.Sprintf("%d. [%s] %s (%s) — %s", i+1, e.Type, e.Title, e.Component, e.ReportedAt))
			}
			return mcp.NewToolResultText(fmt.Sprintf("Buffer: %d/%d Einträge\n\n%s", len(buffer), MISHAP_TRIGGER, strings.Join(lines, "\n"))), nil
		},
	)

	s.AddTool(
		mcp.NewTool("flush_mishap_buffer",
			mcp.WithDescription(fmt.Sprintf(
				"Erzwingt ein Bundle-Ticket aus dem aktuellen Buffer — auch unterhalb der Schwelle von %d Einträgen. Bewusster manueller Schnitt; NICHT routinemäßig am Session-Ende aufrufen, sonst entstehen Ein-Eintrag-Bundles (T002383).",
				MISHAP_TRIGGER,
			)),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)"),
				mcp.Enum("mentolder", "korczewski")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			brand, _ := a["brand"].(string)
			if brand == "" {
				brand = "mentolder"
			}
			buffer := readBuffer()
			if len(buffer) == 0 {
				return mcp.NewToolResultText("Mishap-Buffer ist leer — nichts zu flushen."), nil
			}
			ext, err := createMishapBundleTicket(buffer, brand)
			if err != nil {
				return nil, err
			}
			writeBuffer([]MishapEntry{})
			return mcp.NewToolResultText(fmt.Sprintf("Bundle-Ticket angelegt: %s (%d Mishaps)\nBuffer geleert.", ext, len(buffer))), nil
		},
	)
}

// BufferIsStale entscheidet, ob der Buffer periodisch geschnitten werden soll:
// er hält Einträge und der älteste davon ist mindestens maxAge alt.
//
// Der Schnitt hängt bewusst am Alter, nicht an einer Session-Grenze. Ein
// Session-Ende-Flush erzeugt Ein-Eintrag-Bundles und damit genau die
// Emissionsrate, die T002383 senkt; ein Alters-Schnitt hält den Buffer
// dagegen beschränkt, ohne pro Zyklus ein Ticket zu emittieren.
//
// Einträge ohne parsebares ReportedAt gelten als NICHT alt — ein kaputter
// Zeitstempel darf keinen Flush auslösen.
func BufferIsStale(entries []MishapEntry, now time.Time, maxAge time.Duration) bool {
	for _, e := range entries {
		t, err := time.Parse(time.RFC3339, e.ReportedAt)
		if err != nil {
			continue
		}
		if now.Sub(t) >= maxAge {
			return true
		}
	}
	return false
}

// FlushStaleBuffer ist der periodische Schnitt für den Factory-Tick
// (scripts/factory/wakeup.sh). Er legt nur dann ein Bundle-Ticket an, wenn der
// Buffer nach BufferIsStale überfällig ist, und meldet sonst eine No-Op.
func FlushStaleBuffer(brand string, maxAge time.Duration) (string, error) {
	buffer := readBuffer()
	if len(buffer) == 0 {
		return "", nil
	}
	if !BufferIsStale(buffer, time.Now(), maxAge) {
		return "", nil
	}
	ext, err := createMishapBundleTicket(buffer, brand)
	if err != nil {
		return "", err
	}
	writeBuffer([]MishapEntry{})
	return ext, nil
}
