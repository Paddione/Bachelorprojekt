// mcp-task-runner/planner/parser.go
package planner

import (
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
)

// ErrCyclicDependency is returned by Schedule when the requested tasks form a cycle.
var ErrCyclicDependency = errors.New("cyclic dependency detected")

// Graph maps each task name to its direct dependency names.
type Graph map[string][]string

type taskEntry struct {
	Name string   `json:"name"`
	Deps []string `json:"deps"`
}

type taskListOutput struct {
	Tasks []taskEntry `json:"tasks"`
}

// Parse runs `task --taskfile <path> --list-all --json` and returns the dependency graph.
func Parse(taskfilePath string) (Graph, error) {
	out, err := exec.Command("task", "--taskfile", taskfilePath, "--list-all", "--json").Output()
	if err != nil {
		return nil, fmt.Errorf("task --list-all --json: %w", err)
	}
	var tl taskListOutput
	if err := json.Unmarshal(out, &tl); err != nil {
		return nil, fmt.Errorf("parse task output: %w", err)
	}
	g := make(Graph, len(tl.Tasks))
	for _, t := range tl.Tasks {
		deps := t.Deps
		if deps == nil {
			deps = []string{}
		}
		g[t.Name] = deps
	}
	return g, nil
}
