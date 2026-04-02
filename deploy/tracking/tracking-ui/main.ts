import { Hono } from "https://deno.land/x/hono@v4.3.6/mod.ts";
import { html, raw } from "https://deno.land/x/hono@v4.3.6/helper/html/index.ts";
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

// ── Database connection ─────────────────────────────────────────────
const sql = postgres({
  host: Deno.env.get("PGHOST") ?? "tracking-db.tracking.svc.cluster.local",
  port: Number(Deno.env.get("PGPORT") ?? 5432),
  database: Deno.env.get("PGDATABASE") ?? "tracking",
  username: Deno.env.get("PGUSER") ?? "tracking",
  password: Deno.env.get("PGPASSWORD") ?? "tracking-dev-only",
});

const SCHEMAS = ["bachelorprojekt", "assetgenerator", "k3d_dev"] as const;
type Schema = (typeof SCHEMAS)[number];

const CATEGORIES = [
  "Funktionale Anforderung",
  "Sicherheitsanforderung",
  "Nicht-Funktionale Anforderung",
  "Abnahmekriterium",
  "Auslieferbares Objekt",
  "BUG",
  "TASK",
];

const PIPELINE_STAGES = [
  "idea",
  "implementation",
  "testing",
  "documentation",
  "archive",
] as const;

const PIPELINE_STATUSES = [
  "pending",
  "in_progress",
  "done",
  "fail",
  "skip",
] as const;

// ── Helpers ─────────────────────────────────────────────────────────

function getSchema(c: any): Schema {
  const s = c.req.query("schema") ?? c.req.param("schema") ?? "bachelorprojekt";
  return SCHEMAS.includes(s as Schema) ? (s as Schema) : "bachelorprojekt";
}

function statusBadge(status: string | null): string {
  const colors: Record<string, string> = {
    pending: "bg-gray-200 text-gray-700",
    in_progress: "bg-blue-200 text-blue-800",
    done: "bg-green-200 text-green-800",
    fail: "bg-red-200 text-red-800",
    skip: "bg-yellow-200 text-yellow-800",
  };
  if (!status) return `<span class="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-400">--</span>`;
  return `<span class="px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? "bg-gray-200"}">${status}</span>`;
}

function categoryShort(cat: string): string {
  const map: Record<string, string> = {
    "Funktionale Anforderung": "FA",
    "Sicherheitsanforderung": "SA",
    "Nicht-Funktionale Anforderung": "NFA",
    "Abnahmekriterium": "AK",
    "Auslieferbares Objekt": "LO",
    "BUG": "BUG",
    "TASK": "TASK",
  };
  return map[cat] ?? cat;
}

// ── Layout ──────────────────────────────────────────────────────────

function layout(title: string, schema: Schema, body: string) {
  return html`<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title} - Tracking</title>
  <script src="https://unpkg.com/htmx.org@1.9.12"></script>
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
  <style>
    .htmx-indicator { opacity: 0; transition: opacity 200ms; }
    .htmx-request .htmx-indicator { opacity: 1; }
    .sort-arrow { cursor: pointer; user-select: none; }
    .sort-arrow:hover { color: #2563eb; }
    [data-sort] { cursor: pointer; }
    [data-sort]:hover { background: #f3f4f6; }
    .pipeline-select { font-size: 0.75rem; padding: 2px 4px; border-radius: 4px; border: 1px solid #d1d5db; }
    .fade-in { animation: fadeIn 0.3s ease-in; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    tr.htmx-swapping { opacity: 0; transition: opacity 0.3s; }
  </style>
</head>
<body class="bg-gray-50 min-h-screen">
  <nav class="bg-white shadow-sm border-b">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <h1 class="text-lg font-bold text-gray-900">Tracking</h1>
        <div class="flex gap-1">
          ${raw(SCHEMAS.map(s => `
            <a href="/?schema=${s}"
               class="px-3 py-1 rounded text-sm ${s === schema
                 ? "bg-blue-600 text-white"
                 : "bg-gray-100 text-gray-600 hover:bg-gray-200"}"
            >${s}</a>
          `).join(""))}
        </div>
      </div>
      <div class="flex items-center gap-3">
        <a href="/timeline?schema=${schema}" class="text-sm text-blue-600 hover:underline">Timeline</a>
        <button hx-get="/requirements/new?schema=${schema}"
                hx-target="#modal" hx-swap="innerHTML"
                class="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">
          + New Requirement
        </button>
      </div>
    </div>
  </nav>

  <main class="max-w-7xl mx-auto px-4 py-6">
    <div id="modal"></div>
    <div id="content">
      ${raw(body)}
    </div>
  </main>
</body>
</html>`;
}

