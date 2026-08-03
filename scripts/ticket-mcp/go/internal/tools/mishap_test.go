package tools

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestIsIncidentType(t *testing.T) {
	for _, tt := range []struct {
		typ      string
		expected bool
	}{
		{"incident", true}, {"broken", true}, {"security", true},
		{"degraded", false}, {"suspicious", false}, {"drift", false}, {"process", false}, {"", false},
	} {
		if got := isIncidentType(tt.typ); got != tt.expected {
			t.Errorf("isIncidentType(%q) = %v, want %v", tt.typ, got, tt.expected)
		}
	}
}

func TestMishapEntryJSON(t *testing.T) {
	entry := MishapEntry{Title: "Test", Description: "Desc", Component: "comp", Type: "broken", ReportedAt: "2026-06-21T10:00:00Z"}
	data, err := json.Marshal(entry)
	if err != nil { t.Fatal(err) }
	var decoded MishapEntry
	if err := json.Unmarshal(data, &decoded); err != nil { t.Fatal(err) }
	if decoded.Title != "Test" || decoded.Type != "broken" || decoded.Component != "comp" {
		t.Errorf("JSON roundtrip failed: %+v", decoded)
	}
}

func TestMishapTriggerAbovePerCycleRate(t *testing.T) {
	if MISHAP_TRIGGER < 10 {
		t.Errorf("MISHAP_TRIGGER=%d too low (T002383)", MISHAP_TRIGGER)
	}
}

func TestBufferIsStaleOldestEntryOverdue(t *testing.T) {
	now := time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC)
	entries := []MishapEntry{
		{Title: "alt", Type: "degraded", ReportedAt: now.Add(-8 * 24 * time.Hour).Format(time.RFC3339)},
		{Title: "frisch", Type: "degraded", ReportedAt: now.Format(time.RFC3339)},
	}
	if !BufferIsStale(entries, now, 7*24*time.Hour) {
		t.Error("8-day-old buffer must be stale")
	}
}

func TestBufferIsStaleFreshBufferIsNot(t *testing.T) {
	now := time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC)
	entries := []MishapEntry{{Title: "frisch", Type: "degraded", ReportedAt: now.Add(-2 * time.Hour).Format(time.RFC3339)}}
	if BufferIsStale(entries, now, 7*24*time.Hour) {
		t.Error("fresh buffer must not trigger periodic flush")
	}
}

func TestBufferIsStaleIgnoresUnparsableTimestamps(t *testing.T) {
	now := time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC)
	entries := []MishapEntry{{Title: "kaputt", Type: "degraded", ReportedAt: "nicht-rfc3339"}}
	if BufferIsStale(entries, now, 7*24*time.Hour) {
		t.Error("unparseable timestamp must not count as stale")
	}
}

func TestBufferIsStaleEmptyBuffer(t *testing.T) {
	if BufferIsStale(nil, time.Now(), time.Hour) {
		t.Error("empty buffer never stale")
	}
}

func TestGitCommonDirResolvesWorktreeGitFile(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil { t.Skip("git not available") }
	main := t.TempDir()
	run := func(dir string, args ...string) {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		if out, err := cmd.CombinedOutput(); err != nil { t.Fatalf("git %v: %v\n%s", args, err, out) }
	}
	run(main, "init", "-q", "-b", "main")
	run(main, "config", "user.email", "t@example.invalid")
	run(main, "config", "user.name", "t")
	if err := os.WriteFile(filepath.Join(main, "f"), []byte("x"), 0644); err != nil { t.Fatal(err) }
	run(main, "add", "f")
	run(main, "commit", "-qm", "init")
	wt := filepath.Join(t.TempDir(), "wt")
	run(main, "worktree", "add", "-q", "-b", "side", wt)
	info, err := os.Stat(filepath.Join(wt, ".git"))
	if err != nil { t.Fatal(err) }
	if info.IsDir() { t.Skip("worktree .git is dir — precondition not met") }
	dir := gitCommonDir(wt)
	if fi, err := os.Stat(dir); err != nil || !fi.IsDir() {
		t.Fatalf("gitCommonDir(%s) = %s is not dir (err=%v)", wt, dir, err)
	}
	if err := os.WriteFile(filepath.Join(dir, "mishap-buffer.json"), []byte("[]"), 0644); err != nil {
		t.Fatalf("Buffer not writable in worktree: %v", err)
	}
}

