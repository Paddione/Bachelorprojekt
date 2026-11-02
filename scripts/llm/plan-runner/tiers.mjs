// tiers.mjs — Fallback-Kette und Budget des plan-runners (walkie-dispatch-flow p6, C6/C7/C8).
// Ein Tier ist eine Ausführungsstufe: `5070ti` (lokal, Tracks direct/self), optional `3060ti` (lokal, eigene URL),
// `cloud` (Harness aus PLAN_RUNNER_CLOUD_HARNESS). Nach einem Fehlschlag wählt nextTier den nächsten Tier in der
// Reihenfolge des `fallback`-Frontmatters; jeder Tier wird je Partial höchstens einmal versucht. Vor `cloud`
// gilt das Budget (spentUsd >= budgetUsd → Pause `budget`), ist kein Tier übrig, wartet die Partial auf den
// Eigner (Pause `owner`). Ein lokaler Tier mit gehaltener GPU-Lease (PLAN_RUNNER_LEASE_GUARD <gpu>) wird
// übersprungen, nie verdrängt: hier wird nichts gestoppt.
// Env: PLAN_RUNNER_TIERS (JSON, ersetzt den Default), PLAN_RUNNER_TIER2_URL/_MODEL (aktivieren 3060ti),
//      PLAN_RUNNER_CLOUD_HARNESS, PLAN_RUNNER_LEASE_GUARD (Befehl, bekommt den GPU-Index als letztes Argument).
// Aufrufer: scripts/llm/plan-runner.mjs. Runbook: docs/runbooks/plan-runner.md.

import { execFile } from 'node:child_process';
import { HARNESS_IDS } from './harness.mjs';

const LOCAL_TRACKS = ['direct', 'self'];
const GUARD_TIMEOUT_MS = 15_000;
const PROBE_TIMEOUT_MS = 5_000;
let guardNoticeLogged = false; // `lease guard not configured` nur einmal je Prozess

const DEFAULT_TIERS = [
  { id: '5070ti', kind: 'local', tracks: ['direct', 'self'], gpu: 0 },
  { id: '3060ti', kind: 'local', url: '$PLAN_RUNNER_TIER2_URL', model: '$PLAN_RUNNER_TIER2_MODEL' },
  { id: 'cloud', kind: 'cloud', harness: '$PLAN_RUNNER_CLOUD_HARNESS' },
];

// Ganze Strings der Form $NAME bzw. ${NAME} werden aus env ersetzt; leere Werte entfallen.
function expandTier(tier, env) {
  const out = {};
  for (const [k, v] of Object.entries(tier)) {
    const val = typeof v === 'string' ? v.replace(/^\$\{?([A-Za-z0-9_]+)\}?$/, (_, n) => env[n] ?? '') : v;
    if (val !== '') out[k] = val;
  }
  return out;
}

function validate(tiers) {
  const bad = (msg) => { throw new Error(`PLAN_RUNNER_TIERS: ${msg}`); };
  if (!Array.isArray(tiers) || !tiers.length) bad('needs a non-empty JSON array of tiers');
  const ids = new Set();
  for (const t of tiers) {
    if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !t.id) bad('every tier needs a string id');
    if (ids.has(t.id)) bad(`duplicate tier id ${t.id}`);
    ids.add(t.id);
    if (t.kind !== 'local' && t.kind !== 'cloud') bad(`tier ${t.id}: kind must be local or cloud, got ${t.kind}`);
    if (t.tracks !== undefined && (!Array.isArray(t.tracks) || t.tracks.some((x) => !LOCAL_TRACKS.includes(x)))) {
      bad(`tier ${t.id}: tracks must be a subset of ${LOCAL_TRACKS.join(',')}`);
    }
    if (t.gpu !== undefined && !(Number.isInteger(t.gpu) && t.gpu >= 0)) bad(`tier ${t.id}: gpu must be an integer >= 0`);
    if (t.kind === 'local' && !t.tracks && !t.url) bad(`tier ${t.id}: a local tier needs tracks or url`);
    if (t.kind === 'cloud' && t.harness !== undefined && !HARNESS_IDS.includes(t.harness)) {
      bad(`tier ${t.id}: unknown harness ${t.harness}`);
    }
  }
  return tiers;
}

// → Tier[] in Reihenfolge der Kette; ungültige Konfiguration wirft (Aufrufer: Exit 2).
export function parseTiers(env = process.env) {
  if (env.PLAN_RUNNER_TIERS === undefined || env.PLAN_RUNNER_TIERS === '') {
    // Default: 3060ti nur mit PLAN_RUNNER_TIER2_URL (ohne Endpunkt gibt es nichts anzusprechen).
    return validate(DEFAULT_TIERS.map((t) => expandTier(t, env)).filter((t) => t.kind !== 'local' || t.tracks || t.url));
  }
  let raw;
  try {
    raw = JSON.parse(env.PLAN_RUNNER_TIERS);
  } catch (e) {
    throw new Error(`PLAN_RUNNER_TIERS: invalid JSON (${e.message})`);
  }
  return validate(Array.isArray(raw) ? raw.map((t) => (t && typeof t === 'object' ? expandTier(t, env) : t)) : raw);
}

