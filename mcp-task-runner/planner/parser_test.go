// mcp-task-runner/planner/parser_test.go
package planner_test

import (
	"os"
	"testing"

	"github.com/paddione/mcp-task-runner/planner"
)

// writeFakeTask writes a shell script that prints the given JSON and puts it on PATH.
func writeFakeTask(t *testing.T, jsonOutput string) {
	t.Helper()
	dir := t.TempDir()
	script := "#!/bin/sh\necho '" + jsonOutput + "'"
	if err := os.WriteFile(dir+"/task", []byte(script), 0755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir+":"+os.Getenv("PATH"))
}

func TestParseNoDeps(t *testing.T) {
	writeFakeTask(t, `{"tasks":[{"name":"deploy","deps":[]},{"name":"validate","deps":[]}]}`)
	g, err := planner.Parse("Taskfile.yml")
	if err != nil {
		t.Fatal(err)
	}
	if len(g) != 2 {
		t.Fatalf("want 2 tasks, got %d", len(g))
	}
	if len(g["deploy"]) != 0 {
		t.Errorf("deploy should have no deps, got %v", g["deploy"])
	}
}

func TestParseWithDeps(t *testing.T) {
	writeFakeTask(t, `{"tasks":[{"name":"deploy","deps":[]},{"name":"post-setup","deps":["deploy"]}]}`)
	g, err := planner.Parse("Taskfile.yml")
	if err != nil {
		t.Fatal(err)
	}
	deps := g["post-setup"]
	if len(deps) != 1 || deps[0] != "deploy" {
		t.Errorf("post-setup should depend on deploy, got %v", deps)
	}
}

func TestParseTaskCommandFails(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(dir+"/task", []byte("#!/bin/sh\nexit 1"), 0755)
	t.Setenv("PATH", dir+":"+os.Getenv("PATH"))
	_, err := planner.Parse("Taskfile.yml")
	if err == nil {
		t.Fatal("expected error when task exits non-zero")
	}
}

func TestParseInvalidJSON(t *testing.T) {
	writeFakeTask(t, `not-json`)
	_, err := planner.Parse("Taskfile.yml")
	if err == nil {
		t.Fatal("expected error on invalid JSON")
	}
}
