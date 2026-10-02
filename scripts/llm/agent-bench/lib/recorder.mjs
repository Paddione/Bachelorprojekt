// Trace-Recorder: ein node:http-Proxy je Rolle, der jeden OpenAI-Chat-Request
// unveraendert an den Upstream reicht und eine JSON-Zeile pro abgeschlossener
// /v1/chat/completions-Anfrage an `traceFile` anhaengt.
//
// Konventionen des Plans: Node 22, nur Standardbibliothek, ESM.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Secret-Muster, identisch zum Kern von scripts/finetune/collect_teacher_traces.py (SECRET_PATTERNS).
 * Bewusst konservativ: lieber ein Falsch-Positiv redigieren als ein Secret durchlassen.
 * `name` erscheint im Trace als Marker `[REDACTED:<name>]`.
 */
export const SECRET_PATTERNS = [
  { name: 'github-token', re: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  { name: 'openai-key', re: /sk-[A-Za-z0-9]{20,}/g },
  { name: 'aws-access-key', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'jwt', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: 'assigned-secret', re: /(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi },
  { name: 'long-base64', re: /[A-Za-z0-9+/]{40,}={0,2}/g },
];

/** Redigiert alle Secret-Treffer in `text`. Rueckgabe: der bereinigte Text. */
export function redact(text) {
  return redactWithCount(String(text)).text;
}

/** Wie `redact`, liefert aber zusaetzlich die Anzahl der Ersetzungen. */
export function redactWithCount(text) {
  let out = String(text);
  let count = 0;
  for (const pattern of SECRET_PATTERNS) {
    pattern.re.lastIndex = 0;
    out = out.replace(pattern.re, (match) => {
      // reine Hex-Laeufe (z. B. ein SHA-256-Dateiname) sind keine Base64-Secrets
      if (pattern.name === 'long-base64' && /^[0-9a-f]+$/i.test(match)) return match;
      count += 1;
      return `[REDACTED:${pattern.name}]`;
    });
  }
  return { text: out, count };
}

/** Rekursive Redigierung aller String-Werte eines JSON-Baumes. */
export function redactDeep(value) {
  let count = 0;
  const walk = (node) => {
    if (typeof node === 'string') {
      const result = redactWithCount(node);
      count += result.count;
      return result.text;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const out = {};
      for (const [key, val] of Object.entries(node)) out[key] = walk(val);
      return out;
    }
    return node;
  };
  return { value: walk(value), count };
}

const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
};

const DATA_URL_RE = /^data:([^;,]+);base64,(.*)$/s;

/**
 * Ersetzt Data-URL-Image-Parts durch content-addressed Referenzen
 * `{ type: 'image_ref', sha256, mime }`; Bytes werden unter `imageDir` abgelegt.
 * Der Trace enthaelt danach kein Inline-Base64.
 */
export function extractImageRefs(node, imageDir) {
  const state = { refs: [] };
  const walk = (value) => {
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      if (
        value.type === 'image_url' &&
        value.image_url &&
        typeof value.image_url.url === 'string'
      ) {
        const match = DATA_URL_RE.exec(value.image_url.url);
        if (match) {
          const [, mime, b64] = match;
          const bytes = Buffer.from(b64, 'base64');
          const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
          if (imageDir) fs.mkdirSync(imageDir, { recursive: true });
          const dest = imageDir
            ? path.join(imageDir, `${sha256}.${EXT_BY_MIME[mime] || 'bin'}`)
            : null;
          if (dest && !fs.existsSync(dest)) fs.writeFileSync(dest, bytes);
          state.refs.push({ sha256, mime, file: path.basename(dest || '') });
          return { type: 'image_ref', sha256, mime };
        }
      }
      const out = {};
      for (const [key, val] of Object.entries(value)) out[key] = walk(val);
      return out;
    }
    return value;
  };
  return { value: walk(node), imageCount: state.refs.length, imageRefs: state.refs };
}

function mergeToolCalls(acc, incoming) {
  for (const call of incoming) {
    const index = Number.isInteger(call.index) ? call.index : acc.length;
    while (acc.length <= index) acc.push({ id: null, type: 'function', function: { name: '', arguments: '' } });
    const target = acc[index];
    if (call.id) target.id = call.id;
    if (call.type) target.type = call.type;
    if (call.function) {
      if (call.function.name) target.function.name += call.function.name;
      if (call.function.arguments) target.function.arguments += call.function.arguments;
    }
  }
  return acc;
}

function contentToText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (typeof part === 'string' ? part : part && part.text ? part.text : ''))
    .join('');
}

function emptyAssembly() {
  return { content: '', reasoning_content: '', tool_calls: [], finish_reason: null, usage: null };
}

function applyChunk(assembly, payload) {
  if (!payload || typeof payload !== 'object') return assembly;
  if (payload.usage) assembly.usage = payload.usage;
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : null;
  if (!choice) return assembly;
  if (choice.finish_reason) assembly.finish_reason = choice.finish_reason;
  const delta = choice.delta || choice.message || {};
  if (typeof delta.content === 'string') assembly.content += delta.content;
  else if (Array.isArray(delta.content)) assembly.content += contentToText(delta.content);
  if (typeof delta.reasoning_content === 'string') assembly.reasoning_content += delta.reasoning_content;
  if (Array.isArray(delta.tool_calls)) mergeToolCalls(assembly.tool_calls, delta.tool_calls);
  return assembly;
}