// Tier der ersten Track-Wahl (decideTrack bleibt unverändert): direct/self → lokaler Tier mit diesem Track,
// cloud → cloud-Tier. Ohne passenden Tier ein synthetischer mit der Track-ID.
export function tierForTrack(tiers, track) {
  const hit = tiers.find((t) => (track === 'cloud' ? t.kind === 'cloud' : t.kind === 'local' && (t.tracks ?? []).includes(track)));
  return hit ?? { id: track, kind: track === 'cloud' ? 'cloud' : 'local' };
}

// Track, auf dem ein Eskalations-Tier läuft: der Frontmatter-Hinweis, wenn der Tier ihn kann, sonst sein erster Track.
export function trackForTier(tier, hint) {
  if (tier.kind === 'cloud') return 'cloud';
  const tracks = tier.tracks ?? [];
  return tracks.includes(hint) ? hint : (tracks[0] ?? null);
}

function runGuard(guard, gpu) {
  const [bin, ...pre] = guard.trim().split(/\s+/);
  return new Promise((resolve) => {
    execFile(bin, [...pre, String(gpu)], { timeout: GUARD_TIMEOUT_MS }, (err) => resolve(err ? (err.code ?? 'error') : 0));
  });
}

async function probeUrl(url, fetchImpl) {
  try {
    const r = await fetchImpl(`${url.replace(/\/$/, '')}/v1/models`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    return r.ok;
  } catch {
    return false;
  }
}

// Lokaler Tier verfügbar = GPU-Lease frei (Guard Exit 0; jeder andere Ausgang zählt als belegt oder unlesbar,
// fail closed) UND /v1/models antwortet (tier.url, sonst defaultUrl). Der Cloud-Tier ist immer verfügbar.
export async function tierAvailable(tier, { leaseGuard = null, defaultUrl = null, fetchImpl = fetch, log = () => {} } = {}) {
  if (tier.kind === 'cloud') return true;
  if (Number.isInteger(tier.gpu)) {
    if (!leaseGuard) {
      if (!guardNoticeLogged) { guardNoticeLogged = true; log('lease guard not configured (PLAN_RUNNER_LEASE_GUARD)'); }
    } else {
      const code = await runGuard(leaseGuard, tier.gpu);
      if (code !== 0) {
        log(`tier ${tier.id} skipped: GPU ${tier.gpu} is leased or unreadable (guard exit ${code}); nothing is stopped`);
        return false;
      }
    }
  }
  const url = tier.url || defaultUrl;
  if (url && !(await probeUrl(url, fetchImpl))) {
    log(`tier ${tier.id} skipped: ${url} did not answer /v1/models`);
    return false;
  }
  return true;
}

// Reine Entscheidung: nächster Tier der Kette oder Pause. `unavailable` enthält Tier-IDs, die nicht antworten.
export function nextTier(partial, history, tiers, ledger, unavailable = new Set()) {
  const byId = new Map(tiers.map((t) => [t.id, t]));
  const order = partial?.fallback?.length ? partial.fallback : tiers.map((t) => t.id);
  const tried = new Set((history ?? []).map((h) => h.tier));
  let budgetBlocked = false;
  for (const id of order) {
    const tier = byId.get(id);
    if (!tier || tried.has(id) || unavailable.has(id)) continue;
    if (tier.kind === 'cloud' && ledger.spentUsd >= ledger.budgetUsd) { budgetBlocked = true; continue; }
    return { tier };
  }
  return { pause: budgetBlocked ? 'budget' : 'owner' };
}

// nextTier mit Verfügbarkeitsprüfung: nicht erreichbare oder belegte Tiers fallen aus der Wahl.
export async function pickTier(partial, history, tiers, ledger, ctx) {
  const skipped = new Set();
  for (;;) {
    const r = nextTier(partial, history, tiers, ledger, skipped);
    if (!r.tier || await tierAvailable(r.tier, ctx)) return r;
    skipped.add(r.tier.id);
  }
}

// Bucht einen Aufruf im Ledger: gemeldete Kosten zählen gegen das Budget, Pauschal-Harnesses (Muse) buchen
// 0 USD und werden in flatRateCalls getrennt gezählt, unbekannte Kosten (lokal) buchen 0.
export function bookCost(ledger, { partial, harness, costUsd, flatRate }) {
  const cost = flatRate || !Number.isFinite(costUsd) ? 0 : costUsd;
  ledger.spentUsd = Math.round((ledger.spentUsd + cost) * 1e6) / 1e6;
  if (flatRate) ledger.flatRateCalls += 1;
  ledger.calls.push({ partial, harness, costUsd: cost, flatRate: Boolean(flatRate) });
  return ledger;
}

// Fortsetzen (nach loadState): setzt das Budget dieses Laufs; paused_budget wird wieder open, sobald das Budget
// über den Ausgaben liegt, paused_owner beginnt mit frischer Kette (der Neustart ist die Antwort des Eigners).
// Liefert die IDs der wieder freigegebenen Partials.
export function applyBudget(state, budgetUsd) {
  state.ledger.budgetUsd = budgetUsd;
  const resumed = [];
  for (const [id, s] of Object.entries(state.partials)) {
    const budget = s.status === 'paused_budget' && state.ledger.spentUsd < budgetUsd;
    if (budget || s.status === 'paused_owner') {
      if (!budget) s.history = [];
      Object.assign(s, { status: 'open', owner: null });
      resumed.push(id);
    }
  }
  return resumed;
}
