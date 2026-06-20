// mcp-task-runner/planner/scheduler.go
package planner

import "fmt"

// TaskRequest is a single {task, env} pair to execute.
type TaskRequest struct {
	Task string `json:"task"`
	Env  string `json:"env"`
}

// Group is a set of tasks that can execute in parallel.
type Group struct {
	Tasks []TaskRequest `json:"tasks"`
}

// Plan is the ordered list of Groups; each group runs after the previous one completes.
type Plan struct {
	Groups []Group `json:"groups"`
}

// Schedule applies Kahn's topological sort to the requested tasks and returns a Plan.
// Tasks on the same level (no ordering dependency between them) form one parallel Group.
// Tasks from different brands on the same level are placed in the same Group.
// Returns ErrCyclicDependency if the requested tasks contain a cycle.
func Schedule(graph Graph, tasks []TaskRequest) (Plan, error) {
	// Index requested tasks by name (multiple entries allowed — e.g. cross-brand).
	nameToIdx := make(map[string][]int, len(tasks))
	for i, t := range tasks {
		nameToIdx[t.Task] = append(nameToIdx[t.Task], i)
	}

	// Build per-index in-degree and adjacency list considering only requested tasks.
	n := len(tasks)
	inDegree := make([]int, n)
	adj := make([][]int, n) // adj[i] → indices that must run after tasks[i]

	for i, t := range tasks {
		for _, dep := range graph[t.Task] {
			for _, j := range nameToIdx[dep] {
				if j == i {
					continue
				}
				inDegree[i]++
				adj[j] = append(adj[j], i)
			}
		}
	}

	// Kahn's BFS — each wave of zero-in-degree nodes forms one parallel Group.
	queue := make([]int, 0, n)
	for i, d := range inDegree {
		if d == 0 {
			queue = append(queue, i)
		}
	}

	var plan Plan
	processed := 0
	for len(queue) > 0 {
		group := Group{Tasks: make([]TaskRequest, len(queue))}
		for k, i := range queue {
			group.Tasks[k] = tasks[i]
		}
		plan.Groups = append(plan.Groups, group)
		processed += len(queue)

		next := make([]int, 0, len(queue))
		for _, i := range queue {
			for _, j := range adj[i] {
				inDegree[j]--
				if inDegree[j] == 0 {
					next = append(next, j)
				}
			}
		}
		queue = next
	}

	if processed != n {
		return Plan{}, fmt.Errorf("%w", ErrCyclicDependency)
	}
	return plan, nil
}
