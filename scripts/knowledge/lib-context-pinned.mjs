#!/usr/bin/env node
/**
 * lib-context-pinned.mjs — Pinned-Set der S1-Retrieval-Schicht (T002658).
 *
 * Relevanz-Ranking und Sicherheitsrelevanz sind unkorreliert: Ein Hinweis wie
 * "prod-fleet/* verwenden, nie bares prod/" ist zu keiner einzelnen Aufgabe
 * besonders aehnlich — er ist zu allen relevant. Ein reiner Similarity-Ranker
 * rankt ihn systematisch weg, gerade weil er allgemein formuliert ist. Genau
 * der Kontext, der nie fehlen darf, ist der, den Retrieval als erstes
 * verliert. Ein Score-Bonus verschiebt diese Grenze nur und gibt keine
 * pruefbare Garantie; ein separates Budget macht die Garantie als Test
 * formulierbar (--budget 0 -> Guardrails trotzdem im Output, p6).
 *
 * Quellen: docs/agent-guide/registry/guardrails.yaml (alle Eintraege) und die
 * Eintraege mit tier: caution|danger aus docs/agent-guide/registry/
 * capabilities.yaml, gefiltert auf die Rolle einschliesslich roles: [all].
 *
 * Rollen-Allowlist wird nicht dupliziert: gelesen aus
 * docs/agent-guide/registry/agents.yaml (Schluessel unter `roles:`), ergaenzt
 * um `orchestrator` — dieselbe Quelle, aus der scripts/toolset-context.sh
 * seine VALID_ROLES bezieht (dort hartkodiert gespiegelt; agents.yaml ist die
 * maschinenlesbare SSOT im selben Registry-Verzeichnis). Eine unbekannte Rolle
 * fuehrt zu einem FEHLER, nicht zu einem stillen Rueckfall auf "alle" —
 * scripts/plan-context.sh zeigt in T002322, wohin der stille Fallback fuehrt.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_DIR = join(__dirname, '..', '..', 'docs', 'agent-guide', 'registry');

/** Rollen-Allowlist: agents.yaml `roles:`-Schluessel + orchestrator. */
export function loadRoleAllowlist() {
  const data = yaml.load(readFileSync(join(REGISTRY_DIR, 'agents.yaml'), 'utf8'));
  const roles = Object.keys(data?.roles ?? {});
  if (!roles.includes('orchestrator')) roles.push('orchestrator');
  return roles;
}

/** Wirft, wenn die Rolle unbekannt ist; liefert sonst die Allowlist. */
export function assertRole(role) {
  const allowlist = loadRoleAllowlist();
  if (!allowlist.includes(role)) {
    throw new Error(`unbekannte Rolle "${role}" — gueltig: ${allowlist.join(', ')}`);
  }
  return allowlist;
}

function readRegistry(name) {
  return yaml.load(readFileSync(join(REGISTRY_DIR, name), 'utf8'));
}

/**
 * Laedt das Pinned-Set fuer eine Rolle. Wirft bei unbekannter Rolle
 * (fail-closed, kein stiller Fallback auf "alle").
 *
 * Rueckgabe: { role, entries } — entries je { id, name, rule, why, source },
 * wobei source 'guardrails' | 'capabilities' ist. Fuer capabilities-Eintraege
 * ist rule die use_when-Zeile und why die avoid_when/fallback-Zeile.
 */
export function loadPinned(role) {
  assertRole(role);

  const entries = [];

  const guardrails = readRegistry('guardrails.yaml');
  for (const g of Array.isArray(guardrails) ? guardrails : []) {
    if (!g || !g.id) continue;
    entries.push({
      id: g.id,
      name: g.name_de ?? '',
      rule: g.rule_de ?? '',
      why: g.why_de ?? '',
      enforcedBy: g.enforced_by ?? null,
      source: 'guardrails',
    });
  }

  const capabilities = readRegistry('capabilities.yaml');
  const caps = capabilities?.capabilities ?? {};
  for (const [capName, instances] of Object.entries(caps)) {
    for (const [instKey, cfg] of Object.entries(instances ?? {})) {
      if (!cfg || typeof cfg !== 'object') continue;
      const tier = cfg.tier;
      if (tier !== 'caution' && tier !== 'danger') continue;
      const roles = Array.isArray(cfg.roles) ? cfg.roles : [];
      if (!roles.includes(role) && !roles.includes('all')) continue;
      entries.push({
        id: `${capName} -> ${instKey}`,
        name: `tier=${tier}`,
        rule: cfg.use_when ?? '',
        why: [cfg.avoid_when, cfg.fallback].filter(Boolean).join(' | '),
        tier,
        source: 'capabilities',
      });
    }
  }

  return { role, entries };
}

/**
 * Rendert das Pinned-Set als Markdown-Block. Sein Umfang wird gegen --budget
 * NICHT verrechnet und in der Bilanz separat als `pinned` ausgewiesen.
 */
export function renderPinned({ role, entries }) {
  if (entries.length === 0) return '';
  const lines = [`## Pinned-Kontext (Rolle: ${role})`];
  for (const e of entries) {
    const label = e.source === 'guardrails' ? e.id : `${e.id} (${e.name})`;
    const why = e.why ? ` — ${e.why}` : '';
    lines.push(`- **${label}:** ${e.rule}${why}`);
  }
  return lines.join('\n');
}
