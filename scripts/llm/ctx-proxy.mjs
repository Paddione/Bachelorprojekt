#!/usr/bin/env node
// ctx-proxy.mjs — protokollierender Durchreich-Proxy vor einem OpenAI-kompatiblen
// Server (vLLM, llama.cpp). Haelt je Chat-Anfrage fest, wie viel Kontext ein
// Harness tatsaechlich schickt: Prompt-Tokens laut Server, Anzahl Nachrichten,
// Anzahl Tool-Definitionen, Laenge des System-Prompts.
//
// Zweck: Harness-Vergleich (omp vs. opencode) auf demselben Modell. Die Zahl,
// die zaehlt, ist `prompt_tokens` der ERSTEN Anfrage (Startkontext des Harness)
// und das Maximum ueber den Lauf (Spitzenkontext).
//
// Bei Streaming-Anfragen wird `stream_options.include_usage` erzwungen, sonst
// meldet der Server keine Token-Zahlen. Sonst bleibt die Anfrage unveraendert.
//
// Aufruf:
//   node scripts/llm/ctx-proxy.mjs serve --listen 8124 --upstream http://127.0.0.1:8123 --log <datei.jsonl>
//   node scripts/llm/ctx-proxy.mjs summarize <datei.jsonl> [--label <lauf>]
//
// Das Label eines Laufs setzt der Aufrufer ueber die Datei <log>.label (eine
// Zeile); der Proxy liest sie je Anfrage, damit er zwischen Laeufen nicht neu
// starten muss.

import http from 'node:http';
import { appendFileSync, readFileSync, existsSync } from 'node:fs';

const [cmd, ...rest] = process.argv.slice(2);
const opt = (name, def) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : def;
};

function currentLabel(log) {
  try {
    return readFileSync(`${log}.label`, 'utf8').trim() || 'unlabeled';
  } catch {
    return 'unlabeled';
  }
}

function serve() {
  const port = Number(opt('listen', 8124));
  const upstream = new URL(opt('upstream', 'http://127.0.0.1:8123'));
  const log = opt('log', 'ctx-proxy.jsonl');
  let seq = 0;

  http
    .createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        let body = Buffer.concat(chunks);
        let entry = null;
        if (req.method === 'POST' && /\/chat\/completions$/.test(req.url)) {
          try {
            const j = JSON.parse(body.toString('utf8'));
            if (j.stream) j.stream_options = { ...(j.stream_options || {}), include_usage: true };
            const msgs = Array.isArray(j.messages) ? j.messages : [];
            const text = (m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''));
            entry = {
              label: currentLabel(log),
              seq: ++seq,
              ts: new Date().toISOString(),
              model: j.model,
              stream: Boolean(j.stream),
              messages: msgs.length,
              system_chars: msgs.filter((m) => m.role === 'system').reduce((a, m) => a + text(m).length, 0),
              total_chars: msgs.reduce((a, m) => a + text(m).length, 0),
              tools: Array.isArray(j.tools) ? j.tools.length : 0,
              tools_chars: Array.isArray(j.tools) ? JSON.stringify(j.tools).length : 0,
            };
            body = Buffer.from(JSON.stringify(j));
          } catch {
            /* kein JSON: unveraendert durchreichen */
          }
        }
        const t0 = Date.now();
        const headers = { ...req.headers, host: upstream.host, 'content-length': String(body.length) };
        const up = http.request(
          { hostname: upstream.hostname, port: upstream.port, path: req.url, method: req.method, headers },
          (ur) => {
            res.writeHead(ur.statusCode, ur.headers);
            let buf = '';
            ur.on('data', (c) => {
              res.write(c);
              if (entry) {
                buf += c.toString('utf8');
                if (buf.length > 1 << 20) buf = buf.slice(-(1 << 16));
              }
            });
            ur.on('end', () => {
              res.end();
              if (!entry) return;
              let usage = null;
              let finish = null;
              let toolCalls = 0;
              const objs = entry.stream
                ? buf.split('\n').filter((l) => l.startsWith('data:') && !l.includes('[DONE]')).map((l) => l.slice(5))
                : [buf];
              for (const s of objs) {
                try {
                  const o = JSON.parse(s);
                  if (o.usage) usage = o.usage;
                  for (const ch of o.choices || []) {
                    if (ch.finish_reason) finish = ch.finish_reason;
                    const tc = ch.delta?.tool_calls || ch.message?.tool_calls;
                    if (tc) toolCalls = Math.max(toolCalls, ...tc.map((t) => (t.index ?? 0) + 1));
                  }
                } catch {
                  /* Teilzeile */
                }
              }
              appendFileSync(
                log,
                `${JSON.stringify({
                  ...entry,
                  status: ur.statusCode,
                  ms: Date.now() - t0,
                  prompt_tokens: usage?.prompt_tokens ?? null,
                  completion_tokens: usage?.completion_tokens ?? null,
                  finish_reason: finish,
                  tool_calls: toolCalls,
                })}\n`,
              );
            });
          },
        );
        up.on('error', (e) => {
          res.writeHead(502);
          res.end(String(e.message));
        });
        up.end(body);
      });
    })
    .listen(port, '127.0.0.1', () => console.error(`ctx-proxy :${port} -> ${upstream.origin}, log ${log}`));
}

function summarize() {
  const file = rest[0];
  const only = opt('label', null);
  if (!file) {
    console.error('usage: ctx-proxy.mjs summarize <datei.jsonl> [--label <lauf>]');
    process.exit(1);
  }
  // Noch keine Anfrage protokolliert (z. B. Harness startete gar nicht): leeres
  // Ergebnis statt Fehler — der Aufrufer wertet "0 Anfragen" selbst aus.
  const rows = !existsSync(file) ? [] : readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const byLabel = new Map();
  for (const r of rows) {
    if (only && r.label !== only) continue;
    if (!byLabel.has(r.label)) byLabel.set(r.label, []);
    byLabel.get(r.label).push(r);
  }
  const out = [];
  for (const [label, rs] of byLabel) {
    const pt = rs.map((r) => r.prompt_tokens).filter((n) => n != null);
    out.push({
      label,
      requests: rs.length,
      errors: rs.filter((r) => r.status >= 400).length,
      first_prompt_tokens: rs[0].prompt_tokens,
      first_system_chars: rs[0].system_chars,
      first_tools: rs[0].tools,
      first_tools_chars: rs[0].tools_chars,
      max_prompt_tokens: pt.length ? Math.max(...pt) : null,
      sum_prompt_tokens: pt.reduce((a, b) => a + b, 0),
      sum_completion_tokens: rs.reduce((a, r) => a + (r.completion_tokens ?? 0), 0),
      tool_call_turns: rs.filter((r) => r.tool_calls > 0).length,
      last_finish: rs.at(-1).finish_reason,
    });
  }
  console.log(JSON.stringify(only ? out[0] ?? null : out, null, only ? 0 : 2));
}

if (cmd === 'serve') serve();
else if (cmd === 'summarize') summarize();
else {
  console.error('usage: ctx-proxy.mjs serve|summarize ...');
  process.exit(1);
}
