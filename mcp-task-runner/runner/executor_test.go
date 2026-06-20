package runner_test

import (
	"context"
	"os"
	"testing"

	"github.com/paddione/mcp-task-runner/planner"
	"github.com/paddione/mcp-task-runner/runner"
)

func fakeTask(t *testing.T, script string) {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(dir+"/task", []byte("#!/bin/sh\n"+script), 0755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir+":"+os.Getenv("PATH"))
}

func TestRunTaskSuccess(t *testing.T) {
	fakeTask(t, `echo "hello"
exit 0`)
	r, err := runner.RunTask(context.Background(), "deploy", "mentolder", "Taskfile.yml")
	if err != nil {
		t.Fatal(err)
	}
	if r.ExitCode != 0 {
		t.Errorf("want exit 0, got %d", r.ExitCode)
	}
	if r.Task != "deploy" || r.Env != "mentolder" {
		t.Errorf("wrong task/env in result: %+v", r)
	}
}

func TestRunTaskNonZeroExit(t *testing.T) {
	fakeTask(t, `exit 42`)
	r, _ := runner.RunTask(context.Background(), "deploy", "mentolder", "Taskfile.yml")
	if r.ExitCode != 42 {
		t.Errorf("want exit 42, got %d", r.ExitCode)
	}
}

func TestExecutePlanParallel(t *testing.T) {
	// Both tasks must complete; timing verification via result count.
	fakeTask(t, `sleep 0.05
exit 0`)
	plan := planner.Plan{Groups: []planner.Group{{Tasks: []planner.TaskRequest{
		{Task: "deploy", Env: "mentolder"},
		{Task: "deploy", Env: "korczewski"},
	}}}}
	results, err := runner.ExecutePlan(context.Background(), plan, "Taskfile.yml")
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 2 {
		t.Errorf("want 2 results, got %d", len(results))
	}
}

func TestExecutePlanFailFast(t *testing.T) {
	fakeTask(t, `exit 1`)
	plan := planner.Plan{Groups: []planner.Group{
		{Tasks: []planner.TaskRequest{{Task: "deploy", Env: "mentolder"}}},
		{Tasks: []planner.TaskRequest{{Task: "post-setup", Env: "mentolder"}}},
	}}
	results, err := runner.ExecutePlan(context.Background(), plan, "Taskfile.yml")
	if err == nil {
		t.Fatal("want error on task failure")
	}
	// Only group 1 should have produced a result; group 2 was cancelled.
	if len(results) != 1 {
		t.Errorf("want 1 result (fail-fast stopped group 2), got %d", len(results))
	}
}
