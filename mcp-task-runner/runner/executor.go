package runner

import (
	"context"
	"fmt"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/google/uuid"
	"go.opentelemetry.io/otel/attribute"

	"github.com/paddione/mcp-task-runner/planner"
	"github.com/paddione/mcp-task-runner/telemetry"
)

// argPattern matches safe argument values: alphanumeric, underscore, colon, dot, hyphen, slash.
var argPattern = regexp.MustCompile(`^[A-Za-z0-9_:.\-/]+$`)

// validateArg rejects empty values, values starting with '-', and values containing characters
// outside the safe set. This prevents argv flag-smuggling attacks.
func validateArg(value string) error {
	if value == "" {
		return fmt.Errorf("argument must not be empty")
	}
	if strings.HasPrefix(value, "-") {
		return fmt.Errorf("argument %q must not start with '-'", value)
	}
	if !argPattern.MatchString(value) {
		return fmt.Errorf("argument %q contains disallowed characters (allowed: A-Za-z0-9_:./-)", value)
	}
	return nil
}

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
// env may be empty; when empty, the ENV= argument is omitted from the task invocation.
func RunTask(ctx context.Context, task, env, taskfilePath string) (Result, error) {
	if err := validateArg(task); err != nil {
		return Result{Task: task, Env: env, ExitCode: 1}, fmt.Errorf("invalid task argument: %w", err)
	}
	if env != "" {
		if err := validateArg(env); err != nil {
			return Result{Task: task, Env: env, ExitCode: 1}, fmt.Errorf("invalid env argument: %w", err)
		}
	}

	ctx, span := telemetry.NewSpan(ctx, "run_task")
	defer span.End()

	attrs := []attribute.KeyValue{
		attribute.String("task.name", task),
		attribute.String("task.env", env),
		attribute.String("task.brand", env),
	}
	span.SetAttributes(attrs...)

	taskArgs := []string{"--taskfile", taskfilePath, "--", task}
	if env != "" {
		taskArgs = append(taskArgs, "ENV="+env)
	}
	cmd := exec.CommandContext(ctx, "task", taskArgs...)
	cmd.Cancel = func() error { return cmd.Process.Signal(syscall.SIGTERM) }
	cmd.WaitDelay = 5 * time.Second
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

// StartTask starts a task asynchronously in a new goroutine, registers it in
// GlobalRegistry, and returns the job ID immediately. The caller can poll
// GlobalRegistry.Lookup(jobID) for status and result.
func StartTask(parentCtx context.Context, task, env, taskfilePath string) (string, error) {
	if err := validateArg(task); err != nil {
		return "", fmt.Errorf("invalid task: %w", err)
	}
	if env != "" {
		if err := validateArg(env); err != nil {
			return "", fmt.Errorf("invalid env: %w", err)
		}
	}
	jobID := uuid.New().String()
	ctx, cancel := context.WithCancel(parentCtx)
	GlobalRegistry.Register(jobID, cancel)
	go func() {
		defer cancel()
		r, _ := RunTask(ctx, task, env, taskfilePath)
		GlobalRegistry.Complete(jobID, r)
	}()
	return jobID, nil
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
