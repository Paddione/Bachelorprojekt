// par.mjs <label> <vram> <ctx> <maxConc> — Gesamtdurchsatz bei 1..maxConc gleichzeitigen Stroemen + geteilter System-Prompt
const [label, vram, ctx, maxc] = process.argv.slice(2);
const U = 'http://127.0.0.1:1921/v1/chat/completions';
const tasks = ['Implement an LRU cache in Python with tests.', 'Explain Flux OCI reconciliation in 400 words.',
  'Write a bash script that rotates logs older than 7 days.', 'Describe a PostgreSQL backup strategy with WAL archiving.'];
const req = async (i, sys) => { const t0 = Date.now();
  const r = await fetch(U, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    messages: [...(sys ? [{ role: 'system', content: sys }] : []), { role: 'user', content: tasks[i % 4] }],
    max_tokens: 400, temperature: 0.6, chat_template_kwargs: { enable_thinking: false } }), signal: AbortSignal.timeout(280000) });
  const j = await r.json(); return { tok: j.usage.completion_tokens, t: j.timings ?? {}, s: (Date.now() - t0) / 1000 }; };
await req(0);
const out = [];
for (let c = 1; c <= Number(maxc); c++) {
  const t0 = Date.now(); const rs = await Promise.all([...Array(c)].map((_, i) => req(i)));
  const wall = (Date.now() - t0) / 1000; const tot = rs.reduce((a, r) => a + r.tok, 0);
  const acc = rs.reduce((a, r) => a + (r.t.draft_n_accepted ?? 0), 0) / (rs.reduce((a, r) => a + (r.t.draft_n ?? 0), 0) || 1);
  out.push(`${c}x: ${(tot / wall).toFixed(0)} t/s gesamt, ${(tot / wall / c).toFixed(0)}/Strom, Annahme ${(acc * 100).toFixed(0)}%`);
}
// Geteilter System-Prompt (~6k Token): kalt einer, dann alle gleichzeitig -> prompt_n zeigt, was neu vorgefuellt wurde
const sys = 'You are a subagent of the plan executor. Follow the plan exactly. ' + 'Rules: be precise, return only results, cite file paths, never invent data. '.repeat(400);
const cold = await req(0, sys);
const warm = await Promise.all([...Array(Number(maxc))].map((_, i) => req(i, sys)));
out.push(`System-Prompt geteilt: kalt prompt_n=${cold.t.prompt_n}, parallel prompt_n=${warm.map((r) => r.t.prompt_n).join('/')}`);
console.log(`${label} | VRAM ${vram} MiB | ${ctx}\n  ` + out.join('\n  '));
