import { Client } from "postgres";

const DB_URL = Deno.env.get("DATABASE_URL") ?? "postgres://postgres@shared-db:5432/postgres";
const PORT = parseInt(Deno.env.get("PORT") ?? "80");

const css = `
  body { font-family: system-ui, sans-serif; background: #0f1623; color: #e0e6f0; margin: 0; padding: 24px; }
  h1 { color: #e8c870; margin-bottom: 4px; }
  h2 { color: #a0b0c8; margin-top: 32px; font-size: 1rem; text-transform: uppercase; letter-spacing: .1em; }
  nav a { color: #e8c870; margin-right: 16px; text-decoration: none; }
  nav a:hover { text-decoration: underline; }
  table { border-collapse: collapse; width: 100%; max-width: 1000px; margin-top: 12px; }
  th { background: #1a2235; color: #a0b0c8; text-align: left; padding: 8px 12px; font-size: .85rem; }
  td { padding: 8px 12px; border-bottom: 1px solid #1a2235; font-size: .9rem; }
  tr:hover td { background: #161f30; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: .8rem; font-weight: 600; }
  .idea         { background: #2a3040; color: #8090a8; }
  .implementation { background: #1a3050; color: #60a0e0; }
  .testing      { background: #1a3020; color: #50c070; }
  .documentation { background: #2a2010; color: #d09040; }
  .archive      { background: #1a1a1a; color: #606060; }
  .pass { background: #1a3020; color: #50c070; }
  .fail { background: #301a1a; color: #e06060; }
  .skip { background: #2a2010; color: #d09040; }
  .FA { color: #60a0e0; } .SA { color: #e06060; } .NFA { color: #d09040; } .L { color: #a060e0; }
`;

function layout(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
<title>${title} — Bachelorprojekt</title>
<style>${css}</style></head><body>
<h1>Bachelorprojekt Tracking</h1>
<nav>
  <a href="/">Pipeline</a>
  <a href="/summary">Übersicht</a>
  <a href="/open">Offen</a>
  <a href="/tests">Tests</a>
</nav>
${body}
</body></html>`;
}

async function query<T>(sql: string): Promise<T[]> {
  const client = new Client(DB_URL);
  await client.connect();
  try {
    const result = await client.queryObject<T>(sql);
    return result.rows;
  } finally {
    await client.end();
  }
}

type PipelineRow = { id: string; name: string; category: string; current_stage: string; stage_since: string | null };
type SummaryRow  = { stage: string; count: string };
type TestRow     = { req_id: string; result: string; run_at: string; details: string | null };

async function handlePipeline(): Promise<string> {
  const rows = await query<PipelineRow>("SELECT * FROM bachelorprojekt.v_pipeline_status ORDER BY category, id");
  const trs = rows.map(r => `
    <tr>
      <td class="${r.category}">${r.id}</td>
      <td>${r.name}</td>
      <td><span class="badge ${r.current_stage}">${r.current_stage}</span></td>
      <td>${r.stage_since ? new Date(r.stage_since).toLocaleDateString("de-DE") : "—"}</td>
    </tr>`).join("");
  return layout("Pipeline", `
    <h2>Pipeline Status</h2>
    <table><thead><tr><th>ID</th><th>Name</th><th>Stage</th><th>Seit</th></tr></thead>
    <tbody>${trs}</tbody></table>`);
}

async function handleSummary(): Promise<string> {
  const rows = await query<SummaryRow>("SELECT * FROM bachelorprojekt.v_progress_summary");
  const trs = rows.map(r => `
    <tr>
      <td><span class="badge ${r.stage}">${r.stage}</span></td>
      <td>${r.count}</td>
    </tr>`).join("");
  return layout("Übersicht", `
    <h2>Fortschritt nach Stage</h2>
    <table><thead><tr><th>Stage</th><th>Anzahl</th></tr></thead>
    <tbody>${trs}</tbody></table>`);
}

async function handleOpen(): Promise<string> {
  const rows = await query<PipelineRow>("SELECT * FROM bachelorprojekt.v_open_issues");
  const trs = rows.map(r => `
    <tr>
      <td class="${r.category}">${r.id}</td>
      <td>${r.name}</td>
      <td><span class="badge ${r.current_stage}">${r.current_stage}</span></td>
    </tr>`).join("");
  return layout("Offene Issues", `
    <h2>Offene Anforderungen (${rows.length})</h2>
    <table><thead><tr><th>ID</th><th>Name</th><th>Stage</th></tr></thead>
    <tbody>${trs}</tbody></table>`);
}

async function handleTests(): Promise<string> {
  const rows = await query<TestRow>("SELECT * FROM bachelorprojekt.v_latest_tests ORDER BY req_id");
  const trs = rows.map(r => `
    <tr>
      <td>${r.req_id}</td>
      <td><span class="badge ${r.result}">${r.result}</span></td>
      <td>${new Date(r.run_at).toLocaleDateString("de-DE")}</td>
      <td>${r.details ?? "—"}</td>
    </tr>`).join("");
  return layout("Tests", `
    <h2>Aktuelle Testergebnisse</h2>
    <table><thead><tr><th>Anforderung</th><th>Ergebnis</th><th>Datum</th><th>Details</th></tr></thead>
    <tbody>${trs}</tbody></table>`);
}

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);
  try {
    let html: string;
    if (url.pathname === "/summary")      html = await handleSummary();
    else if (url.pathname === "/open")    html = await handleOpen();
    else if (url.pathname === "/tests")   html = await handleTests();
    else                                   html = await handlePipeline();
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(layout("Fehler", `<p style="color:#e06060">Datenbankfehler: ${msg}</p>`), {
      status: 503,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

console.log(`Tracking UI listening on :${PORT}`);
