#!/usr/bin/env node

import readline from 'node:readline';
import process from 'node:process';
import { parseTaskfileDAG, schedule, graphToMermaid, graphToJSON } from './planner.mjs';
import { runTask, executePlan, globalRegistry } from './runner.mjs';

// Parse command line arguments
let taskfilePath = 'Taskfile.yml';
let otelEndpoint = 'localhost:4317';

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') {
    console.log('Usage: mcp-task-runner [options]');
    console.log('Options:');
    console.log('  --taskfile <path>       Path to Taskfile.yml (default: Taskfile.yml)');
    console.log('  --otel-endpoint <host>  OTel Collector gRPC endpoint (default: localhost:4317)');
    console.log('  --help, -h              Show this help');
    process.exit(0);
  } else if (arg === '--taskfile' && i + 1 < args.length) {
    taskfilePath = args[++i];
  } else if (arg.startsWith('--taskfile=')) {
    taskfilePath = arg.slice('--taskfile='.length);
  } else if (arg === '--otel-endpoint' && i + 1 < args.length) {
    otelEndpoint = args[++i];
  } else if (arg.startsWith('--otel-endpoint=')) {
    otelEndpoint = arg.slice('--otel-endpoint='.length);
  }
}

if (taskfilePath.includes('..')) {
  console.error("taskfile path must not contain '..'");
  process.exit(1);
}