func TestRollupConstants(t *testing.T) {
	if ROLLUP_TICKET_TITLE == "" { t.Error("ROLLUP_TICKET_TITLE must be set") }
	if ROLLUP_BRANCH == "" { t.Error("ROLLUP_BRANCH must be set") }
	if ROLLUP_CHANGE_DIR == "" { t.Error("ROLLUP_CHANGE_DIR must be set") }
}

// Flag helpers for args inspection.

func flagValue(args []string, flag string) string {
	for i, a := range args {
		if a == flag && i+1 < len(args) {
			return args[i+1]
		}
	}
	return ""
}

func hasFlagValue(args []string, flag, value string) bool {
	for i, a := range args {
		if a == flag && i+1 < len(args) && args[i+1] == value {
			return true
		}
	}
	return false
}

func hasAnyFlagValue(args []string, flag string, values ...string) bool {
	for i, a := range args {
		if a == flag && i+1 < len(args) {
			for _, v := range values {
				if args[i+1] == v {
					return true
				}
			}
		}
	}
	return false
}

// --- Incident-Ticket-Args ---

func TestIncidentTicketArgs_UsesIncidentType(t *testing.T) {
	entry := MishapEntry{Title: "X", Description: "Y", Component: "c", Type: "broken", ReportedAt: "2026-07-28T12:00:00Z"}
	args := buildIncidentTicketArgs(entry, "mentolder")
	if !hasFlagValue(args, "--type", "incident") {
		t.Errorf("buildIncidentTicketArgs missing --type incident; got args: %v", args)
	}
}

func TestIncidentTicketArgs_NotTask(t *testing.T) {
	entry := MishapEntry{Title: "X", Description: "Y", Component: "c", Type: "incident", ReportedAt: "2026-07-28T12:00:00Z"}
	args := buildIncidentTicketArgs(entry, "mentolder")
	if hasFlagValue(args, "--type", "task") {
		t.Error("buildIncidentTicketArgs must NOT use --type task; should use --type incident")
	}
}

func TestIncidentTicketArgs_BrandAndSeverity(t *testing.T) {
	entry := MishapEntry{Title: "X", Description: "Y", Component: "c", Type: "incident", ReportedAt: "2026-07-28T12:00:00Z"}
	args := buildIncidentTicketArgs(entry, "korczewski")
	if v := flagValue(args, "--brand"); v != "korczewski" {
		t.Errorf("expected --brand korczewski, got %q", v)
	}
	if v := flagValue(args, "--severity"); v != "major" {
		t.Errorf("expected --severity major, got %q", v)
	}
	if v := flagValue(args, "--priority"); v != "hoch" {
		t.Errorf("expected --priority hoch, got %q", v)
	}
	if v := flagValue(args, "--attention-mode"); v != "needs_human" {
		t.Errorf("expected --attention-mode needs_human, got %q", v)
	}
}

// --- Rollup-Find-Args ---

func TestRollupFindArgs_UsesChoreAndPlanStaged(t *testing.T) {
	args := buildFindRollupTicketArgs("mentolder")
	if !hasFlagValue(args, "--type", "chore") {
		t.Errorf("buildFindRollupTicketArgs missing --type chore; got args: %v", args)
	}
	if !hasFlagValue(args, "--status", "plan_staged") {
		t.Errorf("buildFindRollupTicketArgs missing --status plan_staged; got args: %v", args)
	}
	if !hasFlagValue(args, "--brand", "mentolder") {
		t.Errorf("buildFindRollupTicketArgs missing --brand mentolder; got args: %v", args)
	}
}

