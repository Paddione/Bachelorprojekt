#!/usr/bin/env node
// scripts/content-check.mjs
//
// Fail-closed Dangling-Ref-Guard über die Content-Registry
// (goals/guardrails/components/themes/taxonomy — Plan registry-ssot-gates P4).
//
//   node scripts/content-check.mjs                    # prüfen (task content:check)
//   node scripts/content-check.mjs --emit-map         # Karte schreiben (task content:map)
//   node scripts/content-check.mjs --registry <dir>   # gegen ein Fixture-Verzeichnis laufen
//
// Gegenbeleg (eingebunden statt dupliziert): scripts/agent-guide/validate.mjs
// prüft bereits Guardrails/Related-Zugehörigkeit (tools.guardrails/related,
// goals.guardrails/flow-tools, components.relates_to/theme, taxonomy-Refs) —
// dieser Guard ruft validateRegistry() als Substrat auf und ergänzt NUR die
// Lücke, die validate.mjs nicht abdeckt:
//   1. goals[].related muss auf bekannte Goal-IDs zeigen (Dangling-Ref).
//
// Die Karte docs/agent-guide/maps/content-map.md zeigt je Komponente/Goal,
// ob sie live verdrahtet oder tot (unreferenziert) ist.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { validateRegistry } from './agent-guide/validate.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REGISTRY_DIR = join(REPO, 'docs/agent-guide/registry');
const DEFAULT_MAP = join(REPO, 'docs/agent-guide/maps/content-map.md');

function loadYaml(dir, name) {
  try {
    return parseYaml(readFileSync(join(dir, `${name}.yaml`), 'utf8'));
  } catch {
    return null;
  }
}

/** Lücken-Ergänzung zu validate.mjs: goals[].related ⊆ Goal-IDs. */
function checkGoalRelated(goals) {
  const problems = [];
  const ids = new Set((goals ?? []).map((g) => g?.id));
  for (const goal of goals ?? []) {
    for (const rid of goal?.related ?? []) {
      if (!ids.has(rid)) {
        problems.push(`goals[${goal?.id}]: related '${rid}' ist keine bekannte Goal-ID`);
      }
    }
  }
  return problems;
}

function check(registryDir) {
  const problems = [];
  const res = validateRegistry(registryDir, null);
  for (const error of res.errors ?? []) problems.push(`validate.mjs: ${error}`);
  const goals = loadYaml(registryDir, 'goals');
  if (!Array.isArray(goals)) {
    problems.push('goals.yaml fehlt oder ist keine Liste');
    return problems;
  }
  problems.push(...checkGoalRelated(goals));
  return problems;
}

function cell(text) {
  return String(text ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim() || '—';
}

function renderMap(registryDir) {
  const goals = loadYaml(registryDir, 'goals') ?? [];
  const components = loadYaml(registryDir, 'components') ?? [];
  const rel = 'docs/agent-guide/registry';
  const referencing = new Map();
  for (const c of components) {
    for (const rid of c?.relates_to ?? []) {
      if (!referencing.has(rid)) referencing.set(rid, []);
      referencing.get(rid).push(c.slug);
    }
  }
  const lines = [
    '# Content-Registry',
    '',
    `<!-- GENERIERT aus ${rel} — nicht von Hand editieren.`,
    '     Neu erzeugen: task content:map · Prüfen: task content:check -->',
    '',
    'Jede Komponente und jedes Goal mit Verdrahtungsstatus: live (referenziert)',
    'oder tot (unreferenziert — Kandidat zum Aufräumen, kein Fehler).',
    'Ref-Guard: `scripts/agent-guide/validate.mjs` + `scripts/content-check.mjs`.',
    '',
    '## Goals',
    '',
    '| Goal | Gefahr | Referenzen (related) | Genutzt von Komponenten | Status |',
    '|---|---|---|---|---|',
  ];
  for (const goal of goals) {
    const users = referencing.get(goal.id) ?? [];
    // Ein Goal ist live, wenn es referenziert wird ODER selbst referenziert
    // (common-Einstiege) — tot nur ohne jede Kante.
    const live = users.length > 0 || (goal.related ?? []).length > 0 || goal.common === true;
    lines.push(
      `| \`${cell(goal.id)}\` | ${cell(goal.danger)} | ` +
        `${(goal.related ?? []).map((r) => `\`${cell(r)}\``).join(', ') || '—'} | ` +
        `${users.map((u) => `\`${cell(u)}\``).join(', ') || '—'} | ` +
        `${live ? 'live' : 'tot'} |`,
    );
  }
  lines.push('', '## Komponenten', '', '| Komponente | Art | Ziel (relates_to) | Status |', '|---|---|---|---|');
  const goalIds = new Set(goals.map((g) => g?.id));
  for (const c of components) {
    const targets = c?.relates_to ?? [];
    const live = targets.length === 0 || targets.some((t) => goalIds.has(t));
    lines.push(
      `| \`${cell(c.slug)}\` | ${cell(c.kind)} | ` +
        `${targets.map((t) => `\`${cell(t)}\``).join(', ') || '—'} | ` +
        `${live ? 'live' : 'tot'} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

function flagValue(argv, flag) {
  const i = argv.indexOf(flag);
  if (i === -1) return null;
  const value = argv[i + 1];
  if (!value) {
    console.error(`content-check: ${flag} braucht einen Pfad`);
    process.exit(2);
  }
  return value;
}

function main(argv) {
  const emitMap = argv.includes('--emit-map');
  const registryDir = flagValue(argv, '--registry') ?? DEFAULT_REGISTRY_DIR;

  const problems = check(registryDir);
  if (problems.length > 0) {
    console.error(`content-check: ${problems.length} Verstoß/Verstöße`);
    for (const problem of problems) console.error(`  ✗ ${problem}`);
    return 1;
  }

  if (emitMap) {
    writeFileSync(DEFAULT_MAP, renderMap(registryDir), 'utf8');
    console.log(`content-check: Karte geschrieben — ${DEFAULT_MAP}`);
    return 0;
  }

  const goals = loadYaml(registryDir, 'goals') ?? [];
  console.log(`content-check: OK — ${goals.length} Goals, keine Dangling-Refs`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
