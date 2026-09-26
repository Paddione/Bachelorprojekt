#!/usr/bin/env node
// plan-runner-fake-orch.mjs <port> <script.json> <request-log>
// Fake-Orchestrator fuer tests/spec/llm-local-dev/plan-runner.bats (T900504).
// Beantwortet POST /v1/chat/completions nacheinander mit den Tool-Calls aus script.json
// (Array von Schritten, jeder Schritt = { "name": "...", "args": { ... } }). Ist das Skript
// aufgebraucht, antwortet er mit finish. Jeder Request landet als JSON-Zeile im Request-Log.
// GET /health antwortet {"ok":true}, damit der Test auf die Bereitschaft warten kann.

import { createServer } from 'node:http';
import { readFileSync, appendFileSync } from 'node:fs';

const [port, scriptPath, logPath] = process.argv.slice(2);
const steps = JSON.parse(readFileSync(scriptPath, 'utf8'));
let n = 0;

createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    appendFileSync(logPath, JSON.stringify(JSON.parse(body || '{}')) + '\n');
    const step = steps[n] ?? { name: 'finish', args: { summary: 'script exhausted' } };
    n++;
    const message = {
      role: 'assistant', content: '',
      tool_calls: [{ id: `call_${n}`, type: 'function',
        function: { name: step.name, arguments: JSON.stringify(step.args ?? {}) } }],
    };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message, finish_reason: 'tool_calls' }], usage: {} }));
  });
}).listen(Number(port), '127.0.0.1');