func TestRollupFindArgs_NotTask(t *testing.T) {
	args := buildFindRollupTicketArgs("mentolder")
	if hasFlagValue(args, "--type", "task") {
		t.Error("buildFindRollupTicketArgs must NOT use --type task; should use --type chore")
	}
}

// --- Rollup-Create-Args ---

func TestRollupCreateArgs_UsesChore(t *testing.T) {
	args := buildCreateRollupTicketArgs("mentolder")
	if !hasFlagValue(args, "--type", "chore") {
		t.Errorf("buildCreateRollupTicketArgs missing --type chore; got args: %v", args)
	}
}

func TestRollupCreateArgs_NotTask(t *testing.T) {
	args := buildCreateRollupTicketArgs("mentolder")
	if hasFlagValue(args, "--type", "task") {
		t.Error("buildCreateRollupTicketArgs must NOT use --type task; should use --type chore")
	}
}

func TestRollupCreateArgs_StatusIsPlanStaged(t *testing.T) {
	args := buildCreateRollupTicketArgs("mentolder")
	if !hasFlagValue(args, "--status", "plan_staged") {
		t.Errorf("buildCreateRollupTicketArgs missing --status plan_staged; got args: %v", args)
	}
}

func TestRollupCreateArgs_NotTriage(t *testing.T) {
	args := buildCreateRollupTicketArgs("mentolder")
	if hasFlagValue(args, "--status", "triage") {
		t.Error("buildCreateRollupTicketArgs must NOT use --status triage; should use --status plan_staged")
	}
}

func TestRollupCreateArgs_NoIncidentType(t *testing.T) {
	args := buildCreateRollupTicketArgs("mentolder")
	// Rollup container is a chore, not an incident
	if hasFlagValue(args, "--type", "incident") {
		t.Error("rollup container must be --type chore, not incident")
	}
}

// --- Dispatch: incident types go to createIncidentTicket, others to buffer ---

func TestIncidentTypeDispatch(t *testing.T) {
	// Verify the dispatch rules used in report_mishap handler:
	// incident, broken, security → createIncidentTicket (true)
	// degraded, suspicious, drift, process → buffer path (false)
	for _, typ := range []string{"incident", "broken", "security"} {
		if !isIncidentType(typ) {
			t.Errorf("isIncidentType(%q) must be true — should create incident ticket directly", typ)
		}
	}
	for _, typ := range []string{"degraded", "suspicious", "drift", "process"} {
		if isIncidentType(typ) {
			t.Errorf("isIncidentType(%q) must be false — should go to buffer", typ)
		}
	}
}

func TestIncidentAndBrokenArgsMatch(t *testing.T) {
	// broken is an alias for incident — both should produce identical ticket args
	// except for the Type field in the MishapEntry itself (which appears in the description).
	entryIncident := MishapEntry{Title: "Fail", Description: "D", Component: "c", Type: "incident", ReportedAt: ""}
	entryBroken := MishapEntry{Title: "Fail", Description: "D", Component: "c", Type: "broken", ReportedAt: ""}

	argsInc := buildIncidentTicketArgs(entryIncident, "mentolder")
	argsBroken := buildIncidentTicketArgs(entryBroken, "mentolder")

	// Both should produce --type incident regardless of the MishapEntry.Type
	if v := flagValue(argsInc, "--type"); v != "incident" {
		t.Errorf("incident entry: expected --type incident, got %q", v)
	}
	if v := flagValue(argsBroken, "--type"); v != "incident" {
		t.Errorf("broken entry: expected --type incident, got %q", v)
	}

	// Title contains the Mishap entry title (same for both)
	if v := flagValue(argsInc, "--title"); v != "Mishap-Incident: Fail" {
		t.Errorf("incident title: expected 'Mishap-Incident: Fail', got %q", v)
	}
	if v := flagValue(argsBroken, "--title"); v != "Mishap-Incident: Fail" {
		t.Errorf("broken title: expected 'Mishap-Incident: Fail', got %q", v)
	}
}

// --- Full arg set does not contain stale types ---

