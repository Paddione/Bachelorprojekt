#!/usr/bin/env node
// plan-runner-fake-openai-worker.mjs <port> <script.json> <request-log>
// Fake-OpenAI-Server fuer den Direkt-Worker des plan-runners (T016656).
// Beantwortet POST /v1/chat/completions nacheinander mit den Eintraegen aus script.json
// (Array; Eintrag = { tool_calls: [{ name, args }], usage?: { prompt_tokens } } oder
// { content: "Text" } ohne Tool-Call). Ist das Skript aufgebraucht, antwortet er mit
// einem Text ohne Tool-Call. Jede Anfrage landet als JSON-Zeile im Request-Log.
// GET /v1/models und GET /health antworten 200, damit Preflight und Test warten koennen.

import { createServer } from 'node:http';
import { readFileSync, appendFileSync } from 'node:fs';

const [port, scriptPath, logPath] = process.argv.slice(2);
const steps = JSON.parse(readFileSync(scriptPath, 'utf8'));
let n = 0;

createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/v1/models')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(req.url === '/health' ? '{"ok":true}' : '{"data":[{"id":"w4a4"}]}');
    return;
  }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    appendFileSync(logPath, JSON.stringify(JSON.parse(body || '{}')) + '\n');
    const step = steps[n] ?? { content: 'script exhausted' };
    n++;
    const message = { role: 'assistant', content: step.content ?? '' };
    if (step.tool_calls?.length) {
      message.tool_calls = step.tool_calls.map((c, i) => ({
        id: `call_${n}_${i}`, type: 'function',
        function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
      }));
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      choices: [{ message, finish_reason: step.tool_calls?.length ? 'tool_calls' : 'stop' }],
      usage: step.usage ?? { prompt_tokens: 100, completion_tokens: 10 },
    }));
  });
}).listen(Number(port), '127.0.0.1');
