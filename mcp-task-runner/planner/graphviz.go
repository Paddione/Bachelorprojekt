package planner

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// sanitizeID replaces Mermaid-illegal characters in task names with underscores.
// Characters replaced: colon, hyphen, dot, slash.
func sanitizeID(name string) string {
	r := strings.NewReplacer(":", "_", "-", "_", ".", "_", "/", "_")
	return r.Replace(name)
}

// GraphToMermaid converts the task dependency graph to a Mermaid graph TD diagram.
// Output is deterministically sorted (alphabetically by node ID).
// Node IDs have special characters replaced; node labels retain original names.
// Edge semantics: from → to means "from must run before to".
func GraphToMermaid(g Graph) string {
	nodes := make([]string, 0, len(g))
	for name := range g {
		nodes = append(nodes, name)
	}
	sort.Strings(nodes)

	var sb strings.Builder
	sb.WriteString("graph TD\n")

	// Emit node declarations with sanitised ID and original label.
	for _, name := range nodes {
		id := sanitizeID(name)
		fmt.Fprintf(&sb, "  %s[%q]\n", id, name)
	}

	// Emit edges: each dep of name is an "from" (dep → name).
	for _, name := range nodes {
		deps := g[name]
		sortedDeps := make([]string, len(deps))
		copy(sortedDeps, deps)
		sort.Strings(sortedDeps)
		toID := sanitizeID(name)
		for _, dep := range sortedDeps {
			fromID := sanitizeID(dep)
			fmt.Fprintf(&sb, "  %s --> %s\n", fromID, toID)
		}
	}
	return sb.String()
}

// edge is an ordered directed dependency pair for JSON output.
type edge struct {
	From string `json:"from"`
	To   string `json:"to"`
}

// GraphToJSON converts the task dependency graph to a JSON object with
// "nodes" (sorted alphabetically) and "edges" (sorted by From then To).
// Edge semantics: from must run before to.
func GraphToJSON(g Graph) string {
	nodes := make([]string, 0, len(g))
	for name := range g {
		nodes = append(nodes, name)
	}
	sort.Strings(nodes)

	var edges []edge
	for _, name := range nodes {
		deps := g[name]
		sortedDeps := make([]string, len(deps))
		copy(sortedDeps, deps)
		sort.Strings(sortedDeps)
		for _, dep := range sortedDeps {
			edges = append(edges, edge{From: dep, To: name})
		}
	}
	// edges are already sorted because we iterate nodes alphabetically and deps alphabetically.

	type graphJSON struct {
		Nodes []string `json:"nodes"`
		Edges []edge   `json:"edges"`
	}
	if edges == nil {
		edges = []edge{} // ensure JSON array, not null
	}
	b, _ := json.Marshal(graphJSON{Nodes: nodes, Edges: edges})
	return string(b)
}