function assemblyToResponse(assembly) {
  const message = { role: 'assistant', content: assembly.content };
  if (assembly.reasoning_content) message.reasoning_content = assembly.reasoning_content;
  if (assembly.tool_calls.length) message.tool_calls = assembly.tool_calls;
  return {
    message,
    finish_reason: assembly.finish_reason,
    usage: assembly.usage || null,
  };
}

function appendTraceLine(traceFile, entry) {
  if (!traceFile) return;
  const { value, count } = redactDeep(entry);
  value.redactions = count;
  fs.mkdirSync(path.dirname(traceFile), { recursive: true });
  fs.appendFileSync(traceFile, `${JSON.stringify(value)}\n`);
}

function splitRequestPayload(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { messages: [], tools: null, model: null, params: {} };
  }
  const { messages, tools, model, ...params } = parsed;
  return { messages: messages ?? [], tools: tools ?? null, model: model ?? null, params };
}

/**
 * Startet einen Recorder-Proxy fuer genau eine Rolle.
 * @returns {Promise<{url: string, port: number, close: () => Promise<void>}>}
 */
export function startRecorder({ upstream, role, traceFile, imageDir, port = 0 }) {
  if (!upstream) throw new Error('startRecorder benoetigt ein upstream');
  if (!role) throw new Error('startRecorder benoetigt eine role');
  const upstreamBase = upstream.replace(/\/+$/, '');

  const server = http.createServer((req, res) => {
    handle(req, res, { upstreamBase, role, traceFile, imageDir }).catch((err) => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: String(err && err.message ? err.message : err) } }));
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      const actual = server.address();
      resolve({
        url: `http://127.0.0.1:${actual.port}`,
        port: actual.port,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
}

async function handle(req, res, ctx) {
  const started = Date.now();
  const target = new URL(req.url || '/', `${ctx.upstreamBase}/`);
  const chunks = [];
  await new Promise((done, fail) => {
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', done);
    req.on('error', fail);
  });
  const body = Buffer.concat(chunks);

  const headers = { ...req.headers };
  delete headers.host;
  delete headers['content-length'];
  if (body.length) headers['content-length'] = String(body.length);

  const logged = req.method === 'POST' && target.pathname === '/v1/chat/completions';

  const response = await new Promise((resolve, reject) => {
    const proxyReq = http.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || 80,
        path: `${target.pathname}${target.search}`,
        method: req.method,
        headers,
      },
      (proxyRes) => resolve(proxyRes),
    );
    proxyReq.on('error', reject);
    if (body.length) proxyReq.write(body);
    proxyReq.end();
  });

  const contentType = String(response.headers['content-type'] || '');
  res.writeHead(response.statusCode || 200, response.headers);

  let parsedRequest = null;
  if (logged && body.length) {
    try {
      parsedRequest = JSON.parse(body.toString('utf8'));
    } catch {
      parsedRequest = null;
    }
  }

  if (contentType.includes('text/event-stream')) {
    const assembly = emptyAssembly();
    let buffer = '';
    await new Promise((done, fail) => {
      response.on('data', (chunk) => {
        res.write(chunk);
        buffer += chunk.toString('utf8');
        let index = buffer.indexOf('\n');
        while (index >= 0) {
          const line = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 1);
          index = buffer.indexOf('\n');
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            applyChunk(assembly, JSON.parse(payload));
          } catch {
            /* unparsierbares SSE-Fragment ignorieren */
          }
        }
      });
      response.on('end', done);
      response.on('error', fail);
    });
    res.end();
    writeEntry(ctx, logged, parsedRequest, assemblyToResponse(assembly), Date.now() - started);
    return;
  }

  const raw = Buffer.concat(
    await new Promise((done, fail) => {
      const parts = [];
      response.on('data', (chunk) => parts.push(chunk));
      response.on('end', () => done(parts));
      response.on('error', fail);
    }),
  );
  res.end(raw);

  if (!logged) return;
  let parsed = null;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch {
    parsed = null;
  }
  const assembly = emptyAssembly();
  applyChunk(assembly, parsed);
  writeEntry(ctx, logged, parsedRequest, assemblyToResponse(assembly), Date.now() - started);
}

function writeEntry(ctx, logged, parsedRequest, responsePayload, ms) {
  if (!logged || !ctx.traceFile) return;
  const payload = splitRequestPayload(parsedRequest);
  const extracted = extractImageRefs(payload.messages, ctx.imageDir);
  const entry = {
    ts: new Date().toISOString(),
    role: ctx.role,
    request: {
      messages: extracted.value,
      tools: payload.tools,
      model: payload.model,
      params: payload.params,
    },
    response: responsePayload,
    ms,
    images: extracted.imageRefs,
    image_count: extracted.imageCount,
  };
  appendTraceLine(ctx.traceFile, entry);
}
