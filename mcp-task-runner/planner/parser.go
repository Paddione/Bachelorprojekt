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