// ── App ─────────────────────────────────────────────────────────────

const app = new Hono();

// Health check
app.get("/healthz", (c) => c.text("ok"));

// ── Main table view ─────────────────────────────────────────────────
app.get("/", async (c) => {
  const schema = getSchema(c);
  const sort = c.req.query("sort") ?? "id";
  const dir = c.req.query("dir") === "desc" ? "desc" : "asc";

  const validSorts = ["id", "category", "name", "created_at", "updated_at"];
  const sortCol = validSorts.includes(sort) ? sort : "id";

  const rows = await sql.unsafe(`
    SELECT r.*,
      ${PIPELINE_STAGES.map(
        (s) => `MAX(CASE WHEN p.stage = '${s}' THEN p.status::text END) AS pipeline_${s}`
      ).join(",\n      ")}
    FROM ${schema}.requirements r
    LEFT JOIN ${schema}.pipeline p ON p.req_id = r.id
    GROUP BY r.id
    ORDER BY ${sortCol} ${dir}
  `);

  const nextDir = dir === "asc" ? "desc" : "asc";
  const sortHeader = (col: string, label: string) =>
    `<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
      <a href="/?schema=${schema}&sort=${col}&dir=${sort === col ? nextDir : "asc"}"
         class="sort-arrow flex items-center gap-1">
        ${label}
        ${sort === col ? (dir === "asc" ? "&#9650;" : "&#9660;") : ""}
      </a>
    </th>`;

  const tableBody = rows.length === 0
    ? `<tr><td colspan="10" class="px-3 py-8 text-center text-gray-400">No requirements yet. Create one to get started.</td></tr>`
    : rows.map((r: any) => `
      <tr class="border-t hover:bg-gray-50" id="row-${r.id}">
        <td class="px-3 py-2 text-sm font-mono">${r.id}</td>
        <td class="px-3 py-2 text-sm">
          <span class="px-1.5 py-0.5 rounded text-xs bg-purple-100 text-purple-700">${categoryShort(r.category)}</span>
        </td>
        <td class="px-3 py-2 text-sm font-medium">${r.name}</td>
        ${PIPELINE_STAGES.map((stage) => `
          <td class="px-2 py-2 text-center">
            <select class="pipeline-select"
                    hx-post="/requirements/${r.id}/pipeline/${stage}?schema=${schema}"
                    hx-trigger="change"
                    hx-target="#row-${r.id}"
                    hx-swap="outerHTML"
                    hx-indicator="#spinner-${r.id}">
              ${PIPELINE_STATUSES.map((st) =>
                `<option value="${st}" ${(r as any)[`pipeline_${stage}`] === st ? "selected" : ""}>${st}</option>`
              ).join("")}
              ${!(r as any)[`pipeline_${stage}`] ? `<option value="" selected>--</option>` : ""}
            </select>
          </td>
        `).join("")}
        <td class="px-3 py-2 text-sm text-right">
          <span id="spinner-${r.id}" class="htmx-indicator text-blue-500 mr-1">...</span>
          <button hx-get="/requirements/${r.id}/edit?schema=${schema}"
                  hx-target="#modal" hx-swap="innerHTML"
                  class="text-blue-600 hover:underline text-xs mr-2">Edit</button>
          <button hx-delete="/requirements/${r.id}?schema=${schema}"
                  hx-target="#row-${r.id}" hx-swap="outerHTML swap:0.3s"
                  hx-confirm="Delete requirement ${r.id}?"
                  class="text-red-600 hover:underline text-xs">Delete</button>
        </td>
      </tr>
    `).join("");

  const body = `
    <div class="bg-white rounded-lg shadow overflow-hidden">
      <div class="px-4 py-3 border-b flex items-center justify-between">
        <h2 class="text-base font-semibold text-gray-800">${schema} Requirements</h2>
        <span class="text-sm text-gray-500">${rows.length} total</span>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full">
          <thead class="bg-gray-50">
            <tr>
              ${sortHeader("id", "ID")}
              ${sortHeader("category", "Category")}
              ${sortHeader("name", "Name")}
              ${PIPELINE_STAGES.map((s) => `
                <th class="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase">${s}</th>
              `).join("")}
              <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${tableBody}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Progress Summary -->
    <div id="progress" class="mt-6"
         hx-get="/progress?schema=${schema}" hx-trigger="load" hx-swap="innerHTML">
    </div>
  `;

  return c.html(layout("Requirements", schema, body));
});

