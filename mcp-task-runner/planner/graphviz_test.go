package planner_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/paddione/mcp-task-runner/planner"
)

func TestGraphToMermaidBasic(t *testing.T) {
	g := planner.Graph{
		"build":  {},
		"test":   {"build"},
		"deploy": {"test"},
	}
	out := planner.GraphToMermaid(g)
	if !strings.HasPrefix(out, "graph TD") {
		t.Errorf("want output to start with 'graph TD', got: %q", out[:min(len(out), 20)])
	}
	if !strings.Contains(out, "build") || !strings.Contains(out, "test") || !strings.Contains(out, "deploy") {
		t.Errorf("missing node names in mermaid output:\n%s", out)
	}
	if !strings.Contains(out, "-->") {
		t.Errorf("want at least one edge (-->), output:\n%s", out)
	}
}

func TestGraphToMermaidSanitizesNodeIDs(t *testing.T) {
	g := planner.Graph{
		"workspace:deploy": {},
		"env-check.sh":    {"workspace:deploy"},
	}
	out := planner.GraphToMermaid(g)
	// Special chars in IDs must be replaced with _
	if strings.Contains(out, "workspace:deploy[") {
		t.Error("colon in node ID must be replaced with underscore")
	}
	// Labels must retain original name
	if !strings.Contains(out, `"workspace:deploy"`) {
		t.Errorf("node label must retain original name, got:\n%s", out)
	}
}

func TestGraphToMermaidDeterministic(t *testing.T) {
	g := planner.Graph{"z": {}, "a": {}, "m": {"a"}}
	out1 := planner.GraphToMermaid(g)
	out2 := planner.GraphToMermaid(g)
	if out1 != out2 {
		t.Error("GraphToMermaid must produce identical output on repeated calls")
	}
}

func TestGraphToMermaidNoDeps(t *testing.T) {
	g := planner.Graph{"build": {}, "test": {}}
	out := planner.GraphToMermaid(g)
	if strings.Contains(out, "-->") {
		t.Errorf("no dependencies: want no edges, got:\n%s", out)
	}
}

func TestGraphToJSONShape(t *testing.T) {
	g := planner.Graph{
		"build": {},
		"test":  {"build"},
	}
	raw := planner.GraphToJSON(g)
	var result struct {
		Nodes []string `json:"nodes"`
		Edges []struct {
			From string `json:"from"`
			To   string `json:"to"`
		} `json:"edges"`
	}
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		t.Fatalf("GraphToJSON produced invalid JSON: %v\noutput: %s", err, raw)
	}
	if len(result.Nodes) != 2 {
		t.Errorf("want 2 nodes, got %d", len(result.Nodes))
	}
	if len(result.Edges) != 1 {
		t.Errorf("want 1 edge, got %d", len(result.Edges))
	}
	if result.Edges[0].From != "build" || result.Edges[0].To != "test" {
		t.Errorf("wrong edge: %+v", result.Edges[0])
	}
}

func TestGraphToJSONDeterministic(t *testing.T) {
	g := planner.Graph{"z": {}, "a": {}, "m": {"a"}}
	if planner.GraphToJSON(g) != planner.GraphToJSON(g) {
		t.Error("GraphToJSON must produce identical output on repeated calls")
	}
}
