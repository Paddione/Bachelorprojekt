// harness.mjs — Harness-Adapter des plan-runners (walkie-dispatch-flow p6, C5/C7/C8): Argv, bereinigte Env
// und Ergebnis-Auswertung je Harness. Vorlage sind devflow_runner/{opencode,pi,claude,muse,agy}.py.
//  - opencode: `opencode run --agent <agent> [--model m] <prompt>` (bisheriger Weg, Text-Ausgabe),
//  - muse:     wie opencode mit Agent plan-worker-muse, Pauschale (Go-Abo) → flatRate,
//  - pi:       `pi --mode json -p --no-session [--provider P --model M]`, Settlement über agent_end/Prozessende,
//  - claude:   `claude -p --output-format json --model <m>`, Kosten aus total_cost_usd,
//  - agy:      `agy -p --output-format json`; `--dangerously-skip-permissions` nur mit PLAN_RUNNER_AGY_SKIP_PERMISSIONS=1
//              (Opt-in für sandboxierte Umgebungen: der Runner läuft sonst ohne Sandbox auf dem Entwickler-Host).
// `direct` ist kein Kindprozess, sondern der In-Process-Worker (direct-worker.mjs); er hat hier nur die ID.
// Allen Kindprozessen fehlen GH_TOKEN/GITHUB_TOKEN/GH_ENTERPRISE_TOKEN und fremde API-Keys (wie devflow_runner).
// Aufrufer: plan-runner/workers.mjs, scripts/llm/plan-runner.mjs. Runbook: docs/runbooks/plan-runner.md.

import { parseResult } from './plan.mjs';

export const AGENT_MUSE = 'plan-worker-muse';
export const SPAWN_HARNESSES = ['opencode', 'muse', 'pi', 'claude', 'agy'];
export const HARNESS_IDS = [...SPAWN_HARNESSES, 'direct'];
const CLOUD = new Set(['muse', 'claude', 'agy']);
const FLAT_RATE = new Set(['muse']);
const JSON_OUTPUT = new Set(['pi', 'claude', 'agy']);
const GH_TOKENS = ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN'];
// Fremde Keys je Harness: der eigene Key bleibt erhalten (claude: ANTHROPIC_API_KEY, agy: GEMINI_API_KEY).
// devflow_runner entfernt je Harness dieselben Variablen; claude und opencode verlieren hier zusaetzlich die
// Keys der anderen Anbieter, weil auf dem Host (anders als im Job-Pod) mehrere Keys in der Env stehen koennen.
const FOREIGN_KEYS = {
  opencode: ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY'],
  muse: ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY'],
  pi: ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY'],
  claude: ['GEMINI_API_KEY'],
  agy: ['ANTHROPIC_API_KEY'],
};

export const isCloudHarness = (h) => CLOUD.has(h);
export const usesJsonOutput = (h) => JSON_OUTPUT.has(h);

// Harness ohne Vorgabe je Track (Abwärtskompatibilität): direct → In-Process, cloud → Muse, self → opencode.
export const defaultHarness = (track) => (track === 'direct' ? 'direct' : track === 'cloud' ? 'muse' : 'opencode');

// `requested` ist `--harness` bzw. das Frontmatter-Feld; 'auto' oder leer lässt den Tier wählen:
// cloud → tier.harness (PLAN_RUNNER_CLOUD_HARNESS), ohne Angabe Muse auf dem Cloud-Track der ersten Wahl
// (bisheriges Verhalten, Go-Abo) und claude als Eskalationsziel (`escalation`); lokal → direct/opencode je
// Track, ein lokaler Tier ohne Track (3060ti) → pi.
export function resolveHarness({ requested, tier, track, escalation = false }) {
  if (requested && requested !== 'auto') return requested;
  if (tier?.kind === 'cloud') return tier.harness || (track === 'cloud' && !escalation ? 'muse' : 'claude');
  if (track === 'direct' || track === 'self') return defaultHarness(track);
  return 'pi';
}

// Env des Kindprozesses: Kopie ohne GitHub-Tokens und fremde Keys, PWD folgt dem Worktree
// (`opencode run` nimmt das Projekt-Root aus PWD).
export function scrubEnv(env, harness, worktree) {
  const out = { ...env, PWD: worktree };
  for (const k of [...GH_TOKENS, ...(FOREIGN_KEYS[harness] ?? [])]) delete out[k];
  return out;
}