// ── Progress summary partial ────────────────────────────────────────
app.get("/progress", async (c) => {
  const schema = getSchema(c);
  const rows = await sql.unsafe(
    `SELECT * FROM ${schema}.v_progress_summary`
  );

  if (rows.length === 0) {
    return c.html(html`<div class="text-sm text-gray-400">No pipeline data yet.</div>`);
  }

  return c.html(html`
    <div class="bg-white rounded-lg shadow p-4">
      <h3 class="text-sm font-semibold text-gray-700 mb-3">Pipeline Progress</h3>
      <div class="grid grid-cols-5 gap-3">
        ${raw(rows.map((r: any) => `
          <div class="text-center">
            <div class="text-xs font-medium text-gray-500 uppercase mb-1">${r.stage}</div>
            <div class="flex justify-center gap-1 text-xs">
              <span class="bg-green-200 text-green-800 px-1.5 rounded">${r.done ?? 0} done</span>
              <span class="bg-blue-200 text-blue-800 px-1.5 rounded">${r.in_progress ?? 0} wip</span>
              <span class="bg-gray-200 text-gray-700 px-1.5 rounded">${r.pending ?? 0} todo</span>
            </div>
            <div class="mt-1 bg-gray-200 rounded-full h-2 overflow-hidden">
              <div class="bg-green-500 h-2" style="width: ${r.total > 0 ? Math.round(((r.done ?? 0) / r.total) * 100) : 0}%"></div>
            </div>
          </div>
        `).join(""))}
      </div>
    </div>
  `);
});

// ── New requirement form ────────────────────────────────────────────
app.get("/requirements/new", (c) => {
  const schema = getSchema(c);
  return c.html(html`
    <div class="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50 fade-in"
         onclick="if(event.target===this)this.remove()">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-lg p-6" onclick="event.stopPropagation()">
        <h2 class="text-lg font-semibold mb-4">New Requirement</h2>
        <form hx-post="/requirements?schema=${schema}" hx-target="#content" hx-swap="innerHTML"
              class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700">ID</label>
              <input name="id" required placeholder="FA-01"
                     class="mt-1 block w-full border rounded px-3 py-1.5 text-sm"/>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Category</label>
              <select name="category" required class="mt-1 block w-full border rounded px-3 py-1.5 text-sm">
                ${raw(CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join(""))}
              </select>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">Name</label>
            <input name="name" required placeholder="Requirement name"
                   class="mt-1 block w-full border rounded px-3 py-1.5 text-sm"/>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">Description</label>
            <textarea name="description" rows="2"
                      class="mt-1 block w-full border rounded px-3 py-1.5 text-sm"></textarea>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">Acceptance Criteria</label>
            <textarea name="acceptance_criteria" rows="2"
                      class="mt-1 block w-full border rounded px-3 py-1.5 text-sm"></textarea>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" onclick="this.closest('.fixed').remove()"
                    class="px-3 py-1.5 text-sm border rounded hover:bg-gray-50">Cancel</button>
            <button type="submit"
                    class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Create</button>
          </div>
        </form>
      </div>
    </div>
  `);
});

// ── Create requirement ──────────────────────────────────────────────
app.post("/requirements", async (c) => {
  const schema = getSchema(c);
  const body = await c.req.parseBody();

  await sql.unsafe(`
    INSERT INTO ${schema}.requirements (id, category, name, description, acceptance_criteria)
    VALUES ($1, $2, $3, $4, $5)
  `, [body.id, body.category, body.name, body.description || null, body.acceptance_criteria || null]);

  // Initialize pipeline stages
  for (const stage of PIPELINE_STAGES) {
    await sql.unsafe(`
      INSERT INTO ${schema}.pipeline (req_id, stage, status) VALUES ($1, $2, 'pending')
      ON CONFLICT DO NOTHING
    `, [body.id, stage]);
  }

  // Redirect to main page
  c.header("HX-Redirect", `/?schema=${schema}`);
  return c.text("Created");
});

