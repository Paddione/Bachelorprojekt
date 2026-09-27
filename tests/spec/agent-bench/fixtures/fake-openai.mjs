// fixtures/fake-openai.mjs — skriptbarer OpenAI-kompatibler Fake-Server fuer
// tests/spec/agent-bench/. Bespielt Recorder, Rollen und plan-runner.
//
// Env:
//   FAKE_OPENAI_SCRIPT=<json>  Queue von Antworten (Datei oder inline-JSON).
//     Eintrag: { content?, tool_calls?[{ name, arguments }], usage?,
//                finish_reason?, sse?:bool, status?:number }
//     Fehlende Eintraege -> Default-Antwort { content: "fake-ok" }.
//   FAKE_OPENAI_LOG=<datei>     Haengt je Anfrage eine Zeile an:
//     "<methode> <pfad> model=<m> tools=<namen,kommagetrennt> images=<n>"
//   FAKE_OPENAI_SLEEP=<ms>      Verzoegerung je Antwort.
//   FAKE_OPENAI_PORT=<port>      0 = Zufallsport (Default).
//
// stdout beim Start: `FAKE-OPENAI-PORT=<port>` (Tests parsen das).
// GET /v1/models -> { data: [{ id: "fake" }] } (fuer waitForModels).

import http from 'node:http';
import fs from 'node:fs';

function loadScript() {
  const raw = process.env.FAKE_OPENAI_SCRIPT || '';
  if (!raw) return [];
  try {
    if (fs.existsSync(raw)) return JSON.parse(fs.readFileSync(raw, 'utf8'));
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

const queue = loadScript();
const logFile = process.env.FAKE_OPENAI_LOG || '';
const sleepMs = Number(process.env.FAKE_OPENAI_SLEEP || 0);

const log = (line) => {
  if (logFile) fs.appendFileSync(logFile, `${line}\n`);
};

const countImages = (messages) => {
  let n = 0;
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') {
      if (v.type === 'image_url') n += 1;
      Object.values(v).forEach(walk);
    }
  };
  walk(messages);
  return n;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://fake/');
  if (req.method === 'GET' && url.pathname === '/v1/models') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'fake' }] }));
    return;
  }
  if (req.method !== 'POST' || url.pathname !== '/v1/chat/completions') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'not found' } }));
    return;
  }
  const chunks = [];
  await new Promise((done) => {
    req.on('data', (c) => chunks.push(c));
    req.on('end', done);
  });
  let body = {};
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    body = {};
  }
  const toolNames = Array.isArray(body.tools)
    ? body.tools.map((t) => t?.function?.name || t?.name || '?').join(',')
    : '';
  log(`POST /v1/chat/completions model=${body.model || ''} tools=${toolNames} images=${countImages(body.messages)}`);
  if (sleepMs > 0) await sleep(sleepMs);

  const entry = queue.length ? queue.shift() : { content: 'fake-ok' };
  if (entry.status && entry.status !== 200) {
    res.writeHead(entry.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: entry.content || 'fake error' } }));
    return;
  }
  const toolCalls = (entry.tool_calls || []).map((c, i) => ({
    id: `call_${i}`,
    type: 'function',
    function: { name: c.name, arguments: typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.arguments ?? {}) },
  }));
  const message = { role: 'assistant', content: entry.content ?? '' };
  if (toolCalls.length) message.tool_calls = toolCalls;
  const payload = {
    id: 'fake-1',
    object: 'chat.completion',
    choices: [{ index: 0, message, finish_reason: entry.finish_reason || (toolCalls.length ? 'tool_calls' : 'stop') }],
    usage: entry.usage || { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };

  if (entry.sse) {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const text = String(entry.content ?? '');
    const mid = Math.ceil(text.length / 2);
    for (const part of [text.slice(0, mid), text.slice(mid)]) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}\n\n`);
    }
    if (toolCalls.length) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: toolCalls.map((t, i) => ({ ...t, index: i })) } }] })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: payload.choices[0].finish_reason }], usage: payload.usage })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
});

const port = Number(process.env.FAKE_OPENAI_PORT || 0);
server.listen(port, '127.0.0.1', () => {
  console.log(`FAKE-OPENAI-PORT=${server.address().port}`);
});
