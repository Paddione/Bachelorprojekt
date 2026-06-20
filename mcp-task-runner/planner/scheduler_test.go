// mcp-task-runner/planner/scheduler_test.go
package planner_test

import (
	"errors"
	"testing"

	"github.com/paddione/mcp-task-runner/planner"
)

func TestScheduleAllParallel(t *testing.T) {
	g := planner.Graph{"deploy": {}, "validate": {}}
	tasks := []planner.TaskRequest{
		{Task: "deploy", Env: "mentolder"},
		{Task: "validate", Env: "mentolder"},
	}
	plan, err := planner.Schedule(g, tasks)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Groups) != 1 {
		t.Fatalf("want 1 group (all parallel), got %d", len(plan.Groups))
	}
	if len(plan.Groups[0].Tasks) != 2 {
		t.Errorf("want 2 tasks in group, got %d", len(plan.Groups[0].Tasks))
	}
}

func TestScheduleLinearChain(t *testing.T) {
	g := planner.Graph{"deploy": {}, "post-setup": {"deploy"}}
	tasks := []planner.TaskRequest{
		{Task: "deploy", Env: "mentolder"},
		{Task: "post-setup", Env: "mentolder"},
	}
	plan, err := planner.Schedule(g, tasks)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Groups) != 2 {
		t.Fatalf("want 2 groups (serial), got %d", len(plan.Groups))
	}
	if plan.Groups[0].Tasks[0].Task != "deploy" {
		t.Errorf("want deploy first, got %s", plan.Groups[0].Tasks[0].Task)
	}
	if plan.Groups[1].Tasks[0].Task != "post-setup" {
		t.Errorf("want post-setup second, got %s", plan.Groups[1].Tasks[0].Task)
	}
}

func TestScheduleCrossBrand(t *testing.T) {
	g := planner.Graph{"workspace:deploy": {}}
	tasks := []planner.TaskRequest{
		{Task: "workspace:deploy", Env: "mentolder"},
		{Task: "workspace:deploy", Env: "korczewski"},
	}
	plan, err := planner.Schedule(g, tasks)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Groups) != 1 {
		t.Fatalf("cross-brand tasks with no deps should be one parallel group, got %d", len(plan.Groups))
	}
	if len(plan.Groups[0].Tasks) != 2 {
		t.Errorf("want both brands in same group, got %d", len(plan.Groups[0].Tasks))
	}
}

func TestScheduleCycleDetected(t *testing.T) {
	g := planner.Graph{"a": {"b"}, "b": {"a"}}
	tasks := []planner.TaskRequest{
		{Task: "a", Env: "mentolder"},
		{Task: "b", Env: "mentolder"},
	}
	_, err := planner.Schedule(g, tasks)
	if !errors.Is(err, planner.ErrCyclicDependency) {
		t.Errorf("want ErrCyclicDependency, got %v", err)
	}
}

func TestScheduleUnknownDepIgnored(t *testing.T) {
	// A dep that's not in the requested tasks list is ignored (not scheduled).
	g := planner.Graph{"post-setup": {"deploy"}}
	tasks := []planner.TaskRequest{{Task: "post-setup", Env: "mentolder"}}
	plan, err := planner.Schedule(g, tasks)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Groups) != 1 || len(plan.Groups[0].Tasks) != 1 {
		t.Errorf("want 1 group with 1 task, got %v", plan)
	}
}
