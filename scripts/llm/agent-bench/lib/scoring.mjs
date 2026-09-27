// scripts/llm/agent-bench/lib/scoring.mjs
// Reine, deterministische Score-Berechnung. Kein LLM-Judge, kein Netzwerk,
// kein Prozesszugriff: gleiche Eingaben -> identische Score-Vektoren.

import { readFileSync } from 'node:fs';

// Diese Arten zaehlen fuer jede Rolle als Fehler mit Faktor 1.
const GENERIC_ERROR_KINDS = Object.freeze([
  'protocol_error',
  'tool_error',
  'timeout',
]);

const DEFAULT_CONFIG_PATH = new URL('../scoring.json', import.meta.url);

/**
 * kind -> { channel: 'error'|'detour', factor }.
 * Regel: der Schluessel muss im rollenspezifischen Block als
 * `<kind>_error` oder `<kind>_detour` stehen.
 */
function classifyEvent(kind, roleConfig) {
  if (GENERIC_ERROR_KINDS.includes(kind)) {
    return { channel: 'error', factor: 1 };
  }
  if (roleConfig[`${kind}_error`] !== undefined) {
    return { channel: 'error', factor: Number(roleConfig[`${kind}_error`]) };
  }
  if (roleConfig[`${kind}_detour`] !== undefined) {
    return { channel: 'detour', factor: Number(roleConfig[`${kind}_detour`]) };
  }
  return null;
}

function assertConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('scoreRun: scoring-Konfiguration fehlt');
  }
  if (!Number.isFinite(Number(config.version))) {
    throw new Error('scoreRun: scoring-Konfiguration hat keine version');
  }
  const w = config.weights;
  if (!w || typeof w !== 'object') {
    throw new Error('scoreRun: scoring-Konfiguration hat keinen weights-Block');
  }
  for (const key of ['error', 'detour', 'budget_per_50pct_over', 'budget_cap']) {
    if (!Number.isFinite(Number(w[key]))) {
      throw new Error(`scoreRun: weights.${key} fehlt oder ist keine Zahl`);
    }
  }
  if (!config.roles || typeof config.roles !== 'object') {
    throw new Error('scoreRun: scoring-Konfiguration hat keinen roles-Block');
  }
}

function budgetPenalty(effort, weights) {
  if (!(effort > 1)) return 0;
  const steps = Math.floor((effort - 1) / 0.5 + 1);
  return Math.min(
    Number(weights.budget_cap),
    steps * Number(weights.budget_per_50pct_over),
  );
}

/**
 * scoreRun({ role, outcome, events, usage, budget }, config)
 * -> { scoring_version, outcome, errors, detours, effort, score, events }
 *
 * `events` ist eine Liste `{ kind, weight? }` aus der Rollen-Auswertung.
 * `weight` ueberschreibt optional den Faktor aus der Konfiguration.
 */
export function scoreRun({ role, outcome, events = [], usage = {}, budget = {} } = {}, config) {
  assertConfig(config);
  const roleConfig = config.roles[role];
  if (!roleConfig || typeof roleConfig !== 'object') {
    throw new Error(
      `scoreRun: Rolle "${role}" steht nicht in der scoring-Konfiguration ` +
        `(bekannt: ${Object.keys(config.roles).join(', ')})`,
    );
  }

  const scoredEvents = [];
  let errors = 0;
  let detours = 0;

  for (const event of events) {
    const kind = event && typeof event.kind === 'string' ? event.kind : null;
    if (!kind) {
      throw new Error('scoreRun: Ereignis ohne kind');
    }
    const classification = classifyEvent(kind, roleConfig);
    if (!classification) {
      throw new Error(
        `scoreRun: Ereignis-Typ "${kind}" ist fuer Rolle "${role}" nicht gewichtet ` +
          `(erwartet: <kind>_error oder <kind>_detour in scoring.json)`,
      );
    }
    const factor =
      Number.isFinite(Number(event.weight)) ? Number(event.weight) : classification.factor;
    if (classification.channel === 'error') errors += factor;
    else detours += factor;
    scoredEvents.push({ kind, channel: classification.channel, factor });
  }

  const budgetTokens = Number(budget?.tokens);
  const totalTokens = Number(usage?.total_tokens);
  const effort =
    Number.isFinite(budgetTokens) && budgetTokens > 0 && Number.isFinite(totalTokens)
      ? totalTokens / budgetTokens
      : 0;

  const outcomeValue = Number(outcome);
  if (!Number.isFinite(outcomeValue)) {
    throw new Error('scoreRun: outcome muss eine Zahl zwischen 0 und 1 sein');
  }

  const penalty = budgetPenalty(effort, config.weights);
  const score = Math.max(
    0,
    Math.round(
      100 * outcomeValue -
        Number(config.weights.error) * errors -
        Number(config.weights.detour) * detours -
        penalty,
    ),
  );

  return {
    scoring_version: Number(config.version),
    role,
    outcome: outcomeValue,
    errors,
    detours,
    effort,
    budget_penalty: penalty,
    score,
    events: scoredEvents,
  };
}

function versionOf(value) {
  const v = value && typeof value === 'object' ? value.scoring_version ?? value.version : undefined;
  return Number.isFinite(Number(v)) ? Number(v) : null;
}

/**
 * Paired Regression Gate: ein Baseline-Vergleich ist nur zulaessig, wenn
 * beide Seiten dieselbe scoring_version tragen. Sonst Config-Error statt
 * Verdict — ein Versionssprung wuerde sonst still als Regression lesen.
 */
export function compareVersions(a, b) {
  const va = versionOf(a);
  const vb = versionOf(b);
  if (va === null || vb === null) {
    throw new Error(
      'compareVersions: scoring_version fehlt — Baseline oder Kandidat ohne Version?',
    );
  }
  if (va !== vb) {
    throw new Error(
      `compareVersions: scoring_version weicht ab (Baseline ${va}, Kandidat ${vb}) — ` +
        'Vergleich nicht zulaessig, Baseline neu erzeugen',
    );
  }
  return va;
}

/** scoring.json laden (Standard: neben diesem Modul). */
export function loadScoringConfig(configPath = DEFAULT_CONFIG_PATH) {
  const target = configPath instanceof URL ? configPath : new URL(`file://${configPath}`);
  let text;
  try {
    text = readFileSync(target, 'utf8');
  } catch (err) {
    throw new Error(`loadScoringConfig: ${target.pathname} nicht lesbar: ${err.message}`);
  }
  try {
    const config = JSON.parse(text);
    assertConfig(config);
    return config;
  } catch (err) {
    throw new Error(`loadScoringConfig: ${target.pathname} ist ungueltig: ${err.message}`);
  }
}
