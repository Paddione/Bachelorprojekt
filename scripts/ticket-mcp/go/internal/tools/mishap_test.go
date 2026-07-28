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