// ── Edit form ───────────────────────────────────────────────────────
app.get("/requirements/:id/edit", async (c) => {
  const schema = getSchema(c);
  const id = c.req.param("id");
  const rows = await sql.unsafe(`SELECT * FROM ${schema}.requirements WHERE id = $1`, [id]);
  if (rows.length === 0) return c.text("Not found", 404);
  const r = rows[0] as any;

  return c.html(html`
    <div class="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50 fade-in"
         onclick="if(event.target===this)this.remove()">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-lg p-6" onclick="event.stopPropagation()">
        <h2 class="text-lg font-semibold mb-4">Edit ${r.id}</h2>
        <form hx-put="/requirements/${r.id}?schema=${schema}" hx-target="#content" hx-swap="innerHTML"
              class="space-y-3">
          <div>
            <label class="block text-sm font-medium text-gray-700">Category</label>
            <select name="category" required class="mt-1 block w-full border rounded px-3 py-1.5 text-sm">
              ${raw(CATEGORIES.map((cat) =>
                `<option value="${cat}" ${r.category === cat ? "selected" : ""}>${cat}</option>`
              ).join(""))}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">Name</label>
            <input name="name" required value="${r.name}"
                   class="mt-1 block w-full border rounded px-3 py-1.5 text-sm"/>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">Description</label>
            <textarea name="description" rows="2"
                      class="mt-1 block w-full border rounded px-3 py-1.5 text-sm">${r.description ?? ""}</textarea>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">Acceptance Criteria</label>
            <textarea name="acceptance_criteria" rows="2"
                      class="mt-1 block w-full border rounded px-3 py-1.5 text-sm">${r.acceptance_criteria ?? ""}</textarea>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">Test Cases</label>
            <textarea name="test_cases" rows="2"
                      class="mt-1 block w-full border rounded px-3 py-1.5 text-sm">${r.test_cases ?? ""}</textarea>
          </div>
          <div class="flex items-center gap-2">
            <input type="checkbox" name="automated" id="automated" ${r.automated ? "checked" : ""}/>
            <label for="automated" class="text-sm text-gray-700">Automated</label>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" onclick="this.closest('.fixed').remove()"
                    class="px-3 py-1.5 text-sm border rounded hover:bg-gray-50">Cancel</button>
            <button type="submit"
                    class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
          </div>
        </form>
      </div>
    </div>
  `);
});

// ── Update requirement ──────────────────────────────────────────────
app.put("/requirements/:id", async (c) => {
  const schema = getSchema(c);
  const id = c.req.param("id");
  const body = await c.req.parseBody();

  await sql.unsafe(`
    UPDATE ${schema}.requirements
    SET category = $1, name = $2, description = $3,
        acceptance_criteria = $4, test_cases = $5,
        automated = $6, updated_at = now()
    WHERE id = $7
  `, [
    body.category, body.name, body.description || null,
    body.acceptance_criteria || null, body.test_cases || null,
    body.automated === "on", id,
  ]);

  c.header("HX-Redirect", `/?schema=${schema}`);
  return c.text("Updated");
});

// ── Delete requirement ──────────────────────────────────────────────
app.delete("/requirements/:id", async (c) => {
  const schema = getSchema(c);
  const id = c.req.param("id");
  await sql.unsafe(`DELETE FROM ${schema}.requirements WHERE id = $1`, [id]);
  return c.html(html``);
});

