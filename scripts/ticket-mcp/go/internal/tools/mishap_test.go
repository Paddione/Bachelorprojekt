package tools

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestClassifyBundleNoCritical(t *testing.T) {
	entries := []MishapEntry{
		{Title: "DB slow", Description: "Queries timing out", Component: "database", Type: "degraded", ReportedAt: "2026-06-21T10:00:00Z"},
		{Title: "UI broken", Description: "Button missing", Component: "frontend", Type: "degraded", ReportedAt: "2026-06-21T10:01:00Z"},
	}
	bundle := classifyBundle(entries)

	if bundle.Severity != "minor" {
		t.Errorf("expected severity=minor, got %s", bundle.Severity)
	}
	if bundle.Priority != "mittel" {
		t.Errorf("expected priority=mittel, got %s", bundle.Priority)
	}
	if bundle.Areas != "database,frontend" {
		t.Errorf("expected areas=database,frontend, got %s", bundle.Areas)
	}
	if bundle.Title != "Mishap-Bundle: database, frontend (2 Einträge)" {
		t.Errorf("unexpected title: %s", bundle.Title)
	}
}

func TestClassifyBundleWithCritical(t *testing.T) {
	entries := []MishapEntry{
		{Title: "Auth broken", Description: "Login fails", Component: "auth", Type: "broken", ReportedAt: "2026-06-21T10:00:00Z"},
		{Title: "Data leak", Description: "Exposed PII", Component: "api", Type: "security", ReportedAt: "2026-06-21T10:01:00Z"},
		{Title: "Slow query", Description: "Query takes 30s", Component: "database", Type: "degraded", ReportedAt: "2026-06-21T10:02:00Z"},
	}
	bundle := classifyBundle(entries)

	if bundle.Severity != "major" {
		t.Errorf("expected severity=major, got %s", bundle.Severity)
	}
	if bundle.Priority != "hoch" {
		t.Errorf("expected priority=hoch, got %s", bundle.Priority)
	}
	if bundle.Areas != "auth,api,database" {
		t.Errorf("expected areas=auth,api,database, got %s", bundle.Areas)
	}
}

func TestClassifyBundleInsertionOrder(t *testing.T) {
	entries := []MishapEntry{
		{Title: "A", Description: "x", Component: "database", Type: "degraded", ReportedAt: ""},
		{Title: "B", Description: "x", Component: "auth", Type: "degraded", ReportedAt: ""},
		{Title: "C", Description: "x", Component: "database", Type: "degraded", ReportedAt: ""},
	}
	bundle := classifyBundle(entries)

	if bundle.Areas != "database,auth" {
		t.Errorf("expected insertion-order areas=database,auth, got %s", bundle.Areas)
	}
}

func TestClassifyBundleDescription(t *testing.T) {
	entries := []MishapEntry{
		{Title: "DB slow", Description: "Queries timing out", Component: "database", Type: "degraded", ReportedAt: "2026-06-21T10:00:00Z"},
	}
	bundle := classifyBundle(entries)

	expectedTitle := "### Mishap 1: DB slow\n**Typ:** degraded | **Komponente:** database\n\nQueries timing out"
	if bundle.Description != expectedTitle {
		t.Errorf("expected description:\n%s\n\ngot:\n%s", expectedTitle, bundle.Description)
	}
}

func TestClassifyBundleEmptyComponents(t *testing.T) {
	entries := []MishapEntry{
		{Title: "A", Description: "x", Component: "  ", Type: "degraded", ReportedAt: ""},
		{Title: "B", Description: "x", Component: "", Type: "degraded", ReportedAt: ""},
	}
	bundle := classifyBundle(entries)

	if bundle.Areas != "" {
		t.Errorf("expected empty areas for blank components, got %s", bundle.Areas)
	}
}

func TestClassifyBundleProcessType(t *testing.T) {
	entries := []MishapEntry{
		{Title: "Skill misfire", Description: "wrong order", Component: "skills/dev-flow", Type: "process", ReportedAt: "2026-06-27T10:00:00Z"},
		{Title: "Doc drift", Description: "stale ref", Component: "skills/infra-ops", Type: "process", ReportedAt: "2026-06-27T10:01:00Z"},
	}
	b := classifyBundle(entries)
	if b.Severity != "minor" || b.Priority != "mittel" {
		t.Errorf("process-only bundle should be minor/mittel, got %s/%s", b.Severity, b.Priority)
	}
}

func TestMishapEntryJSON(t *testing.T) {
	entry := MishapEntry{
		Title: "Test", Description: "Desc", Component: "comp", Type: "broken", ReportedAt: "2026-06-21T10:00:00Z",
	}
	data, err := json.Marshal(entry)
	if err != nil {
		t.Fatal(err)
	}
	var decoded MishapEntry
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.Title != "Test" || decoded.Type != "broken" || decoded.Component != "comp" {
		t.Errorf("JSON roundtrip failed: %+v", decoded)
	}
}

