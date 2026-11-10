#!/usr/bin/env node
// scripts/agents-check.mjs
//
// Fail-closed Guard über Agent-Rollen/Modelle
// (docs/agent-guide/registry/agents.yaml, SSOT — Plan registry-ssot-gates P2).
//
//   node scripts/agents-check.mjs                              # prüfen (task agents:check)
//   node scripts/agents-check.mjs --registry <pfad> --models <pfad>
//     --agents-dir <dir> --roles <pfad>    # gegen Fixtures laufen
//
// Geprüft wird (Kreuz-Sync, was validate.mjs NICHT abdeckt):
//   1. jeder Runtime-Eintrag in agents.yaml existiert in
//      .opencode/agent-models.jsonc (`agent`-Sektion) mit identischem Modell,
//   2. jeder Agent in agent-models.jsonc hat einen Runtime-Eintrag in agents.yaml,
//   3. jede Rolle in agents.yaml hat eine Datei .claude/agents/<rolle>.md, deren
//      Frontmatter-`model:` dem `claude_code`-Wert entspricht,
//   4. jede bp-*-Rolle aus scripts/toolset/lib/roles.mjs hat einen Rollen-Eintrag
//      in agents.yaml und umgekehrt (Legacy-Aliase lösen auf bp-* auf).
//
// Gegenbeleg (eingebunden statt dupliziert):
//   - scripts/agent-guide/validate.mjs (Zeilen 46-62) prüft agents.yaml intern
//     (Harness-Keys je Rolle, mode/modell je Runtime).
//   - task test:unit:agents (taskfiles/Taskfile.test.yml:98) prüft Output-Trust-
//     Prosa in .claude/agents/bp-run.md — kein Modell-Mapping, keine Duplikation.
//   - docs/agent-guide/maps/agents-map.md wird von scripts/agent-guide/emit-maps.mjs
//     generiert (task agent-guide:maps); dieser Guard schreibt sie nicht neu.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REGISTRY = join(REPO, 'docs/agent-guide/registry/agents.yaml');
const DEFAULT_MODELS = join(REPO, '.opencode/agent-models.jsonc');
const DEFAULT_AGENTS_DIR = join(REPO, '.claude/agents');
const DEFAULT_ROLES = join(REPO, 'scripts/toolset/lib/roles.mjs');

function loadRegistry(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`Registry nicht lesbar: ${path}`);
  }
  const doc = parseYaml(text);
  if (!doc || typeof doc.roles !== 'object' || typeof doc.runtimes !== 'object') {
    throw new Error(`Registry braucht 'roles'- und 'runtimes'-Maps: ${path}`);
  }
  return doc;
}

function stripJsonc(text) {
  // agent-models.jsonc enthält nur //-Kommentare (keine Strings mit // darin
  // außerhalb von URLs — http:// kommt in baseURL-Strings vor, daher vorsichtig:
  // entferne nur Vollzeilen- und Trailing-Kommentare außerhalb von Strings).
  let out = '';
  let inStr = false;
  let strCh = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inStr) {
      out += ch;
      if (ch === '\\') {
        out += text[i + 1] ?? '';
        i += 1;
      } else if (ch === strCh) {
        inStr = false;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = true;
      strCh = ch;
      out += ch;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    out += ch;
  }
  return out;
}

function loadModels(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`Agent-Modelle nicht lesbar: ${path}`);
  }
  const doc = JSON.parse(stripJsonc(text));
  if (!doc || typeof doc.agent !== 'object') {
    throw new Error(`Agent-Modelle brauchen eine 'agent'-Map: ${path}`);
  }
  return doc.agent;
}

