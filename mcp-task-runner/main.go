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

	if err := server.ServeStdio(s); err != nil {
		log.Fatalf("mcp-task-runner: %v", err)
	}
}
