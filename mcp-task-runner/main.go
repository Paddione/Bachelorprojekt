// mcp-task-runner/main.go
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
	"github.com/paddione/mcp-task-runner/planner"
	"github.com/paddione/mcp-task-runner/runner"
	"github.com/paddione/mcp-task-runner/telemetry"
)

func main() {
	otelEndpoint := flag.String("otel-endpoint", "localhost:4317", "OTel Collector gRPC endpoint")
	taskfilePath := flag.String("taskfile", "Taskfile.yml", "Path to Taskfile.yml")
	flag.Parse()

	// Path traversal guard — taskfilePath is operator-controlled but guard against ..
	if strings.Contains(*taskfilePath, "..") {
		fmt.Fprintf(os.Stderr, "taskfile path must not contain '..'\n")
		os.Exit(1)
	}

	ctx := context.Background()
	shutdown, err := telemetry.Init(ctx, *otelEndpoint)
	if err != nil {
		fmt.Fprintf(os.Stderr, "otel: %v\n", err)
	}
	defer shutdown()

	s := server.NewMCPServer(
		"mcp-task-runner",
		"1.0.0",
		server.WithToolCapabilities(true),
	)

	// ── plan_tasks ────────────────────────────────────────────────────────────
	planTasksTool := mcp.NewTool("plan_tasks",
		mcp.WithDescription("Parse Taskfile deps and return a parallel execution plan"),
		mcp.WithArray("tasks",
			mcp.Required(),
			mcp.Description("Array of {task: string, env: string} objects"),
		),
	)
	s.AddTool(planTasksTool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		type input struct {
			Task string `json:"task"`
			Env  string `json:"env"`
		}
		raw, _ := json.Marshal(req.GetArguments()["tasks"])
		var inputs []input
		if err := json.Unmarshal(raw, &inputs); err != nil {
			return mcp.NewToolResultError("invalid tasks: " + err.Error()), nil
		}

		graph, err := planner.Parse(*taskfilePath)
		if err != nil {
			return mcp.NewToolResultError("parse taskfile: " + err.Error()), nil
		}

		reqs := make([]planner.TaskRequest, len(inputs))
		for i, in := range inputs {
			reqs[i] = planner.TaskRequest{Task: in.Task, Env: in.Env}
		}
		plan, err := planner.Schedule(graph, reqs)
		if err != nil {
			return mcp.NewToolResultError("schedule: " + err.Error()), nil
		}

		b, _ := json.Marshal(plan)
		return mcp.NewToolResultText(string(b)), nil
	})

	// ── run_task ──────────────────────────────────────────────────────────────
	runTaskTool := mcp.NewTool("run_task",
		mcp.WithDescription("Execute a single go-task task with OTel tracing"),
		mcp.WithString("task", mcp.Required(), mcp.Description("Task name, e.g. workspace:deploy")),
		mcp.WithString("env", mcp.Required(), mcp.Description("ENV value, e.g. mentolder")),
	)
	s.AddTool(runTaskTool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := req.GetArguments()
		task, _ := args["task"].(string)
		env, _ := args["env"].(string)
		if task == "" || env == "" {
			return mcp.NewToolResultError("task and env are required"), nil
		}
		result, err := runner.RunTask(ctx, task, env, *taskfilePath)
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
		b, _ := json.Marshal(result)
		return mcp.NewToolResultText(string(b)), nil
	})

	// ── execute_plan ──────────────────────────────────────────────────────────
	executePlanTool := mcp.NewTool("execute_plan",
		mcp.WithDescription("Execute a plan returned by plan_tasks; groups run in parallel, fail-fast on error"),
		mcp.WithObject("plan", mcp.Required(), mcp.Description("Plan object from plan_tasks")),
	)
	s.AddTool(executePlanTool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, _ := json.Marshal(req.GetArguments()["plan"])
		var plan planner.Plan
		if err := json.Unmarshal(raw, &plan); err != nil {
			return mcp.NewToolResultError("invalid plan: " + err.Error()), nil
		}
		results, execErr := runner.ExecutePlan(ctx, plan, *taskfilePath)
		b, _ := json.Marshal(results)
		if execErr != nil {
			return mcp.NewToolResultText(string(b) + "\n[error] " + execErr.Error()), nil
		}
		return mcp.NewToolResultText(string(b)), nil
	})

	// ── get_task_graph ────────────────────────────────────────────────────────
	getTaskGraphTool := mcp.NewTool("get_task_graph",
		mcp.WithDescription("Return the full task dependency DAG from the Taskfile. Default format is Mermaid (graph TD); use format=json for programmatic consumption."),
		mcp.WithString("format", mcp.Description("Output format: mermaid (default) or json"),
			mcp.Enum("mermaid", "json")),
	)
	s.AddTool(getTaskGraphTool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := req.GetArguments()
		format, _ := args["format"].(string)
		if format == "" {
			format = "mermaid"
		}
		g, err := planner.Parse(*taskfilePath)
		if err != nil {
			return mcp.NewToolResultError("parse taskfile: " + err.Error()), nil
		}
		switch format {
		case "json":
			return mcp.NewToolResultText(planner.GraphToJSON(g)), nil
		default:
			return mcp.NewToolResultText(planner.GraphToMermaid(g)), nil
		}
	})

	// ── run_task_async ────────────────────────────────────────────────────────
	runTaskAsyncTool := mcp.NewTool("run_task_async",
		mcp.WithDescription("Start a task in the background and return a job_id immediately. Poll get_task_result to check progress."),
		mcp.WithString("task", mcp.Required(), mcp.Description("Task name, e.g. workspace:deploy")),
		mcp.WithString("env", mcp.Description("ENV value, e.g. mentolder (optional)")),
	)
	s.AddTool(runTaskAsyncTool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := req.GetArguments()
		task, _ := args["task"].(string)
		env, _ := args["env"].(string)
		if task == "" {
			return mcp.NewToolResultError("task is required"), nil
		}
		jobID, err := runner.StartTask(ctx, task, env, *taskfilePath)
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
		b, _ := json.Marshal(map[string]string{"job_id": jobID, "status": "running"})
		return mcp.NewToolResultText(string(b)), nil
	})

	// ── cancel_task ───────────────────────────────────────────────────────────
	cancelTaskTool := mcp.NewTool("cancel_task",
		mcp.WithDescription("Cancel a running async task by job_id. Sends SIGTERM; SIGKILL follows after 5 seconds if the process has not exited."),
		mcp.WithString("job_id", mcp.Required(), mcp.Description("Job ID returned by run_task_async")),
	)
	s.AddTool(cancelTaskTool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := req.GetArguments()
		jobID, _ := args["job_id"].(string)
		if jobID == "" {
			return mcp.NewToolResultError("job_id is required"), nil
		}
		found, wasCancelled := runner.GlobalRegistry.Cancel(jobID)
		if !found {
			return mcp.NewToolResultError("job not found: " + jobID), nil
		}
		type cancelResult struct {
			Cancelled bool   `json:"cancelled"`
			JobID     string `json:"job_id"`
			Reason    string `json:"reason,omitempty"`
		}
		res := cancelResult{Cancelled: wasCancelled, JobID: jobID}
		if !wasCancelled {
			res.Reason = "already done"
		}
		b, _ := json.Marshal(res)
		return mcp.NewToolResultText(string(b)), nil
	})

	// ── get_task_result ───────────────────────────────────────────────────────
	getTaskResultTool := mcp.NewTool("get_task_result",
		mcp.WithDescription("Poll the status and output of an async task. Returns status='running' while in progress, 'done' or 'cancelled' when finished."),
		mcp.WithString("job_id", mcp.Required(), mcp.Description("Job ID returned by run_task_async")),
	)
	s.AddTool(getTaskResultTool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := req.GetArguments()
		jobID, _ := args["job_id"].(string)
		if jobID == "" {
			return mcp.NewToolResultError("job_id is required"), nil
		}
		found, status, result := runner.GlobalRegistry.Lookup(jobID)
		if !found {
			return mcp.NewToolResultError("job not found: " + jobID), nil
		}
		type taskResult struct {
			Status   string `json:"status"`
			JobID    string `json:"job_id"`
			ExitCode *int   `json:"exit_code,omitempty"`
			Output   string `json:"output,omitempty"`
		}
		res := taskResult{Status: string(status), JobID: jobID}
		if result != nil {
			res.ExitCode = &result.ExitCode
			res.Output = result.Stdout + result.Stderr
		}
		b, _ := json.Marshal(res)
		return mcp.NewToolResultText(string(b)), nil
	})

	if err := server.ServeStdio(s); err != nil {
		log.Fatalf("mcp-task-runner: %v", err)
	}
}
