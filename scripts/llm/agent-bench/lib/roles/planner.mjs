// Planner-Rolle (p5 Task 5.4): Chat-Tool-Loop mit read_file/list_dir/
// write_plan/ask_clarification. Isoliert zaehlt der F1-Wert der target_files
// gegen den Referenzplan; in der Kette ueberschreibt p6 den Outcome.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseManifest } from '../../../plan-runner/plan.mjs';
import { addUsage, chat, emptyResult, parseJsonLoose, walkFiles } from './_shared.mjs';

const PLANNER_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Liest eine Datei relativ zum Fallverzeichnis.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'Listet ein Verzeichnis relativ zum Fallverzeichnis.',
      parameters: { type: 'object', properties: { path: { type: 'string' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_plan',
      description: 'Schreibt tasks.md und die Partial-Dateien.',
      parameters: {
        type: 'object',
        properties: { tasks_md: { type: 'string' }, partials: { type: 'array', items: { type: 'object' } } },
        required: ['tasks_md'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_clarification',
      description: 'Fragt eine Rueckfrage, wenn der Auftrag mehrdeutig ist.',
      parameters: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] },
    },
  },
];

function sandboxPath(sandbox, p) {
  const clean = String(p || '').replace(/^\/+/, '');
  const full = resolve(sandbox, clean);
  if (!full.startsWith(resolve(sandbox))) return { ok: false, error: 'path escapes sandbox' };
  return { ok: true, full };
}

export async function runPlanner({ variant, inputs, endpoints, workdir, recorderUrls, timeoutMs = 600_000 }) {
  const events = [];
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const artifacts = { tasks_md: null, clarification: null, manifest: null };
  // Sandbox ist grundsaetzlich ein Workdir aus base/ (vom Bench vorbereitet),
  // nie das Variantenverzeichnis selbst — dort laegen die versteckten Checks.
  const sandbox = inputs.sandbox || variant.dir;
  const brief = variant.briefPath && existsSync(variant.briefPath) ? readFileSync(variant.briefPath, 'utf8') : '';
  // inputs.case.source ist Inhalt (cases.mjs) oder — in Tests — ein Pfad.
  const srcRaw = inputs.case?.source || '';
  const source = srcRaw && existsSync(srcRaw) ? readFileSync(srcRaw, 'utf8') : srcRaw;
  const messages = [
    {
      role: 'system',
      content: 'Du bist der Planer eines Bench-Falls. Nutze die angebotenen Tools. Antworte erst, wenn der Plan steht oder eine Rueckfrage noetig ist.',
    },
    { role: 'user', content: `## Auftrag\n${brief}\n\n## Quelltext\n${source}` },
  ];
  const url = recorderUrls?.planner || endpoints?.planner;
  const maxTurns = Math.max(1, Number(variant.budget?.turns || 6));
  let asked = false;
  let wrote = null;
  for (let turn = 0; turn < maxTurns; turn++) {
    const res = await chat(url, {
      messages,
      tools: PLANNER_TOOLS,
      model: inputs.plannerModel || 'planner',
      params: { temperature: 0, max_tokens: 4096 },
      timeoutMs,
    });
    addUsage(usage, res.usage);
    if (!res.ok) {
      events.push({ kind: 'protocol_error' });
      return { ...emptyResult(events, artifacts), usage, cleanup: null, reason: `planner-chat: ${res.error}` };
    }
    messages.push({ role: 'assistant', content: res.message.content ?? '', ...(res.message.tool_calls ? { tool_calls: res.message.tool_calls } : {}) });
    if (!res.message.tool_calls || res.message.tool_calls.length === 0) break;
    for (const call of res.message.tool_calls) {
      const fn = call.function || {};
      const args = fn.arguments ? parseJsonLoose(fn.arguments) || {} : {};
      const reply = { tool_call_id: call.id, role: 'tool', name: fn.name, content: '' };
      if (fn.name === 'read_file' || fn.name === 'list_dir') {
        const target = sandboxPath(sandbox, args.path);
        if (!target.ok) {
          reply.content = target.error;
        } else if (fn.name === 'read_file') {
          reply.content = existsSync(target.full) ? readFileSync(target.full, 'utf8') : `not found: ${args.path}`;
        } else {
          reply.content = existsSync(target.full)
            ? walkFiles(target.full).map((f) => relative(sandbox, f)).sort().join('\n') || '(leer)'
            : 'not found';
        }
      } else if (fn.name === 'write_plan') {
        wrote = { tasks_md: String(args.tasks_md || ''), partials: Array.isArray(args.partials) ? args.partials : [] };
        reply.content = 'plan written';
      } else if (fn.name === 'ask_clarification') {
        asked = true;
        artifacts.clarification = String(args.question || '');
        reply.content = 'question asked';
      } else {
        events.push({ kind: 'protocol_error' });
        reply.content = `unknown tool ${fn.name}`;
      }
      messages.push(reply);
    }
  }

  if (variant.expected_decision === 'clarify') {
    if (asked && !wrote) return { outcome: 1, events, usage, artifacts, cleanup: null };
    if (wrote) events.push({ kind: 'clarify_miss' });
    return { outcome: 0, events, usage, artifacts, cleanup: null };
  }
  if (!wrote) {
    events.push({ kind: 'protocol_error' });
    return { outcome: 0, events, usage, artifacts, cleanup: null };
  }
  const changeDir = join(workdir, '.agents', 'plans', inputs.slug || 'bench-plan');
  mkdirSync(changeDir, { recursive: true });
  const tasksFile = join(changeDir, 'tasks.md');
  writeFileSync(tasksFile, wrote.tasks_md);
  artifacts.tasks_md = tasksFile;
  for (const partial of wrote.partials) {
    const id = String(partial?.id || '').trim();
    if (!id) continue;
    writeFileSync(join(changeDir, `${id}.md`), String(partial?.text || ''));
  }
  let manifest;
  try {
    manifest = parseManifest(wrote.tasks_md);
    const seen = new Set();
    for (const p of manifest) {
      for (const target of p.targetFiles) {
        if (seen.has(target)) throw new Error(`manifest: target_files nicht disjunkt (${target})`);
        seen.add(target);
      }
    }
  } catch (e) {
    events.push({ kind: 'invalid_manifest' });
    return { outcome: 0, events, usage, artifacts, cleanup: null };
  }
  artifacts.manifest = manifest;
  // F1 der geplanten target_files gegen die target_files des Referenzplans
  // (Plan-Runner-Format: tasks.md + Partial-Dateien in reference/).
  let refTargets;
  try {
    refTargets = parseManifest(readFileSync(join(variant.referenceDir || '', 'tasks.md'), 'utf8'))
      .flatMap((p) => p.targetFiles);
  } catch (e) {
    return { ...emptyResult([{ kind: 'infra_error' }]), infra: true, reason: `Referenzplan unlesbar: ${variant.referenceDir} (${e.message})`, cleanup: null };
  }
  const reference = new Set(refTargets);
  const planned = new Set(manifest.flatMap((p) => p.targetFiles));
  for (const target of planned) {
    if (reference.size && !reference.has(target)) events.push({ kind: 'file_precision' });
  }
  const hits = [...reference].filter((f) => planned.has(f)).length;
  const precision = planned.size ? hits / planned.size : 0;
  const recall = reference.size ? hits / reference.size : 0;
  const outcome = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { outcome, events, usage, artifacts, cleanup: null };
}