const TOOLS = [
  {
    name: 'plan_tasks',
    description: 'Parse Taskfile deps and return a parallel execution plan',
    inputSchema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              task: { type: 'string' },
              env: { type: 'string' },
            },
            required: ['task', 'env'],
          },
          description: 'Array of {task: string, env: string} objects',
        },
      },
      required: ['tasks'],
    },
  },
  {
    name: 'run_task',
    description: 'Execute a single go-task task with OTel tracing',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task name, e.g. workspace:deploy' },
        env: { type: 'string', description: 'ENV value, e.g. mentolder' },
      },
      required: ['task', 'env'],
    },
  },
  {
    name: 'execute_plan',
    description: 'Execute a plan returned by plan_tasks; groups run in parallel, fail-fast on error',
    inputSchema: {
      type: 'object',
      properties: {
        plan: { type: 'object', description: 'Plan object from plan_tasks' },
      },
      required: ['plan'],
    },
  },
  {
    name: 'get_task_graph',
    description: 'Return the full task dependency DAG from the Taskfile. Default format is Mermaid (graph TD); use format=json for programmatic consumption.',
    inputSchema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['mermaid', 'json'],
          description: 'Output format: mermaid (default) or json',
        },
      },
    },
  },
  {
    name: 'run_task_async',
    description: 'Start a task in the background and return a job_id immediately. Poll get_task_result to check progress.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task name, e.g. workspace:deploy' },
        env: { type: 'string', description: 'ENV value, e.g. mentolder (optional)' },
      },
      required: ['task'],
    },
  },
  {
    name: 'cancel_task',
    description: 'Cancel a running async task by job_id. Sends SIGTERM; SIGKILL follows after 5 seconds if the process has not exited.',
    inputSchema: {
      type: 'object',
      properties: {
        job_id: { type: 'string', description: 'Job ID returned by run_task_async' },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'get_task_result',
    description: 'Poll the status and output of an async task. Returns status=\'running\' while in progress, \'done\' or \'cancelled\' when finished.',
    inputSchema: {
      type: 'object',
      properties: {
        job_id: { type: 'string', description: 'Job ID returned by run_task_async' },
      },
      required: ['job_id'],
    },
  },
];

async function handleToolCall(name, args) {
  switch (name) {
    case 'plan_tasks': {
      const tasks = args?.tasks;
      if (!Array.isArray(tasks)) {
        return { isError: true, content: [{ type: 'text', text: 'invalid tasks: array expected' }] };
      }
      try {
        const graph = parseTaskfileDAG(taskfilePath);
        const plan = schedule(graph, tasks);
        return { content: [{ type: 'text', text: JSON.stringify(plan) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text', text: err.message }] };
      }
    }

    case 'run_task': {
      const task = args?.task;
      const env = args?.env;
      if (!task || !env) {
        return { isError: true, content: [{ type: 'text', text: 'task and env are required' }] };
      }
      try {
        const result = await runTask(task, env, taskfilePath);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text', text: err.message }] };
      }
    }

    case 'execute_plan': {
      const plan = args?.plan;
      if (!plan || typeof plan !== 'object') {
        return { isError: true, content: [{ type: 'text', text: 'invalid plan object' }] };
      }
      try {
        const results = await executePlan(plan, taskfilePath);
        return { content: [{ type: 'text', text: JSON.stringify(results) }] };
      } catch (err) {
        const resultsText = err.results ? JSON.stringify(err.results) + '\n' : '';
        return { content: [{ type: 'text', text: resultsText + '[error] ' + err.message }] };
      }
    }

    case 'get_task_graph': {
      const format = args?.format || 'mermaid';
      try {
        const graph = parseTaskfileDAG(taskfilePath);
        const text = format === 'json' ? graphToJSON(graph) : graphToMermaid(graph);
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text', text: `parse taskfile: ${err.message}` }] };
      }
    }

    case 'run_task_async': {
      const task = args?.task;
      const env = args?.env || '';
      if (!task) {
        return { isError: true, content: [{ type: 'text', text: 'task is required' }] };
      }
      try {
        const jobId = globalRegistry.startTask(task, env, taskfilePath);
        return { content: [{ type: 'text', text: JSON.stringify({ job_id: jobId, status: 'running' }) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text', text: err.message }] };
      }
    }

    case 'cancel_task': {
      const jobId = args?.job_id;
      if (!jobId) {
        return { isError: true, content: [{ type: 'text', text: 'job_id is required' }] };
      }
      const res = globalRegistry.cancelTask(jobId);
      if (!res.found) {
        return { isError: true, content: [{ type: 'text', text: `job not found: ${jobId}` }] };
      }
      const out = { cancelled: res.wasCancelled, job_id: jobId };
      if (!res.wasCancelled) {
        out.reason = 'already done';
      }
      return { content: [{ type: 'text', text: JSON.stringify(out) }] };
    }

    case 'get_task_result': {
      const jobId = args?.job_id;
      if (!jobId) {
        return { isError: true, content: [{ type: 'text', text: 'job_id is required' }] };
      }
      const res = globalRegistry.lookup(jobId);
      if (!res.found) {
        return { isError: true, content: [{ type: 'text', text: `job not found: ${jobId}` }] };
      }
      const out = { status: res.status, job_id: jobId };
      if (res.exitCode !== null) {
        out.exit_code = res.exitCode;
        out.output = res.output;
      }
      return { content: [{ type: 'text', text: JSON.stringify(out) }] };
    }

    default:
      return { isError: true, content: [{ type: 'text', text: `unknown tool: ${name}` }] };
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let request;
  try {
    request = JSON.parse(trimmed);
  } catch (err) {
    console.log(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: `Parse error: ${err.message}` },
    }));
    return;
  }

  const { id, method, params } = request;

  if (method === 'initialize') {
    console.log(JSON.stringify({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'mcp-task-runner', version: '1.0.0' },
      },
    }));
    return;
  }

  if (method === 'notifications/initialized') {
    // No response required for notifications
    return;
  }

  if (method === 'tools/list') {
    console.log(JSON.stringify({
      jsonrpc: '2.0',
      id,
      result: { tools: TOOLS },
    }));
    return;
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const toolArgs = params?.arguments || {};
    const result = await handleToolCall(toolName, toolArgs);
    console.log(JSON.stringify({
      jsonrpc: '2.0',
      id,
      result,
    }));
    return;
  }

  console.log(JSON.stringify({
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  }));
});
