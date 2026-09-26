// freeze.mjs — Orchestrator (~60k) -> Subagent (~20k, verdraengt Slot) -> Orchestrator zurueck (Verlauf + neue Frage)
const U = 'http://127.0.0.1:1921';
const mk = (seed, n) => { const p = `Plan section ${seed}: task list, file paths and acceptance criteria for the fleet deployment. `; let s = ''; while (s.length < n * 4.4) s += p; return s; };
const orchSys = 'You are the plan orchestrator. MASTERPLAN:\n' + mk('M', 60000);
const chat = async (messages, label) => { const t0 = Date.now();
  const r = await fetch(`${U}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages, max_tokens: 64, temperature: 0, chat_template_kwargs: { enable_thinking: false } }), signal: AbortSignal.timeout(900000) });
  const j = await r.json(); const t = j.timings ?? {};
  console.log(`${label}: prompt_n=${t.prompt_n} cache_n=${t.cache_n} prefill=${t.prompt_ms?.toFixed(0)}ms wall=${Date.now() - t0}ms`);
  return j.choices[0].message.content; };
const post = async (path, body) => { const t0 = Date.now(); const r = await fetch(`${U}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) }); const j = await r.json(); return { ms: Date.now() - t0, j }; };

// A) --cache-ram (automatisch)
const hist = [{ role: 'system', content: orchSys }, { role: 'user', content: 'Which partial is next? Answer in one line.' }];
const a1 = await chat(hist, 'A1 Orchestrator kalt');
hist.push({ role: 'assistant', content: a1 }, { role: 'user', content: 'Worker busy. Summarize partial P3 tasks in one line.' });
await chat([{ role: 'system', content: 'You are a subagent.' }, { role: 'user', content: mk('S', 20000) + '\nExecute P3.' }], 'A2 Subagent (verdraengt)');
await chat(hist, 'A3 Orchestrator zurueck (cache-ram)');

// B) explizit: save -> Subagent -> restore
const s = await post('/slots/0?action=save', { filename: 'orch.bin' });
console.log(`B1 save: ${s.ms}ms, ${s.j.n_saved ?? '?'} Token, ${((s.j.n_written ?? 0) / 1e9).toFixed(2)} GB`);
await chat([{ role: 'system', content: 'You are another subagent.' }, { role: 'user', content: mk('Q', 20000) + '\nExecute P4.' }], 'B2 Subagent (verdraengt)');
const rs = await post('/slots/0?action=restore', { filename: 'orch.bin' });
console.log(`B3 restore: ${rs.ms}ms, ${rs.j.n_restored ?? '?'} Token`);
hist.push({ role: 'assistant', content: 'ok' }, { role: 'user', content: 'P3 done. Next partial?' });
await chat(hist, 'B4 Orchestrator nach restore');
