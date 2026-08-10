package tools

// Prüfmodus: COMMAND OUTPUT VERIFICATION (CLAUDE.md → Test-Resultats-Konvention).
// Die Tests führen den echten Abflusspfad aus und prüfen das Aufruflog eines
// ticket.sh-Stubs — sie greppen NICHT den Quelltext von mishap.go.
//
// SSOT: openspec/specs/mishap-tracking.md
//   Requirement "Der Mishap-Buffer aggregiert, er konvertiert nicht"
//   Scenario   "Watchdog-Flush verhält sich wie der Schwellwert-Pfad"

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// newStubRepo baut ein isoliertes Repo-Wurzelverzeichnis mit einem ticket.sh-Stub,
// der jeden Aufruf zeilenweise protokolliert. Rückgabe: Pfad der Logdatei.
//
// Der Stub beantwortet die beiden Aufrufe, auf deren Rückgabewert der Produktivcode
// angewiesen ist:
//   - `rollup-container` → "T009999|00000000-0000-0000-0000-000000000000"
//   - `list`            → "[]" (kein offenes Ticket gleichen Titels; Dedupe-Guard)
//
// Alles andere gibt leer zurück. Damit läuft appendToRollupContainer durch, ohne
// eine Datenbank zu berühren.
func newStubRepo(t *testing.T) (repoRoot, logPath string) {
	t.Helper()
	repoRoot = t.TempDir()

	// gitCommonDir() fällt ohne Git-Repo auf <root>/.git zurück — das Verzeichnis
	// muss existieren, sonst schlägt der Buffer-Write fehl.
	if err := os.MkdirAll(filepath.Join(repoRoot, ".git"), 0o755); err != nil {
		t.Fatalf("git-Verzeichnis anlegen: %v", err)
	}

	logPath = filepath.Join(repoRoot, "ticket-calls.log")
	stub := filepath.Join(repoRoot, "ticket-stub.sh")
	script := `#!/usr/bin/env bash
printf '%s\n' "$*" >> "` + logPath + `"
case "$1" in
  rollup-container) printf 'T009999|00000000-0000-0000-0000-000000000000\n' ;;
  list)             printf '[]\n' ;;
  create)           printf 'T009998|00000000-0000-0000-0000-000000000001\n' ;;
esac
exit 0
`
	if err := os.WriteFile(stub, []byte(script), 0o755); err != nil {
		t.Fatalf("Stub schreiben: %v", err)
	}

	t.Setenv("TICKET_MCP_REPO_ROOT", repoRoot)
	t.Setenv("TICKET_SH", stub)
	return repoRoot, logPath
}

// seedStaleBuffer legt n überalterte, nicht-kritische Mishap-Einträge in den Buffer.
func seedStaleBuffer(t *testing.T, n int) {
	t.Helper()
	stale := time.Now().UTC().Add(-48 * time.Hour).Format(time.RFC3339)
	entries := make([]MishapEntry, 0, n)
	for i := 0; i < n; i++ {
		entries = append(entries, MishapEntry{
			Title:       "Mishap-Eintrag " + string(rune('A'+i)),
			Description: "Beschreibung",
			Component:   "scripts",
			Type:        "drift",
			ReportedAt:  stale,
		})
	}
	data, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		t.Fatalf("Buffer serialisieren: %v", err)
	}
	if err := os.WriteFile(mishapBufferPath(), data, 0o644); err != nil {
		t.Fatalf("Buffer schreiben nach %s: %v", mishapBufferPath(), err)
	}
}

func readCalls(t *testing.T, logPath string) []string {
	t.Helper()
	data, err := os.ReadFile(logPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		t.Fatalf("Aufruflog lesen: %v", err)
	}
	var calls []string
	for _, line := range strings.Split(strings.TrimSpace(string(data)), "\n") {
		if strings.TrimSpace(line) != "" {
			calls = append(calls, line)
		}
	}
	return calls
}

func countCallsWithPrefix(calls []string, prefix string) int {
	n := 0
	for _, c := range calls {
		if strings.HasPrefix(c, prefix) {
			n++
		}
	}
	return n
}

// TestFlushStaleBuffer_AppendsOnceAndCreatesNoTickets deckt das SSOT-Szenario
// "Watchdog-Flush verhält sich wie der Schwellwert-Pfad" ab.
func TestFlushStaleBuffer_AppendsOnceAndCreatesNoTickets(t *testing.T) {
	_, logPath := newStubRepo(t)
	seedStaleBuffer(t, 10)

	if _, err := FlushStaleBuffer("mentolder", time.Hour); err != nil {
		t.Fatalf("FlushStaleBuffer: %v", err)
	}

	calls := readCalls(t, logPath)

	// POSITIV-ANKER (CLAUDE.md → Positiv-Anker-Pflicht bei Negativtests):
	// Erst belegen, dass der Abflusspfad überhaupt gelaufen ist. Ohne diesen
	// Anker wäre die Negativ-Aussage unten bei einem stillen Frühabbruch vakuos.
	if got := countCallsWithPrefix(calls, "rollup-container"); got != 1 {
		t.Fatalf("genau ein Rollup-Container-Aufruf erwartet, gefunden %d\nAufruflog:\n%s",
			got, strings.Join(calls, "\n"))
	}
	if got := countCallsWithPrefix(calls, "add-comment"); got != 1 {
		t.Fatalf("genau ein add-comment (der Rollup-Append) erwartet, gefunden %d\nAufruflog:\n%s",
			got, strings.Join(calls, "\n"))
	}

	// Die eigentliche Zusicherung: null Einzeltickets.
	if got := countCallsWithPrefix(calls, "create --type fix"); got != 0 {
		t.Errorf("null Aufrufe mit 'create --type fix' erwartet, gefunden %d — der Buffer "+
			"konvertiert statt zu aggregieren (openspec/specs/mishap-tracking.md:39)\nAufruflog:\n%s",
			got, strings.Join(calls, "\n"))
	}
}

// TestFlushStaleBuffer_LeavesIncidentPathUntouched sichert ab, dass der Fix den
// Incident-Pfad nicht mitentfernt: er läuft am Buffer vorbei und legt weiterhin
// je ein Ticket an (SSOT-Szenario "Incident-Pfad bleibt unverändert").
func TestFlushStaleBuffer_LeavesIncidentPathUntouched(t *testing.T) {
	_, logPath := newStubRepo(t)

	if _, err := createIncidentTicket(MishapEntry{
		Title:       "Incident-Titel",
		Description: "Beschreibung",
		Component:   "scripts",
		Type:        "broken",
		ReportedAt:  time.Now().UTC().Format(time.RFC3339),
	}, "mentolder"); err != nil {
		t.Fatalf("createIncidentTicket: %v", err)
	}

	calls := readCalls(t, logPath)
	if got := countCallsWithPrefix(calls, "create --type incident"); got != 1 {
		t.Errorf("Incident-Pfad muss genau ein Ticket anlegen, gefunden %d\nAufruflog:\n%s",
			got, strings.Join(calls, "\n"))
	}

	// Der Buffer darf davon unberührt bleiben.
	if entries := readBuffer(); len(entries) != 0 {
		t.Errorf("Incident-Pfad darf den Buffer nicht befüllen, enthält %d Einträge", len(entries))
	}
}
