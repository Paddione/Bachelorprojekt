package tools

// Pruefmodus: OUTPUT-VERIFIKATION (T002448-M4).
//
// Der Test fuehrt den Schwellwert-Pfad tatsaechlich aus und misst, WELCHE
// ticket.sh-Aufrufe dabei entstehen. Er greppt nicht den Quelltext von
// mishap.go. Dafuer wird ticket.sh durch einen protokollierenden Stub ersetzt:
// runner.findRepoRoot() liest TICKET_MCP_REPO_ROOT, runner.ticketShPath() liest
// TICKET_SH — beide werden am Prozessstart ausgewertet, deshalb laeuft der
// eigentliche Messlauf in einem Kindprozess (Helper-Pattern).
//
// Es wird KEINE Datenbank beruehrt: der Stub schreibt nur in eine Logdatei
// unterhalb von t.TempDir() und antwortet mit einer konstanten Container-ID.
//
// RED-Zustand (T003120): processBufferAtThreshold existiert noch nicht — das
// Paket kompiliert nicht. Nach Entfernen der Konversionsschleife muss der Lauf
// genau einen Container-Append und null `create --type fix` erzeugen.

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const konversionHelperEnv = "MISHAP_KONVERSION_HELPER"

// stubTicketSh protokolliert jeden Aufruf zeilenweise (ein Argument je Zeile,
// Aufrufe durch ---- getrennt) und antwortet mit einer konstanten Container-ID.
const stubTicketSh = `#!/usr/bin/env bash
{
  echo "----"
  for a in "$@"; do echo "$a"; done
} >> "$MISHAP_STUB_LOG"
echo "T009999|00000000-0000-0000-0000-000000000000"
`

func writeStubRepo(t *testing.T) (root string, logPath string) {
	t.Helper()
	root = t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "scripts"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	stub := filepath.Join(root, "scripts", "ticket.sh")
	if err := os.WriteFile(stub, []byte(stubTicketSh), 0o755); err != nil {
		t.Fatal(err)
	}
	return root, filepath.Join(root, "stub.log")
}

func tenNonIncidentEntries() []MishapEntry {
	entries := make([]MishapEntry, 0, MISHAP_TRIGGER)
	for i := 0; i < MISHAP_TRIGGER; i++ {
		entries = append(entries, MishapEntry{
			Title:       "Beobachtung " + string(rune('A'+i)),
			Description: "Beschreibung " + string(rune('A'+i)),
			Component:   "scripts/beispiel.sh",
			Type:        "degraded",
			ReportedAt:  "2026-08-10T00:00:00Z",
		})
	}
	return entries
}

// countInvocations zaehlt Stub-Aufrufe, die ALLE genannten Argumente enthalten.
// Bewusst ohne Zeilenanker und ohne Bindung an ein Ausgabeformat (T002716):
// zugesichert wird die Semantik "wie oft wurde X aufgerufen", nicht die
// Darstellung der Argumentliste.
func countInvocations(log string, mustContain ...string) int {
	n := 0
	for _, call := range strings.Split(log, "----") {
		if strings.TrimSpace(call) == "" {
			continue
		}
		args := strings.Split(call, "\n")
		hits := 0
		for _, want := range mustContain {
			for _, a := range args {
				if strings.TrimSpace(a) == want {
					hits++
					break
				}
			}
		}
		if hits == len(mustContain) {
			n++
		}
	}
	return n
}

func TestSchwellwertAppendetOhneEinzeltickets(t *testing.T) {
	if os.Getenv(konversionHelperEnv) == "1" {
		// Kindprozess: hier sind TICKET_MCP_REPO_ROOT und TICKET_SH bereits
		// beim Paket-Init gesetzt gewesen.
		if err := processBufferAtThreshold(tenNonIncidentEntries(), "mentolder"); err != nil {
			t.Fatalf("processBufferAtThreshold: %v", err)
		}
		return
	}
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}

	root, logPath := writeStubRepo(t)
	cmd := exec.Command(os.Args[0], "-test.run=TestSchwellwertAppendetOhneEinzeltickets", "-test.v")
	cmd.Env = append(os.Environ(),
		konversionHelperEnv+"=1",
		"TICKET_MCP_REPO_ROOT="+root,
		"TICKET_SH="+filepath.Join(root, "scripts", "ticket.sh"),
		"MISHAP_STUB_LOG="+logPath,
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("Helper-Lauf fehlgeschlagen: %v\n%s", err, out)
	}

	raw, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("Stub-Log nicht lesbar — der Pfad wurde nie aufgerufen: %v", err)
	}
	log := string(raw)

	// POSITIV-ANKER (T002356-M1): der Container-Append muss tatsaechlich
	// stattgefunden haben. Ohne ihn waere die Aussage "null Einzeltickets"
	// vakuos — sie waere auch erfuellt, wenn der ganze Pfad still abbricht.
	if got := countInvocations(log, "add-comment"); got != 1 {
		t.Fatalf("Container-Append: got %d add-comment-Aufrufe, want 1\nLog:\n%s", got, log)
	}
	if !strings.Contains(log, "Beobachtung A") || !strings.Contains(log, "Beobachtung J") {
		t.Fatalf("Der Append enthaelt nicht alle %d Eintraege\nLog:\n%s", MISHAP_TRIGGER, log)
	}

	// EIGENTLICHE ZUSICHERUNG: keine Einzelticket-Konversion mehr.
	if got := countInvocations(log, "create", "--type", "fix"); got != 0 {
		t.Errorf("Einzelticket-Konversion noch aktiv: got %d `create --type fix`-Aufrufe, want 0\nLog:\n%s", got, log)
	}
}

func TestFlushStaleBufferAppendetOhneEinzeltickets(t *testing.T) {
	if os.Getenv(konversionHelperEnv) == "2" {
		// Buffer im Stub-Repo hinterlegen: mishapBufferPath() faellt ohne
		// echtes git-Repo auf <root>/.git/mishap-buffer.json zurueck.
		writeBuffer(tenNonIncidentEntries())
		if _, err := FlushStaleBuffer("mentolder", time.Nanosecond); err != nil {
			t.Fatalf("FlushStaleBuffer: %v", err)
		}
		return
	}
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}

	root, logPath := writeStubRepo(t)
	cmd := exec.Command(os.Args[0], "-test.run=TestFlushStaleBufferAppendetOhneEinzeltickets", "-test.v")
	cmd.Env = append(os.Environ(),
		konversionHelperEnv+"=2",
		"TICKET_MCP_REPO_ROOT="+root,
		"TICKET_SH="+filepath.Join(root, "scripts", "ticket.sh"),
		"MISHAP_STUB_LOG="+logPath,
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("Helper-Lauf fehlgeschlagen: %v\n%s", err, out)
	}
	raw, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("Stub-Log nicht lesbar: %v", err)
	}
	log := string(raw)
	if got := countInvocations(log, "add-comment"); got != 1 {
		t.Fatalf("Positiv-Anker: got %d add-comment-Aufrufe, want 1\nLog:\n%s", got, log)
	}
	if got := countInvocations(log, "create", "--type", "fix"); got != 0 {
		t.Errorf("Watchdog-Flush konvertiert noch: got %d, want 0\nLog:\n%s", got, log)
	}
}
