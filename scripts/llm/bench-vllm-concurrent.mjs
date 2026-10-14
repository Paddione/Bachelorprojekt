#!/usr/bin/env node
// bench-vllm-concurrent.mjs — Gesamtdurchsatz eines vLLM-Servers unter N
// gleichzeitigen Stroemen. vLLM-Gegenstueck zu bench-concurrent.sh (das spricht
// den llama.cpp-Endpunkt /completion und dessen `timings` an, die vLLM nicht hat).
//
// Getrennt gemessen, wie in bench-concurrent.sh:
//   GESAMT      — erzeugte Token aller Stroeme / Wanduhr des ganzen Fensters
//   je Strom    — Mittel ueber (Token / eigene Dauer) der einzelnen Anfragen
// Dazu, weil vLLM das liefert und es die Zahl erst belastbar macht:
//   TTFT        — Zeit bis zum ersten Token je Strom (Streaming), Median/Max
//   running max — Spitze von vllm:num_requests_running waehrend des Fensters.
//                 Liegt sie unter N, liefen die Stroeme NICHT alle gleichzeitig
//                 (KV-Pool zu klein, max-num-seqs zu niedrig) und die
//                 Gesamtzahl misst Warteschlange statt Batching.
//
// Jede Anfrage erzeugt exakt --tokens Token (ignore_eos + min_tokens), sonst
// waeren Laeufe mit frueh endenden Antworten nicht vergleichbar. Thinking ist
// explizit aus (QUASAR denkt sonst per Default, siehe quasar-thinking in
// scripts/llm-proxy/fixups.mjs — hier geht es direkt an vLLM, ohne Proxy).
//
// Aufruf:
//   node scripts/llm/bench-vllm-concurrent.mjs [--port 8123] [--streams 1,3,6]
//        [--tokens 512] [--reps 3] [--label quasar] [--out <datei.jsonl>]
//
// Ausgabe: lesbare Zeilen auf stdout, je Durchgang eine JSON-Zeile nach --out.

import { appendFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]?.startsWith('--') ? 'true' : all[i + 1]]);
    return acc;
  }, []),
);
const PORT = Number(args.port ?? 8123);
const STREAMS = String(args.streams ?? '1,3,6').split(',').map(Number).filter((n) => n > 0);
const TOKENS = Number(args.tokens ?? 512);
const REPS = Number(args.reps ?? 3);
const LABEL = args.label ?? 'unbenannt';
const OUT = args.out;
const BASE = `http://127.0.0.1:${PORT}`;

// Unterschiedliche Prompts je Strom: identische Prompts teilten sich den
// Prefix-Cache und verbilligten den Prefill kuenstlich.
const PROMPTS = [
  'Erklaere ausfuehrlich die Funktionsweise von Kuehlkreislaeufen in Rechenzentren',
  'Schreibe eine vollstaendige Python-Klasse fuer einen LRU-Cache mit Typannotationen',
  'Beschreibe den Aufbau eines verteilten Logsystems mit Backpressure',
  'Erklaere die Reconciliation von Flux-OCI-Repositories Schritt fuer Schritt',
  'Entwirf eine PostgreSQL-Backup-Strategie mit WAL-Archivierung',
  'Schreibe ein Bash-Skript, das Logdateien aelter als sieben Tage rotiert',
];

async function modelId() {
  const r = await fetch(`${BASE}/v1/models`, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`/v1/models -> HTTP ${r.status}`);
  return (await r.json()).data[0].id;
}

async function runningGauge() {
  try {
    const txt = await (await fetch(`${BASE}/metrics`, { signal: AbortSignal.timeout(2000) })).text();
    const line = txt.split('\n').find((l) => l.startsWith('vllm:num_requests_running'));
    return line ? Number(line.trim().split(/\s+/).pop()) : null;
  } catch {
    return null;
  }
}

async function stream(model, i, rep, maxTokens) {
  const t0 = performance.now();
  const r = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(900_000),
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: `${PROMPTS[i % PROMPTS.length]}, Variante ${rep}-${i}.` }],
      max_tokens: maxTokens,
      min_tokens: maxTokens,
      ignore_eos: true,
      temperature: 0,
      stream: true,
      stream_options: { include_usage: true },
      chat_template_kwargs: { enable_thinking: false },
    }),
  });
  if (!r.ok) throw new Error(`Strom ${i}: HTTP ${r.status} ${await r.text()}`);
  let ttft = null;
  let tokens = 0;
  let buf = '';
  const dec = new TextDecoder();
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:') || line === 'data: [DONE]') continue;
      const j = JSON.parse(line.slice(5));
      const d = j.choices?.[0]?.delta;
      if (ttft === null && (d?.content || d?.reasoning_content || d?.reasoning)) ttft = performance.now() - t0;
      if (j.usage) tokens = j.usage.completion_tokens;
    }
  }
  return { tokens, ms: performance.now() - t0, ttft };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const model = await modelId();
console.log(`== ${LABEL} | ${BASE} | Modell ${model} | ${TOKENS} Token je Strom | ${REPS} Wiederholungen ==`);

// Aufwaermen: erste Anfragen tragen CUDA-Graph-/Kernel-Initialisierung.
await stream(model, 0, 0, 32);

for (const n of STREAMS) {
  for (let rep = 1; rep <= REPS; rep++) {
    let peak = 0;
    let polling = true;
    const poller = (async () => {
      while (polling) {
        const v = await runningGauge();
        if (v !== null) peak = Math.max(peak, v);
        await new Promise((res) => setTimeout(res, 200));
      }
    })();
    const t0 = performance.now();
    const rs = await Promise.all([...Array(n)].map((_, i) => stream(model, i, rep, TOKENS)));
    const wall = performance.now() - t0;
    polling = false;
    await poller;

    const tok = rs.reduce((a, r) => a + r.tokens, 0);
    const total = tok / (wall / 1000);
    const perStream = rs.reduce((a, r) => a + r.tokens / (r.ms / 1000), 0) / n;
    const ttfts = rs.map((r) => r.ttft ?? NaN);
    const row = {
      label: LABEL, model, port: PORT, streams: n, rep, tokens_per_stream: TOKENS,
      wall_ms: Math.round(wall), tokens: tok,
      total_tok_s: Math.round(total), per_stream_tok_s: Math.round(perStream),
      ttft_ms_median: Math.round(median(ttfts)), ttft_ms_max: Math.round(Math.max(...ttfts)),
      running_peak: peak, at: new Date().toISOString(),
    };
    const warn = peak > 0 && peak < n ? `  <- nur ${peak}/${n} gleichzeitig!` : '';
    console.log(
      `${n}x rep${rep}: GESAMT ${row.total_tok_s} tok/s | je Strom ${row.per_stream_tok_s} tok/s | ` +
        `TTFT med ${row.ttft_ms_median} ms / max ${row.ttft_ms_max} ms | running max ${peak}${warn}`,
    );
    if (OUT) appendFileSync(OUT, `${JSON.stringify(row)}\n`);
  }
}