function loadRolesModule(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`Rollen-Modul nicht lesbar: ${path}`);
  }
  const roles = [...text.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
  // Nur der ROLES-Block (vor WILDCARD_ROLES) zählt.
  const cut = text.indexOf('WILDCARD_ROLES');
  const head = cut === -1 ? text : text.slice(0, cut);
  return [...head.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
}

function frontmatterModel(dir, role) {
  const path = join(dir, `${role}.md`);
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return { error: `Agent-Datei fehlt: ${role}.md` };
  }
  const match = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return { error: `${role}.md: kein Frontmatter` };
  const name = match[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const model = match[1].match(/^model:\s*(.+)$/m)?.[1]?.trim();
  if (name !== role) return { error: `${role}.md: name '${name}' passt nicht zum Dateinamen` };
  if (!model) return { error: `${role}.md: Frontmatter ohne 'model:'` };
  return { model };
}

function check(registry, agents, agentsDir, rolesMod) {
  const problems = [];
  const { roles, runtimes } = registry;

  for (const [name, rt] of Object.entries(runtimes)) {
    const agent = agents[name];
    if (!agent) {
      problems.push(`runtime '${name}' fehlt in agent-models.jsonc (agent-Sektion)`);
      continue;
    }
    if (agent.model !== rt.model) {
      problems.push(
        `runtime '${name}': Modell-Drift (agents.yaml '${rt.model}' vs agent-models.jsonc '${agent.model}')`,
      );
    }
    if ((agent.mode ?? null) !== (rt.mode ?? null)) {
      problems.push(
        `runtime '${name}': mode-Drift (agents.yaml '${rt.mode}' vs agent-models.jsonc '${agent.mode}')`,
      );
    }
  }
  for (const name of Object.keys(agents)) {
    if (!runtimes[name]) {
      problems.push(`agent-models.jsonc-Agent '${name}' fehlt in agents.yaml (runtimes)`);
    }
  }

  for (const [name, role] of Object.entries(roles)) {
    const fm = frontmatterModel(agentsDir, name);
    if (fm.error) {
      problems.push(`rolle '${name}': ${fm.error}`);
      continue;
    }
    if (role?.claude_code !== fm.model) {
      problems.push(
        `rolle '${name}': Modell-Drift (agents.yaml claude_code '${role?.claude_code}' vs ${name}.md '${fm.model}')`,
      );
    }
  }

  const bpRoles = rolesMod.filter((r) => r.startsWith('bp-'));
  for (const r of bpRoles) {
    if (!roles[r]) problems.push(`roles.mjs-Rolle '${r}' fehlt in agents.yaml (roles)`);
  }
  for (const name of Object.keys(roles)) {
    if (!bpRoles.includes(name)) {
      problems.push(`agents.yaml-Rolle '${name}' fehlt in scripts/toolset/lib/roles.mjs`);
    }
  }

  return problems;
}

function flagValue(argv, flag) {
  const i = argv.indexOf(flag);
  if (i === -1) return null;
  const value = argv[i + 1];
  if (!value) {
    console.error(`agents-check: ${flag} braucht einen Pfad`);
    process.exit(2);
  }
  return value;
}

function main(argv) {
  const registryPath = flagValue(argv, '--registry') ?? DEFAULT_REGISTRY;
  const modelsPath = flagValue(argv, '--models') ?? DEFAULT_MODELS;
  const agentsDir = flagValue(argv, '--agents-dir') ?? DEFAULT_AGENTS_DIR;
  const rolesPath = flagValue(argv, '--roles') ?? DEFAULT_ROLES;

  let registry;
  let agents;
  let rolesMod;
  try {
    registry = loadRegistry(registryPath);
    agents = loadModels(modelsPath);
    rolesMod = loadRolesModule(rolesPath);
  } catch (error) {
    console.error(`agents-check: ${error.message}`);
    return 2;
  }

  const problems = check(registry, agents, agentsDir, rolesMod);
  if (problems.length > 0) {
    console.error(`agents-check: ${problems.length} Verstoß/Verstöße`);
    for (const problem of problems) console.error(`  ✗ ${problem}`);
    return 1;
  }

  const roleCount = Object.keys(registry.roles).length;
  const rtCount = Object.keys(registry.runtimes).length;
  console.log(`agents-check: OK — ${roleCount} Rollen, ${rtCount} Runtimes, alle Quellen synchron`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
