#!/usr/bin/env node
/**
 * run-pipeline.mjs — Run pipeline.mjs directly via node, bypassing the Workflow sandbox.
 *
 * For deterministic operations (scout, phase-event, plan-lint, ticket-get, etc.),
 * calls pipeline-runner.js directly via execFileSync.
 *
 * For LLM operations (design, plan, implement via agent(prompt) without pipeline-runner.js),
 * spawns a real claude -p sub-agent.
 *
 * Usage: node run-pipeline.mjs '{"ticket_id":"T002003","brand":"mentolder",...}'
 */
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';

const REPO = '/home/patrick/Bachelorprojekt';
const RUNNER_PATH = path.join(REPO, 'scripts/factory/pipeline-runner.js');
const CLAUDE_BIN = process.env.FACTORY_CLAUDE_BIN || 'claude';

// Mock Workflow-injected globals.
const parsedArgs = JSON.parse(process.argv[2] || '{}');
globalThis.args = parsedArgs;
globalThis.log = (...args) => console.error('[pipeline]', ...args);
globalThis.phase = () => {};

// Parse runRunner() prompts: extract command + payload from the pipeline-runner.js command string.
function parseRunRunnerPrompt(prompt) {
  // Format: "...node scripts/factory/pipeline-runner.js <command> '<payload>'..."
  const m = prompt.match(/pipeline-runner\.js\s+(\S+)\s+'(\{.*\})'/s);
  if (m) return { command: m[1], payload: JSON.parse(m[2]) };
  // Also handle: node scripts/factory/pipeline-runner.js <command> "$payload"
  const m2 = prompt.match(/pipeline-runner\.js\s+(\S+)\s+"(\{.*\})"/s);
  if (m2) return { command: m2[1], payload: JSON.parse(m2[2]) };
  return null;
}

// Call pipeline-runner.js directly.
function runRunnerLocal(command, payload) {
  const payloadStr = JSON.stringify(payload);
  try {
    const raw = execFileSync('node', [RUNNER_PATH, command, payloadStr], {
      encoding: 'utf8', timeout: 120000, cwd: REPO
    }).trim();
    const jsonLines = raw.split('\n').filter(l => l.trim().startsWith('{') || l.trim().startsWith('['));
    return jsonLines.length > 0 ? jsonLines[jsonLines.length - 1] : raw;
  } catch (e) {
    console.error(`runRunnerLocal error for ${command}:`, e.message);
    return null;
  }
}

// Spawn a claude -p sub-agent for LLM operations.
function runClaudeSubagent(prompt, label) {
  console.error(`[subagent] spawning claude -p for: ${label || prompt.slice(0, 80)}`);
  try {
    const result = spawnSync(CLAUDE_BIN, ['-p', prompt, '--dangerously-skip-permissions'], {
      encoding: 'utf8',
      timeout: 600000,
      cwd: REPO,
      env: { ...process.env }
    });
    if (result.error) {
      console.error(`[subagent] error:`, result.error.message);
      return null;
    }
    const stdout = result.stdout?.trim() || '';
    // Try to extract JSON from the output — sub-agents often wrap JSON in text.
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        console.error(`[subagent] returned JSON: ${JSON.stringify(parsed).slice(0, 200)}`);
        return parsed;
      } catch { /* not JSON, return raw */ }
    }
    console.error(`[subagent] raw output (${stdout.length} chars): ${stdout.slice(0, 200)}`);
    return stdout || null;
  } catch (e) {
    console.error(`[subagent] error:`, e.message);
    return null;
  }
}

// The agent function that pipeline.mjs will call.
globalThis.agent = async (prompt, opts) => {
  // First: check if this is a runRunner() prompt (deterministic operation).
  const parsed = parseRunRunnerPrompt(prompt);
  if (parsed) {
    console.error(`[agent] deterministic: ${parsed.command}`);
    return runRunnerLocal(parsed.command, parsed.payload);
  }

  // Otherwise: LLM operation — spawn a claude sub-agent.
  const label = opts?.label || opts?.phase || 'llm-op';
  console.error(`[agent] LLM: ${label} (phase=${opts?.phase || 'none'})`);
  return runClaudeSubagent(prompt, label);
};

globalThis.parallel = async (fns) => Promise.all(fns.map(fn => fn()));
globalThis.pipeline = async (items, ...stages) => {
  let result = items;
  for (const stage of stages) {
    const next = [];
    await Promise.all(result.map((item, i) => stage(item, result[i-1], i).then(r => next.push(r))));
    result = next;
  }
  return result;
};

console.error(`run-pipeline.mjs: starting with args=${JSON.stringify(parsedArgs)}`);

import(path.join(REPO, 'scripts/factory/pipeline.mjs')).then(async (m) => {
  try {
    const result = await m.main();
    if (result) console.log(JSON.stringify(result));
  } catch (e) {
    console.error('Pipeline error:', e.message);
    console.error(e.stack?.split('\n').slice(0, 10).join('\n'));
    process.exit(1);
  }
});
