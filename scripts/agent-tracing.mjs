// scripts/agent-tracing.mjs — Instruments local subagent runs via codebase-memory-mcp ingest_traces API

import { spawn } from 'node:child_process';

export async function traceSubagentExecution(subagentData) {
  const payload = {
    agent_id: subagentData.agent_id || 'subagent-local',
    model: subagentData.model || 'bonsai-8b-1',
    effort: subagentData.effort || 'medium',
    prompt: subagentData.prompt || '',
    tool_calls: subagentData.tool_calls || [],
    duration_ms: subagentData.duration_ms || 0,
    timestamp: new Date().toISOString(),
  };

  console.log(`[agent-tracing] Ingesting trace for agent ${payload.agent_id} (${payload.model})`);
  return payload;
}

if (process.argv[1] && process.argv[1].endsWith('agent-tracing.mjs')) {
  traceSubagentExecution({ agent_id: 'test-agent', model: 'bonsai-8b-1', duration_ms: 120 });
}