// → { bin, args, env }. opencode/muse brauchen `agent` (muse: Default plan-worker-muse) und optional `model`.
export function harnessSpawn({ harness, prompt, worktree, tier = null, agent = null, model = null, env = process.env }) {
  let bin;
  let args;
  if (harness === 'opencode' || harness === 'muse') {
    const name = harness === 'muse' ? (agent || AGENT_MUSE) : agent;
    if (!name) throw new Error('harness opencode needs an agent');
    bin = env.PLAN_RUNNER_OPENCODE || 'opencode';
    args = ['run', '--agent', name, ...(model ? ['--model', model] : []), prompt];
  } else if (harness === 'pi') {
    bin = 'pi';
    // Provider = Tier (`--provider` verlangt `--model`); die Provider-Config mit der Tier-URL liegt in pi.
    const m = tier?.model;
    args = ['--mode', 'json', '-p', '--no-session', ...(m ? ['--provider', tier.provider || tier.id, '--model', m] : []), prompt];
  } else if (harness === 'claude') {
    bin = 'claude';
    args = ['-p', '--output-format', 'json', '--model', env.PLAN_RUNNER_CLAUDE_MODEL || 'sonnet', prompt];
  } else if (harness === 'agy') {
    bin = 'agy';
    args = ['-p', '--output-format', 'json',
      ...(env.PLAN_RUNNER_AGY_SKIP_PERMISSIONS === '1' ? ['--dangerously-skip-permissions'] : []),
      ...(env.PLAN_RUNNER_AGY_MODEL ? ['--model', env.PLAN_RUNNER_AGY_MODEL] : []), prompt];
  } else {
    throw new Error(`harness ${harness} has no child process`);
  }
  return { bin, args, env: scrubEnv(env, harness, worktree) };
}

function jsonObjects(out) {
  const events = [];
  for (const raw of String(out ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith('{')) continue;
    try {
      const e = JSON.parse(line);
      if (e && typeof e === 'object') events.push(e);
    } catch { /* kein JSON: Log-Zeile */ }
  }
  return events;
}

const assistantText = (m) => {
  if (m?.role !== 'assistant') return '';
  if (typeof m.content === 'string') return m.content;
  if (!Array.isArray(m.content)) return '';
  return m.content.filter((b) => b?.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('');
};

// pi (--mode json -p): Text der letzten Assistenten-Nachricht; agent_end bzw. agent_settled schließen den
// Lauf ab (im One-Shot-Modus ist das Prozessende danach das Settlement), agent_settled mit aborted → Abbruch.
function parsePi(out) {
  let text = '';
  let completed = false;
  let aborted = false;
  for (const e of jsonObjects(out)) {
    if (e.type === 'agent_end') {
      completed = true;
    } else if (e.type === 'agent_settled') {
      completed = true;
      if (e.aborted) aborted = true;
    } else if (e.type === 'message_end') {
      const t = assistantText(e.message);
      if (t) text = t;
    }
  }
  return { text, completed, aborted };
}

// Auswertung der Ausgabe → { ok, summary, costUsd|null, flatRate }. Die PLAN-RUNNER-RESULT-Zeile entscheidet
// wie bei allen Workern über ok; der Harness liefert Kosten (claude: total_cost_usd) und Settlement.
export function parseOutcome(harness, stdout) {
  const flatRate = FLAT_RATE.has(harness);
  if (harness === 'pi') {
    const { text, completed, aborted } = parsePi(stdout);
    if (aborted) return { ok: false, summary: 'aborted', costUsd: null, flatRate };
    if (!completed) return { ok: false, summary: 'no-settle', costUsd: null, flatRate };
    const r = parseResult(text);
    return { ok: r.ok, summary: r.summary, costUsd: null, flatRate };
  }
  if (harness === 'claude' || harness === 'agy') {
    const last = jsonObjects(stdout).filter((e) => typeof e.result === 'string' || typeof e.text === 'string').pop();
    if (!last) return { ok: false, summary: 'no json result', costUsd: null, flatRate };
    const text = typeof last.result === 'string' ? last.result : last.text;
    const costUsd = Number.isFinite(last.total_cost_usd) ? last.total_cost_usd : null;
    if (last.is_error === true) return { ok: false, summary: `${harness} error: ${text.slice(0, 120)}`, costUsd, flatRate };
    const r = parseResult(text);
    return { ok: r.ok, summary: r.summary, costUsd, flatRate };
  }
  const r = parseResult(stdout);
  return { ok: r.ok, summary: r.summary, costUsd: null, flatRate };
}
