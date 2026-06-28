package runner_test

import (
	"context"
	"testing"
	"time"

	"github.com/paddione/mcp-task-runner/runner"
)

func TestJobRegistryCancelIdempotent(t *testing.T) {
	var reg runner.JobRegistry
	cancelled := false
	cancel := func() { cancelled = true }

	reg.Register("job-1", cancel)

	found, wasCancelled := reg.Cancel("job-1")
	if !found {
		t.Fatal("Cancel: want found=true, got false")
	}
	if !wasCancelled {
		t.Fatal("Cancel: want wasCancelled=true, got false")
	}
	if !cancelled {
		t.Fatal("CancelFunc was not called")
	}

	// Second cancel: job already in cancelled state.
	found, wasCancelled = reg.Cancel("job-1")
	if !found {
		t.Fatal("second Cancel: want found=true, got false")
	}
	if wasCancelled {
		t.Errorf("second Cancel: want wasCancelled=false (already cancelled), got true")
	}
}

func TestJobRegistryCancelUnknownJob(t *testing.T) {
	var reg runner.JobRegistry
	found, _ := reg.Cancel("no-such-job")
	if found {
		t.Fatal("Cancel unknown job: want found=false, got true")
	}
}

func TestJobRegistryCompleteAndLookup(t *testing.T) {
	var reg runner.JobRegistry
	reg.Register("job-2", func() {})

	// Before Complete: status should be running.
	found, status, result := reg.Lookup("job-2")
	if !found {
		t.Fatal("Lookup before Complete: want found=true")
	}
	if status != runner.JobRunning {
		t.Errorf("want status=running, got %s", status)
	}
	if result != nil {
		t.Error("want result=nil before Complete")
	}

	// Complete the job.
	reg.Complete("job-2", runner.Result{Task: "deploy", Env: "mentolder", ExitCode: 0})

	// After Complete: status should be done and result present.
	found, status, result = reg.Lookup("job-2")
	if !found {
		t.Fatal("Lookup after Complete: want found=true")
	}
	if status != runner.JobDone {
		t.Errorf("want status=done, got %s", status)
	}
	if result == nil {
		t.Fatal("want result non-nil after Complete")
	}
	if result.ExitCode != 0 || result.Task != "deploy" {
		t.Errorf("unexpected result: %+v", result)
	}
}

func TestStartTaskReturnsJobID(t *testing.T) {
	fakeTask(t, `exit 0`)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	jobID, err := runner.StartTask(ctx, "deploy", "mentolder", "Taskfile.yml")
	if err != nil {
		t.Fatal(err)
	}
	if jobID == "" {
		t.Fatal("want non-empty jobID")
	}
}

func TestStartTaskInvalidTask(t *testing.T) {
	_, err := runner.StartTask(context.Background(), "", "mentolder", "Taskfile.yml")
	if err == nil {
		t.Fatal("want error for empty task name")
	}
}
