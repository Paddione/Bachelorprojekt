package runner

import (
	"context"
	"fmt"
	"os/exec"
	"sync"

	"go.opentelemetry.io/otel/attribute"

	"github.com/paddione/mcp-task-runner/planner"
	"github.com/paddione/mcp-task-runner/telemetry"
)

// Result holds the outcome of a single task run.
type Result struct {
	Task     string `json:"task"`
	Env      string `json:"env"`
	ExitCode int    `json:"exit_code"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	TraceID  string `json:"trace_id"`
}

// RunTask executes `task <name> ENV=<env>` and returns a Result with OTel instrumentation.
func RunTask(ctx context.Context, task, env, taskfilePath string) (Result, error) {
	ctx, span := telemetry.NewSpan(ctx, "run_task")
	defer span.End()

	attrs := []attribute.KeyValue{
		attribute.String("task.name", task),
		attribute.String("task.env", env),
		attribute.String("task.brand", env),
	}
	span.SetAttributes(attrs...)

	cmd := exec.CommandContext(ctx, "task", "--taskfile", taskfilePath, task, "ENV="+env)
	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return Result{Task: task, Env: env, ExitCode: 1}, fmt.Errorf("stdout pipe: %w", err)
	}
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return Result{Task: task, Env: env, ExitCode: 1}, fmt.Errorf("stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return Result{Task: task, Env: env, ExitCode: 1}, fmt.Errorf("start: %w", err)
	}

	var stdoutBuf, stderrBuf string
	var streamWg sync.WaitGroup
	streamWg.Add(2)
	go func() { defer streamWg.Done(); stdoutBuf = streamLines(ctx, stdoutPipe, "stdout", attrs) }()
	go func() { defer streamWg.Done(); stderrBuf = streamLines(ctx, stderrPipe, "stderr", attrs) }()
	streamWg.Wait()

	exitCode := 0
	if err := cmd.Wait(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = 1
		}
	}

	span.SetAttributes(attribute.Int("task.exit_code", exitCode))
	return Result{
		Task:     task,
		Env:      env,
		ExitCode: exitCode,
		Stdout:   stdoutBuf,
		Stderr:   stderrBuf,
		TraceID:  span.SpanContext().TraceID().String(),
	}, nil
}

// ExecutePlan runs plan groups in order. Within each group all tasks run in parallel.
// On any non-zero exit in a group, subsequent groups are cancelled (fail-fast).
func ExecutePlan(ctx context.Context, plan planner.Plan, taskfilePath string) ([]Result, error) {
	ctx, span := telemetry.NewSpan(ctx, "execute_plan")
	defer span.End()

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	var allResults []Result

	for _, group := range plan.Groups {
		results := make([]Result, len(group.Tasks))
		var wg sync.WaitGroup

		for i, t := range group.Tasks {
			wg.Add(1)
			go func(i int, t planner.TaskRequest) {
				defer wg.Done()
				r, _ := RunTask(ctx, t.Task, t.Env, taskfilePath)
				results[i] = r
			}(i, t)
		}
		wg.Wait()

		allResults = append(allResults, results...)

		for _, r := range results {
			if r.ExitCode != 0 {
				cancel()
				return allResults, fmt.Errorf("task %s (env=%s) exited %d", r.Task, r.Env, r.ExitCode)
			}
		}
	}
	return allResults, nil
}
