// tests/e2e/agent/oracle.mjs
// T901645 — deterministische Flow-Checks fuer den Vision-Agent-Harness.
// Pure Functions ohne Browser-Import, damit `node --test` sie ohne
// Playwright laden kann. Check-Typen (camelCase): urlContains, urlMatches,
// textContains, textMatches, apiEquals.
import { isDeepStrictEqual } from 'node:util';

const short = (v, n = 120) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v) ?? String(v);
  return s.length > n ? s.slice(0, n) + '…' : s;
};

function atPath(obj, path) {
  if (!path) return obj;
  return String(path).split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function matchRegex(pattern, haystack) {
  try {
    return { ok: true, pass: new RegExp(pattern).test(haystack ?? '') };
  } catch (e) {
    return { ok: false, error: String(e.message ?? e) };
  }
}

function evaluateCheck(check, state) {
  const name = check.name ?? check.type;
  const fail = (detail) => ({ name, pass: false, detail });
  const pass = (detail) => ({ name, pass: true, detail });
  switch (check.type) {
    case 'urlContains':
      return (state.url ?? '').includes(check.value)
        ? pass(`url enthaelt ${short(check.value)}`)
        : fail(`url ${short(state.url)} enthaelt nicht ${short(check.value)}`);
    case 'urlMatches': {
      const r = matchRegex(check.value, state.url);
      if (!r.ok) return fail(`ungueltiges urlMatches-Pattern ${short(check.value)}: ${r.error}`);
      return r.pass
        ? pass(`url passt auf ${short(check.value)}`)
        : fail(`url ${short(state.url)} passt nicht auf ${short(check.value)}`);
    }
    case 'textContains':
      return (state.text ?? '').includes(check.value)
        ? pass(`text enthaelt ${short(check.value)}`)
        : fail(`text enthaelt nicht ${short(check.value)}`);
    case 'textMatches': {
      const r = matchRegex(check.value, state.text);
      if (!r.ok) return fail(`ungueltiges textMatches-Pattern ${short(check.value)}: ${r.error}`);
      return r.pass
        ? pass(`text passt auf ${short(check.value)}`)
        : fail(`text passt nicht auf ${short(check.value)}`);
    }
    case 'apiEquals': {
      const actual = atPath(state.apiState ?? {}, check.path);
      return isDeepStrictEqual(actual, check.value)
        ? pass(`apiState${check.path ? '.' + check.path : ''} gleich ${short(check.value)}`)
        : fail(`apiState${check.path ? '.' + check.path : ''} ist ${short(actual)}, erwartet ${short(check.value)}`);
    }
    default:
      return fail(`unbekannter Check-Typ ${short(check.type)}`);
  }
}

const FLOW_CHECK_TYPES = ['urlContains', 'urlMatches', 'textContains', 'textMatches', 'apiEquals'];

export function validateFlows(flows) {
  if (!Array.isArray(flows) || !flows.length) throw new Error('Flow ?: flows muss ein nicht-leeres Array sein');
  for (const flow of flows) {
    const id = flow?.id;
    if (typeof id !== 'string' || !id) throw new Error('Flow <unknown>: id fehlt oder ist kein nicht-leerer String');
    if (typeof flow.start_url !== 'string' || !flow.start_url.startsWith('/')) {
      throw new Error(`Flow ${id}: start_url muss relativ sein (fuehrendes /)`);
    }
    const checks = flow.goal_checks ?? flow.checks;
    if (!Array.isArray(checks) || !checks.length) throw new Error(`Flow ${id}: goal_checks fehlt oder ist leer`);
    for (const c of checks) {
      if (!c || !FLOW_CHECK_TYPES.includes(c.type)) throw new Error(`Flow ${id}: unbekannter Check-Typ ${c?.type}`);
      if (!('value' in c)) throw new Error(`Flow ${id}: Check ${c.type} ohne value`);
    }
    if ('auth' in flow && typeof flow.auth !== 'boolean') throw new Error(`Flow ${id}: auth muss boolean sein`);
  }
  return flows;
}

export function evaluateFlow(flow, state) {
  const checks = (flow.checks ?? []).map((c) => evaluateCheck(c, state ?? {}));
  return { pass: checks.every((c) => c.pass), checks };
}

export function summarize(result) {
  const failed = (result.checks ?? []).filter((c) => !c.pass).map((c) => c.name);
  return `flow=${result.flow ?? '?'} pass=${result.pass} failed=${failed.join(',') || 'none'}`;
}
