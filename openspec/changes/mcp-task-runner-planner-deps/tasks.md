---
title: mcp-task-runner: deps aus YAML-Quellen — Implementierungsplan
ticket_id: T005596
domains: [test, docs]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mcp-task-runner: deps aus YAML-Quellen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `planner.Parse` bezieht deps-Kanten aus den Taskfile-YAML-Quellen statt aus dem deps-Feld von `task --list-all --json`, das go-task 3.52.0 nicht mehr liefert.

**Architecture:** `task --list-all --json` bleibt nur noch Task-Universum (`name` + `location.taskfile`); je Quelldatei werden die deps per `gopkg.in/yaml.v3` aus dem YAML gezogen, `includes:`-Namespaces der Root-Taskfile werden aufgelöst. Die `Parse → Graph`-Schnittstelle bleibt unverändert — `Schedule`, `execute_plan` und `get_task_graph` bekommen nur wieder echte Kanten.

**Tech Stack:** Go, gopkg.in/yaml.v3, BATS (vendored), jq.

**Spec:** `openspec/changes/mcp-task-runner-planner-deps/design.md`

## Global Constraints

- Fail-closed: unlesbare oder unparsebare YAML-Quelle → Fehler mit Dateipfad; kein stilles kantenloses Ergebnis.
- `.go`-Dateien sind nicht in `docs/code-quality/gates.yaml` `s1.limits` gelistet → kein S1-Zeilenbudget; `parser.go` trotzdem fokussiert halten (Ist 45, geplant ≈ 170).
- BATS-Runner: `tests/unit/lib/bats-core/bin/bats` (vendored), nie globales `bats`.
- Die Fake-JSON-Fixtures in `tests/spec/mcp-task-runner.bats` bleiben deps-frei (sie prüfen die Tool-Oberfläche), bekommen aber ein `location`-Feld: der neue Parser liest je Task die Quelldatei, ein leeres `location.taskfile` wäre ein Parse-Fehler (fail-closed) und bräche MCP-TASK-RUNNER-002.

## File Structure

```
mcp-task-runner/planner/parser.go                          # MODIFY: Parse + YAML-deps-Extraktion, include-Auflösung
mcp-task-runner/go.mod · go.sum                            # MODIFY: + gopkg.in/yaml.v3
mcp-task-runner/planner/parser_test.go                     # MODIFY: Unit-Tests auf On-Disk-YAML-Fixtures
tests/spec/mcp-task-runner/planner-sees-real-deps.bats     # EXISTS: failing Test (rot, im Stage-Commit enthalten)
openspec/changes/mcp-task-runner-planner-deps/specs/mcp-task-runner.md  # EXISTS: Delta-Spec
```

---

### Task 1: parser.go auf YAML-Quellen umstellen

**Files:**
- Modify: `mcp-task-runner/planner/parser.go`
- Modify: `mcp-task-runner/go.mod`, `mcp-task-runner/go.sum`
- Modify: `mcp-task-runner/planner/parser_test.go`

**Interfaces:**
- Produces: `func Parse(taskfilePath string) (Graph, error)` — Signatur unverändert; `type Graph map[string][]string` unverändert. Verbraucher: `mcp-task-runner/main.go` (`plan_tasks`, `get_task_graph`) und `planner_test`.

- [ ] **Step 1: Failing Test bestätigen (Rotphase)**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/mcp-task-runner/planner-sees-real-deps.bats`
expected: FAIL — Assertion `[ "$(echo "$groups" | jq 'length')" -eq 2 ]` schlägt fehl (aktuell 1 Gruppe), Fehlermeldung verweist auf `planner-sees-real-deps.bats, line 35`.

- [ ] **Step 2: yaml.v3 als Dependency hinzufügen**

Run:
```bash
cd mcp-task-runner && go get gopkg.in/yaml.v3@latest && go mod tidy
```
Expected: `go.mod`/`go.sum` enthalten `gopkg.in/yaml.v3`.

- [ ] **Step 3: parser.go ersetzen**

Vollständiger Dateiinhalt (ersetzt `taskEntry`/`taskListOutput` mit deps-Feld):

```go
// mcp-task-runner/planner/parser.go
package planner

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// ErrCyclicDependency is returned by Schedule when the requested tasks form a cycle.
var ErrCyclicDependency = errors.New("cyclic dependency detected")

// Graph maps each task name to its direct dependency names.
type Graph map[string][]string

// taskListEntry is the stable subset of `task --list-all --json`:
// name + source-file location. go-task 3.x ships no deps field in this
// JSON (T005596) — deps are extracted from the YAML sources instead.
type taskListEntry struct {
	Name     string `json:"name"`
	Location struct {
		Taskfile string `json:"taskfile"`
	} `json:"location"`
}

type taskListOutput struct {
	Tasks []taskListEntry `json:"tasks"`
}

