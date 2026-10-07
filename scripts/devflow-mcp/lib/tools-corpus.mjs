// scripts/devflow-mcp/lib/tools-corpus.mjs — Werkzeug-Empfehlung per Rerank (T900985, design.md D5).
//
// Dokumente: ein Eintrag je MCP-Tool (Lock-summary + use_when der Instanz), ein Eintrag je
// Nicht-MCP-Instanz (skill:, cli:, plugin:, MCP ohne Lock-Eintrag). Gefiltert wie
// toolset-context.sh: Rolle, Instanz nicht suppressed, Tool nicht in tools_suppressed, Tier ≤ max_tier.
import fs from 'node:fs';
import * as yamlPkg from 'js-yaml';
import { resolveRole, WILDCARD_ROLES } from '../../toolset/lib/roles.mjs';
import { defaultLockPath, loadLock, toolsForInstance, tierRank, VALID_TIERS } from '../../toolset/lib/tools.mjs';
import { rerankItems } from './retrieve.mjs';
const yaml = yamlPkg.default ?? yamlPkg;

export function resolveRoleOrThrow(role) {
  const r = resolveRole(role);
  if (!r) throw new Error(`unbekannte Rolle "${role}" — gültig: bp-build, bp-run, bp-ship, orchestrator, big-pickle, omp`);
  return r.role;
}

export function buildToolDocs({ registryPath, role, maxTier = 'assisted' }) {
  if (!VALID_TIERS.includes(maxTier)) throw new Error(`max_tier "${maxTier}" ungültig — gültig: ${VALID_TIERS.join(', ')}`);
  const data = yaml.load(fs.readFileSync(registryPath, 'utf8')) || {};
  const lock = loadLock(defaultLockPath(registryPath));
  const docs = [];
  for (const [capability, instances] of Object.entries(data.capabilities ?? {})) {
    for (const [instKey, cfg] of Object.entries(instances ?? {})) {
      if (!cfg || cfg.state === 'suppressed' || !Array.isArray(cfg.roles)) continue;
      const covered = cfg.roles.includes(role) || (cfg.roles.includes('all') && WILDCARD_ROLES.includes(role));
      if (!covered) continue;
      const context = [cfg.use_when, cfg.avoid_when ? `Nicht: ${cfg.avoid_when}` : null].filter(Boolean).join(' ');
      const tools = toolsForInstance(instKey, cfg, lock);
      if (tools.length > 0) {
        const server = instKey.slice(4);
        for (const t of tools) {
          if (tierRank(t.tier) > tierRank(maxTier)) continue;
          docs.push({ capability, server, tool: t.name, tier: t.tier, text: `${server} ${t.name}: ${t.summary ?? ''} ${context}`.trim() });
        }
      } else {
        const tier = cfg.tier ?? 'safe';
        if (tierRank(tier) > tierRank(maxTier)) continue;
        docs.push({ capability, server: instKey, tool: null, tier, text: `${instKey}: ${context}` });
      }
    }
  }
  return docs;
}

export async function recommendTools({ bge, registryPath, task, role, k = 6, maxTier = 'assisted' }) {
  const r = resolveRoleOrThrow(role);
  const docs = buildToolDocs({ registryPath, role: r, maxTier });
  const { items, degraded } = await rerankItems(bge, task, docs, d => d.text, k, 'lexical');
  return {
    role: r,
    tools: items.map(d => ({ capability: d.capability, server: d.server, tool: d.tool, tier: d.tier, score: d.rerank_score ?? null, why: d.text.slice(0, 200) })),
    degraded,
  };
}
