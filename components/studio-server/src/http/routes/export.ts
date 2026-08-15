import { Router } from 'express';
import type { Repo } from '../../db/repo';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HIGHLIGHT_LEVELS = new Set([5, 9]);

function esc(s: any): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string));
}

export function makeExportRouter(repo: Repo): Router {
  const r = Router();

  r.get('/sessions/:id/export', async (req, res) => {
    if (!UUID_RE.test(req.params.id)) { res.status(400).json({ error: 'invalid id' }); return; }
    const out = await repo.getSession(req.params.id);
    if (!out) { res.status(404).json({ error: 'not found' }); return; }
    const client = await repo.getClient(out.session.client_id);
    const stds = await repo.getStandardLevels();
    const stdMap = new Map(stds.map(s => [s.level_no, s]));

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderExport(out, client, stdMap));
  });

  return r;
}

function renderExport(
  out: { session: any; levels: any[] },
  client: any,
  stdMap: Map<number, { name: string; goal: string }>,
): string {
  const date = new Date().toISOString().slice(0, 10);
  const levelsHtml = out.levels.map((l) => {
    const std = stdMap.get(l.level_no);
    const isHighlight = HIGHLIGHT_LEVELS.has(l.level_no);
    const label = isHighlight
      ? (l.level_no === 5 ? 'Zielsetzungen' : 'Vereinbarungen')
      : null;
    return `
      <section class="lvl ${isHighlight ? 'highlight' : ''}">
        <header><span class="no">Ebene ${String(l.level_no).padStart(2, '0')}</span><span class="name">${esc(std?.name ?? l.level_no)}</span></header>
        ${l.prompt ? `<div class="ex"><span class="role">Prompt</span><div class="txt">${esc(l.prompt)}</div></div>` : ''}
        ${l.answer ? `<div class="ex"><span class="role">Antwort</span><div class="txt">${esc(l.answer)}</div></div>` : ''}
        ${isHighlight && label ? `<aside class="callout"><span class="ct">${esc(label)}</span><p>${esc(l.answer ?? '— keine Antwort —')}</p></aside>` : ''}
      </section>`;
  }).join('\n');

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"/><title>Coaching Studio · Export</title>
<style>
  body{font-family:Georgia,serif;background:#f6f3ee;color:#1a2030;padding:40px 0;margin:0;}
  .page{max-width:820px;margin:0 auto;background:#f6f3ee;padding:48px 56px;box-shadow:0 30px 80px -30px rgba(0,0,0,.6);}
  h1{font-size:28px;margin:0 0 6px;color:#1a2030;}
  h2{font-size:18px;color:#1a2030;margin:24px 0 4px;}
  .meta{font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#6a717e;margin-bottom:20px;}
  .lvl{padding:18px 0;border-top:1px solid #d4cfc6;break-inside:avoid;}
  .lvl.highlight{background:rgba(168,130,58,.08);border-left:3px solid #A8823A;padding-left:16px;margin:6px 0;}
  .lvl header{display:flex;gap:12px;align-items:baseline;margin-bottom:8px;}
  .lvl .no{font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#A8823A;}
  .lvl .name{font-size:18px;color:#1a2030;}
  .ex{display:grid;grid-template-columns:90px 1fr;gap:14px;margin-bottom:8px;}
  .ex .role{font-family:ui-monospace,monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#6a717e;padding-top:3px;}
  .ex .txt{font-size:13.5px;line-height:1.6;color:#1a2030;white-space:pre-wrap;}
  .callout{border:1px solid #e3d6bd;background:#efe7d6;border-radius:10px;padding:14px 18px;margin-top:10px;}
  .callout .ct{font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#8a6a2a;}
  .callout p{margin:6px 0 0;font-size:14px;line-height:1.7;color:#1a2030;}
  .toolbar{position:fixed;top:14px;right:20px;display:flex;gap:8px;z-index:5;}
  .toolbar button{font:inherit;border:1px solid #ccc;background:#fff;border-radius:999px;padding:8px 16px;cursor:pointer;}
  .toolbar .primary{background:#A8823A;color:#1a2030;border-color:#A8823A;}
  @media print{ body{background:#fff;padding:0;} .toolbar{display:none;} .page{box-shadow:none;padding:0;} }
</style>
</head><body>
  <div class="toolbar">
    <button onclick="window.print()">Drucken / PDF</button>
  </div>
  <main class="page">
    <header>
      <h1>Verlauf &amp; <em>Vereinbarungen</em></h1>
      <div class="meta">Coaching Studio · Export · ${esc(date)}</div>
    </header>
    <h2>Klient:in</h2><p>${esc(client?.name ?? '—')}</p>
    <h2>Session</h2><p>${esc(out.session.title)} · Ebene ${out.levels.length}/10 · ${esc(out.session.lang)}</p>
    ${levelsHtml}
  </main>
</body></html>`;
}