// Parse lists the task universe via `task --list-all --json` and extracts the
// dependency edges from the Taskfile YAML sources, resolving includes: namespaces
// declared in the root Taskfile.
func Parse(taskfilePath string) (Graph, error) {
	rootAbs, err := filepath.Abs(taskfilePath)
	if err != nil {
		return nil, fmt.Errorf("resolve taskfile path: %w", err)
	}

	out, err := exec.Command("task", "--taskfile", rootAbs, "--list-all", "--json").Output()
	if err != nil {
		return nil, fmt.Errorf("task --list-all --json: %w", err)
	}
	var tl taskListOutput
	if err := json.Unmarshal(out, &tl); err != nil {
		return nil, fmt.Errorf("parse task output: %w", err)
	}

	namespaces, err := resolveIncludes(rootAbs)
	if err != nil {
		return nil, err
	}
	filePrefixes := invertIncludes(namespaces)

	cache := make(map[string]map[string][]string)
	fileDeps := func(path string) (map[string][]string, error) {
		if d, ok := cache[path]; ok {
			return d, nil
		}
		d, err := depsForFile(path)
		if err != nil {
			return nil, err
		}
		cache[path] = d
		return d, nil
	}

	g := make(Graph, len(tl.Tasks))
	for _, t := range tl.Tasks {
		absFile, err := filepath.Abs(t.Location.Taskfile)
		if err != nil {
			return nil, fmt.Errorf("resolve taskfile location for %s: %w", t.Name, err)
		}
		d, err := fileDeps(absFile)
		if err != nil {
			return nil, err
		}
		rel := stripPrefixes(t.Name, filePrefixes[absFile])
		deps := d[rel]
		if deps == nil {
			deps = []string{}
		}
		g[t.Name] = deps
	}
	return g, nil
}

// resolveIncludes reads the includes: section of the root Taskfile and maps
// namespace -> absolute path of the included taskfile.
func resolveIncludes(rootTaskfile string) (map[string]string, error) {
	b, err := os.ReadFile(rootTaskfile)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", rootTaskfile, err)
	}
	var doc struct {
		Includes map[string]struct {
			Taskfile string `yaml:"taskfile"`
		} `yaml:"includes"`
	}
	if err := yaml.Unmarshal(b, &doc); err != nil {
		return nil, fmt.Errorf("parse %s: %w", rootTaskfile, err)
	}
	ns := make(map[string]string, len(doc.Includes))
	for name, inc := range doc.Includes {
		p := inc.Taskfile
		if !filepath.IsAbs(p) {
			p = filepath.Join(filepath.Dir(rootTaskfile), p)
		}
		ns[name] = p
	}
	return ns, nil
}

// invertIncludes maps absolute taskfile path -> namespace prefixes. The same
// file can be included under several namespaces (e.g. dev and dev-korczewski).
func invertIncludes(namespaces map[string]string) map[string][]string {
	inv := make(map[string][]string)
	for ns, p := range namespaces {
		abs, err := filepath.Abs(p)
		if err != nil {
			continue
		}
		inv[abs] = append(inv[abs], ns)
	}
	return inv
}

// stripPrefixes removes the first matching namespace prefix from a full task name.
func stripPrefixes(name string, prefixes []string) string {
	for _, p := range prefixes {
		if strings.HasPrefix(name, p+":") {
			return strings.TrimPrefix(name, p+":")
		}
	}
	return name
}

// depsForFile parses one Taskfile YAML source and returns relative task names
// (namespaced by key nesting, e.g. "workspace:post-setup:all-prods") -> deps.
func depsForFile(path string) (map[string][]string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}
	var doc struct {
		Tasks map[string]any `yaml:"tasks"`
	}
	if err := yaml.Unmarshal(b, &doc); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	deps := make(map[string][]string)
	var walk func(m map[string]any, prefix string)
	walk = func(m map[string]any, prefix string) {
		for k, v := range m {
			full := k
			if prefix != "" {
				full = prefix + ":" + k
			}
			body, ok := v.(map[string]any)
			if !ok {
				continue // scalare Einträge (leere Guard-Tasks) haben keine deps
			}
			if d, has := body["deps"]; has {
				deps[full] = toStringSlice(d)
			} else {
				walk(body, full)
			}
		}
	}
	walk(doc.Tasks, "")
	return deps, nil
}