// ── T002383: Emissionsrate & Buffer-Pfad ──────────────────────────────

// Die Schwelle ist der einzige Hebel, der die Bundle-Emission unter eine
// Bundle-pro-Zyklus drückt. Bei 3 lag sie messbar AUF der Konvergenzgrenze
// (2 Zyklen -> 2 Bundles, gemessen 2026-07-28), der Rückstand war damit per
// Konstruktion nicht abbaubar. Dieser Test verankert den Wert, damit ein
// späteres Zurückdrehen auffällt.
func TestMishapTriggerAbovePerCycleRate(t *testing.T) {
	if MISHAP_TRIGGER < 10 {
		t.Errorf("MISHAP_TRIGGER=%d liegt bei/unter der gemessenen Emissionsrate — Bundle-Rückstand wird nicht abbaubar (T002383)", MISHAP_TRIGGER)
	}
}

func TestBufferIsStaleOldestEntryOverdue(t *testing.T) {
	now := time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC)
	entries := []MishapEntry{
		{Title: "alt", Type: "degraded", ReportedAt: now.Add(-8 * 24 * time.Hour).Format(time.RFC3339)},
		{Title: "frisch", Type: "degraded", ReportedAt: now.Format(time.RFC3339)},
	}
	if !BufferIsStale(entries, now, 7*24*time.Hour) {
		t.Error("Buffer mit einem 8 Tage alten Eintrag muss als überfällig gelten")
	}
}

func TestBufferIsStaleFreshBufferIsNot(t *testing.T) {
	now := time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC)
	entries := []MishapEntry{
		{Title: "frisch", Type: "degraded", ReportedAt: now.Add(-2 * time.Hour).Format(time.RFC3339)},
	}
	if BufferIsStale(entries, now, 7*24*time.Hour) {
		t.Error("frischer Buffer darf keinen periodischen Schnitt auslösen — sonst kehrt die alte Emissionsrate zurück")
	}
}

// Ein unlesbarer Zeitstempel darf keinen Flush auslösen: sonst genügt ein
// einziger kaputter Eintrag, um bei jedem Factory-Tick ein Bundle zu erzeugen.
func TestBufferIsStaleIgnoresUnparsableTimestamps(t *testing.T) {
	now := time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC)
	entries := []MishapEntry{{Title: "kaputt", Type: "degraded", ReportedAt: "nicht-rfc3339"}}
	if BufferIsStale(entries, now, 7*24*time.Hour) {
		t.Error("Eintrag ohne parsebaren Zeitstempel darf nicht als überfällig zählen")
	}
}

func TestBufferIsStaleEmptyBuffer(t *testing.T) {
	if BufferIsStale(nil, time.Now(), time.Hour) {
		t.Error("leerer Buffer ist nie überfällig")
	}
}

// In einem git-Worktree ist `.git` eine DATEI. Der alte Pfadbau
// filepath.Join(root, ".git", …) lief dort in ENOTDIR, und writeBuffer verwarf
// den Fehler — Mishaps aus Worktree-Sessions gingen still verloren.
func TestGitCommonDirResolvesWorktreeGitFile(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git nicht verfügbar")
	}
	main := t.TempDir()
	run := func(dir string, args ...string) {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}
	run(main, "init", "-q", "-b", "main")
	run(main, "config", "user.email", "t@example.invalid")
	run(main, "config", "user.name", "t")
	if err := os.WriteFile(filepath.Join(main, "f"), []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}
	run(main, "add", "f")
	run(main, "commit", "-qm", "init")

	wt := filepath.Join(t.TempDir(), "wt")
	run(main, "worktree", "add", "-q", "-b", "side", wt)

	info, err := os.Stat(filepath.Join(wt, ".git"))
	if err != nil {
		t.Fatal(err)
	}
	if info.IsDir() {
		t.Skip("dieses git legt .git im Worktree als Verzeichnis an — Vorbedingung entfällt")
	}

	dir := gitCommonDir(wt)
	if fi, err := os.Stat(dir); err != nil || !fi.IsDir() {
		t.Fatalf("gitCommonDir(%s) = %s ist kein Verzeichnis (err=%v)", wt, dir, err)
	}
	// Der eigentliche Regressionsschutz: der Buffer muss dort schreibbar sein.
	if err := os.WriteFile(filepath.Join(dir, "mishap-buffer.json"), []byte("[]"), 0644); err != nil {
		t.Fatalf("Buffer im Worktree nicht schreibbar: %v", err)
	}
}