func TestNoTaskTypeInAnyBuilder(t *testing.T) {
	entry := MishapEntry{Title: "X", Description: "Y", Component: "c", Type: "incident", ReportedAt: ""}
	assertNoTask := func(name string, args []string) {
		t.Helper()
		if hasFlagValue(args, "--type", "task") {
			t.Errorf("%s must not use --type task", name)
		}
	}
	assertNoTask("buildIncidentTicketArgs", buildIncidentTicketArgs(entry, "mentolder"))
	assertNoTask("buildFindRollupTicketArgs", buildFindRollupTicketArgs("mentolder"))
	assertNoTask("buildCreateRollupTicketArgs", buildCreateRollupTicketArgs("mentolder"))
}

func TestNoTriageStatusInRollupCreate(t *testing.T) {
	if hasFlagValue(buildCreateRollupTicketArgs("mentolder"), "--status", "triage") {
		t.Error("rollup create must not use --status triage")
	}
	if hasFlagValue(buildFindRollupTicketArgs("mentolder"), "--status", "triage") {
		t.Error("rollup find must not use --status triage")
	}
}

func TestBuildersAreDeterministic(t *testing.T) {
	entry := MishapEntry{Title: "X", Description: "Y", Component: "c", Type: "incident", ReportedAt: ""}
	a1 := buildIncidentTicketArgs(entry, "mentolder")
	a2 := buildIncidentTicketArgs(entry, "mentolder")
	if len(a1) != len(a2) {
		t.Fatalf("non-deterministic: len %d vs %d", len(a1), len(a2))
	}
	for i := range a1 {
		if a1[i] != a2[i] {
			t.Fatalf("non-deterministic at index %d: %q vs %q", i, a1[i], a2[i])
		}
	}
}

// --- T002XXX: Factory-Konversion + Dedupe-Guard ---

func TestNormalizeTitle(t *testing.T) {
	if normalizeTitle("  Foo  Bar\tBAZ  ") != "foo bar baz" {
		t.Errorf("normalizeTitle spaces/case failed: %q", normalizeTitle("  Foo  Bar\tBAZ  "))
	}
	if normalizeTitle("A—B") != "a—b" {
		t.Errorf("normalizeTitle dash failed: %q", normalizeTitle("A—B"))
	}
}

func TestMishapSeverityMapping(t *testing.T) {
	for _, tt := range []struct{ typ, sev, prio string }{
		{"degraded", "minor", "mittel"},
		{"suspicious", "minor", "mittel"},
		{"drift", "trivial", "niedrig"},
		{"process", "minor", "mittel"},
	} {
		sev, prio := mishapSeverity(tt.typ)
		if sev != tt.sev || prio != tt.prio {
			t.Errorf("mishapSeverity(%q) = (%q,%q), want (%q,%q)", tt.typ, sev, prio, tt.sev, tt.prio)
		}
	}
}

func TestFactoryFixTicketArgs_PlanStaged(t *testing.T) {
	entry := MishapEntry{Title: "X", Description: "Y", Component: "c", Type: "drift", ReportedAt: ""}
	args := buildFactoryFixTicketArgs(entry, "mentolder")
	if !hasFlagValue(args, "--type", "fix") {
		t.Errorf("factory fix must use --type fix; got %v", args)
	}
	if !hasFlagValue(args, "--status", "plan_staged") {
		t.Errorf("factory fix must use --status plan_staged (T002327 lane); got %v", args)
	}
	if !hasFlagValue(args, "--attention-mode", "ai_ready") {
		t.Errorf("factory fix must be ai_ready; got %v", args)
	}
	if !hasFlagValue(args, "--severity", "trivial") {
		t.Errorf("drift must map to severity trivial; got %v", args)
	}
	if hasFlagValue(args, "--type", "task") {
		t.Error("factory fix must never use type=task")
	}
	if hasFlagValue(args, "--status", "backlog") {
		t.Error("factory fix must not land in the T002327-protected backlog lane")
	}
}