// toStringSlice normalisiert deps (scalar oder Liste) zu []string.
func toStringSlice(v any) []string {
	switch t := v.(type) {
	case string:
		return []string{t}
	case []any:
		out := make([]string, 0, len(t))
		for _, e := range t {
			if s, ok := e.(string); ok {
				out = append(out, s)
			}
		}
		return out
	default:
		return []string{}
	}
}
```

- [ ] **Step 4: Kompilieren und Vet**

Run: `cd mcp-task-runner && go build ./... && go vet ./...`
Expected: beide ohne Ausgabe, Exit 0.

- [ ] **Step 5: parser_test.go auf On-Disk-YAML-Fixtures umstellen**

Vollständiger Dateiinhalt (ersetzt die fake JSON mit deps-Feld):

```go
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
```

- [ ] **Step 6: Unit-Tests laufen lassen**

Run: `cd mcp-task-runner && go test ./...`
Expected: PASS, alle sechs Tests.

- [ ] **Step 7: Binary neu bauen und installieren**

Run: `task test:spec:build-mcp-runner`
Expected: `mcp-task-runner: installed fresh build to /usr/local/bin` (oder sudo-Variante).

- [ ] **Step 7.5: Fixture-JSON in tests/spec/mcp-task-runner.bats um ein location-Feld ergänzen**

Der neue Parser liest je Task `location.taskfile` — das Fixture-JSON ohne Feld würde `Parse` mit einem Lesefehler abbrechen lassen. Die Fixture bleibt deps-frei; die Fake-Aufgaben zeigen auf die im setup() erzeugte FAKE_DIR-Taskfile (enthält nur `noop`, also bleiben beide Fake-Aufgaben deps-los — MCP-TASK-RUNNER-002 bleibt grün).

In `setup()`: das Listen-JSON bei Setup-Zeit schreiben (unquoted heredoc, damit `${FAKE_DIR}` expandiert) und `export FAKE_DIR` ergänzen; das Fake-`task`-Skript liest es aus:

```bash
setup() {
  ...
  export FAKE_DIR

  cat > "${FAKE_DIR}/list.json" <<JSON
{"tasks":[{"name":"workspace:deploy","desc":"Deploy","deps":[],"location":{"taskfile":"${FAKE_DIR}/Taskfile.yml"}},{"name":"workspace:post-setup","desc":"Post setup","deps":["workspace:deploy"],"location":{"taskfile":"${FAKE_DIR}/Taskfile.yml"}}]}
JSON

  cat > "${FAKE_DIR}/bin/task" <<'FAKESCRIPT'
#!/bin/bash
for arg in "$@"; do
  if [[ "$arg" == "--json" ]]; then
    cat "$FAKE_DIR/list.json"
    exit 0
  fi
done
echo "running: $*"
exit 0
FAKESCRIPT
  ...
}
```

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/mcp-task-runner.bats`
Expected: PASS — MCP-TASK-RUNNER-001..004 weiterhin grün (Fixture ohne location wäre rot: Parse-Fehler bei 002).

- [ ] **Step 8: BATS-Integrationstest grün**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/mcp-task-runner/planner-sees-real-deps.bats`
Expected: PASS — `plan_tasks` liefert 2 Gruppen (build vor push) gegen den echten Taskfile-Graphen.

- [ ] **Step 9: Commit**

```bash
git add mcp-task-runner/planner/parser.go mcp-task-runner/planner/parser_test.go mcp-task-runner/go.mod mcp-task-runner/go.sum tests/spec/mcp-task-runner.bats
git commit -m "fix(mcp): read planner deps from Taskfile YAML sources [T005596]"
```

---

### Task 2: Verifikation und Artefakte

**Files:**
- Verify: `tests/spec/mcp-task-runner/*` (beide Formen, T002696), `openspec/changes/mcp-task-runner-planner-deps/`
- Modify: `website/src/data/test-inventory.json` (generiert)

- [ ] **Step 1: Komplette mcp-task-runner-Spec-Suite (beide Formen)**

Run: `tests/unit/lib/bats-core/bin/bats -r tests/spec/mcp-task-runner*`
Expected: PASS — Fixture-Tests (MCP-TASK-RUNNER-001..004) und die neuen Guards/Integrationstests grün.

- [ ] **Step 2: OpenSpec-Validierung**

Run: `task openspec:validate`
Expected: Exit 0.

- [ ] **Step 3: Test-Inventar regenerieren und committen**

Run: `task test:inventory`
Expected: `website/src/data/test-inventory.json` enthält `tests/spec/mcp-task-runner/planner-sees-real-deps.bats`; dann:
```bash
git add website/src/data/test-inventory.json
git commit -m "chore: regenerate test inventory [T005596]"
```

- [ ] **Step 4: CI-äquivalente Tests**

Run: `task test:changed`
Expected: Exit 0 (keine k8s-Manifeste berührt — keine E2E-Gruppe).

- [ ] **Step 5: Freshness**

Run:
```bash
task freshness:regenerate
git add docs/code-quality/repo-index.json website/src/data/openspec-status.json 2>/dev/null || true
task freshness:check
```
Expected: `freshness:check` Exit 0; regenerierte Artefakte sind committet (`git show --stat HEAD` prüfen).

- [ ] **Step 6: Abschluss-Commit**

```bash
git add openspec/changes/mcp-task-runner-planner-deps/
git commit -m "fix(mcp): planner reads deps from Taskfile YAML sources [T005596]"
```
