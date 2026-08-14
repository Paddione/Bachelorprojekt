// mcp-task-runner/planner/parser_test.go
package planner_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/paddione/mcp-task-runner/planner"
)

// writeFakeTask schreibt ein Fake-`task`-Binary auf PATH, das das gegebene JSON
// ausgibt — wie das echte `task --list-all --json` OHNE deps-Feld (T005596).
func writeFakeTask(t *testing.T, jsonOutput string) {
	t.Helper()
	dir := t.TempDir()
	script := "#!/bin/sh\necho '" + jsonOutput + "'"
	if err := os.WriteFile(filepath.Join(dir, "task"), []byte(script), 0755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir+":"+os.Getenv("PATH"))
}

// writeFixture legt eine Root-Taskfile mit deps plus eine Include-Datei an
// und liefert beide absoluten Pfade.
func writeFixture(t *testing.T) (root, inc string) {
	t.Helper()
	dir := t.TempDir()
	root = filepath.Join(dir, "Taskfile.yml")
	inc = filepath.Join(dir, "Taskfile.assets.yml")
	rootYAML := "version: '3'\n" +
		"includes:\n" +
		"  assets:\n" +
		"    taskfile: ./Taskfile.assets.yml\n" +
		"    dir: .\n" +
		"tasks:\n" +
		"  deploy:\n" +
		"    cmds: [echo deploy]\n" +
		"  post-setup:\n" +
		"    deps: [deploy]\n" +
		"    cmds: [echo post]\n" +
		"  website:build:\n" +
		"    deps: [assets:sync]\n" +
		"    cmds: [echo build]\n" +
		"  guard:\n"
	incYAML := "version: '3'\n" +
		"tasks:\n" +
		"  sync:\n" +
		"    cmds: [echo sync]\n"
	if err := os.WriteFile(root, []byte(rootYAML), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(inc, []byte(incYAML), 0644); err != nil {
		t.Fatal(err)
	}
	return root, inc
}

func locationJSON(name, file string) string {
	return `{"name":"` + name + `","location":{"taskfile":"` + file + `"}}`
}

func TestParseNoDeps(t *testing.T) {
	root, _ := writeFixture(t)
	writeFakeTask(t, `{"tasks":[`+
		locationJSON("deploy", root)+`,`+
		locationJSON("guard", root)+`]}`)
	g, err := planner.Parse(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(g) != 2 {
		t.Fatalf("want 2 tasks, got %d", len(g))
	}
	if len(g["deploy"]) != 0 || len(g["guard"]) != 0 {
		t.Errorf("deploy/guard should have no deps, got %v / %v", g["deploy"], g["guard"])
	}
}

func TestParseWithDeps(t *testing.T) {
	root, _ := writeFixture(t)
	writeFakeTask(t, `{"tasks":[`+
		locationJSON("deploy", root)+`,`+
		locationJSON("post-setup", root)+`]}`)
	g, err := planner.Parse(root)
	if err != nil {
		t.Fatal(err)
	}
	deps := g["post-setup"]
	if len(deps) != 1 || deps[0] != "deploy" {
		t.Errorf("post-setup should depend on deploy, got %v", deps)
	}
}

func TestParseIncludeNamespace(t *testing.T) {
	root, inc := writeFixture(t)
	writeFakeTask(t, `{"tasks":[`+
		locationJSON("website:build", root)+`,`+
		locationJSON("assets:sync", inc)+`]}`)
	g, err := planner.Parse(root)
	if err != nil {
		t.Fatal(err)
	}
	deps := g["website:build"]
	if len(deps) != 1 || deps[0] != "assets:sync" {
		t.Errorf("website:build should depend on assets:sync, got %v", deps)
	}
}

func TestParseTaskCommandFails(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "task"), []byte("#!/bin/sh\nexit 1"), 0755)
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

func TestParseRootMissing(t *testing.T) {
	writeFakeTask(t, `{"tasks":[]}`)
	_, err := planner.Parse(filepath.Join(t.TempDir(), "Taskfile.yml"))
	if err == nil {
		t.Fatal("expected error when root Taskfile cannot be read")
	}
}