// ── Update pipeline status ──────────────────────────────────────────
app.post("/requirements/:id/pipeline/:stage", async (c) => {
  const schema = getSchema(c);
  const id = c.req.param("id");
  const stage = c.req.param("stage");
  const body = await c.req.parseBody();
  const status = body[stage] ?? Object.values(body)[0];

  await sql.unsafe(`
    INSERT INTO ${schema}.pipeline (req_id, stage, status, updated_at)
    VALUES ($1, $2, $3, now())
    ON CONFLICT (req_id, stage) DO UPDATE SET status = $3, updated_at = now()
  `, [id, stage, status]);

  // Return updated row
  const rows = await sql.unsafe(`
    SELECT r.*,
      ${PIPELINE_STAGES.map(
        (s) => `MAX(CASE WHEN p.stage = '${s}' THEN p.status::text END) AS pipeline_${s}`
      ).join(",\n      ")}
    FROM ${schema}.requirements r
    LEFT JOIN ${schema}.pipeline p ON p.req_id = r.id
    WHERE r.id = $1
    GROUP BY r.id
  `, [id]);

  if (rows.length === 0) return c.text("Not found", 404);
  const r = rows[0] as any;

  return c.html(html`
    <tr class="border-t hover:bg-gray-50 fade-in" id="row-${r.id}">
      <td class="px-3 py-2 text-sm font-mono">${r.id}</td>
      <td class="px-3 py-2 text-sm">
        <span class="px-1.5 py-0.5 rounded text-xs bg-purple-100 text-purple-700">${categoryShort(r.category)}</span>
      </td>
      <td class="px-3 py-2 text-sm font-medium">${r.name}</td>
      ${raw(PIPELINE_STAGES.map((stg) => `
        <td class="px-2 py-2 text-center">
          <select class="pipeline-select"
                  hx-post="/requirements/${r.id}/pipeline/${stg}?schema=${schema}"
                  hx-trigger="change"
                  hx-target="#row-${r.id}"
                  hx-swap="outerHTML"
                  hx-indicator="#spinner-${r.id}">
            ${PIPELINE_STATUSES.map((st) =>
              `<option value="${st}" ${r[`pipeline_${stg}`] === st ? "selected" : ""}>${st}</option>`
            ).join("")}
            ${!r[`pipeline_${stg}`] ? `<option value="" selected>--</option>` : ""}
          </select>
        </td>
      `).join(""))}
      <td class="px-3 py-2 text-sm text-right">
        <span id="spinner-${r.id}" class="htmx-indicator text-blue-500 mr-1">...</span>
        <button hx-get="/requirements/${r.id}/edit?schema=${schema}"
                hx-target="#modal" hx-swap="innerHTML"
                class="text-blue-600 hover:underline text-xs mr-2">Edit</button>
        <button hx-delete="/requirements/${r.id}?schema=${schema}"
                hx-target="#row-${r.id}" hx-swap="outerHTML swap:0.3s"
                hx-confirm="Delete requirement ${r.id}?"
                class="text-red-600 hover:underline text-xs">Delete</button>
      </td>
    </tr>
  `);
});

// ── Timeline view ───────────────────────────────────────────────────
app.get("/timeline", async (c) => {
  const schema = getSchema(c);

  // Get all requirements with their pipeline updates for timeline
  const reqs = await sql.unsafe(`
    SELECT r.id, r.category, r.name, r.created_at, r.updated_at
    FROM ${schema}.requirements r
    ORDER BY r.created_at DESC
  `);

  const pipelineEvents = await sql.unsafe(`
    SELECT p.req_id, p.stage, p.status, p.updated_at, p.notes, p.commit_ref,
           r.name AS req_name
    FROM ${schema}.pipeline p
    JOIN ${schema}.requirements r ON r.id = p.req_id
    WHERE p.status != 'pending'
    ORDER BY p.updated_at DESC
    LIMIT 100
  `);

  const timelineItems = [
    ...reqs.map((r: any) => ({
      date: r.created_at,
      type: "created",
      id: r.id,
      name: r.name,
      category: r.category,
      detail: `Requirement created`,
    })),
    ...pipelineEvents.map((p: any) => ({
      date: p.updated_at,
      type: "pipeline",
      id: p.req_id,
      name: p.req_name,
      stage: p.stage,
      status: p.status,
      detail: `${p.stage} -> ${p.status}${p.notes ? ": " + p.notes : ""}`,
    })),
  ].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const body = `
    <div class="mb-4">
      <a href="/?schema=${schema}" class="text-sm text-blue-600 hover:underline">&larr; Back to table</a>
    </div>
    <div class="bg-white rounded-lg shadow p-4">
      <h2 class="text-base font-semibold text-gray-800 mb-4">Timeline - ${schema}</h2>
      ${timelineItems.length === 0
        ? `<p class="text-gray-400 text-sm">No activity yet.</p>`
        : `<div class="relative border-l-2 border-gray-200 ml-3">
            ${timelineItems.map((item: any) => `
              <div class="mb-4 ml-6 relative">
                <div class="absolute -left-9 w-4 h-4 rounded-full border-2 border-white
                  ${item.type === "created" ? "bg-blue-500" : item.status === "done" ? "bg-green-500" : item.status === "fail" ? "bg-red-500" : "bg-gray-400"}">
                </div>
                <div class="text-xs text-gray-400 mb-0.5">${new Date(item.date).toLocaleString("de-DE")}</div>
                <div class="text-sm">
                  <span class="font-mono text-blue-700">${item.id}</span>
                  <span class="text-gray-600"> ${item.name}</span>
                </div>
                <div class="text-xs text-gray-500">${item.detail}</div>
              </div>
            `).join("")}
          </div>`
      }
    </div>
  `;

  return c.html(layout("Timeline", schema, body));
});

// ── Start server ────────────────────────────────────────────────────
const port = Number(Deno.env.get("PORT") ?? 3000);
console.log(`Tracking UI listening on :${port}`);
Deno.serve({ port }, app.fetch);
