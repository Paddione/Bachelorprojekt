import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { TERRITORY_AREA_IDS } from './map-areas.mjs';

const TAXONOMY_REQUIRED = ['safe', 'caution', 'assisted', 'forbidden'];
const TOOL_KINDS = ['skill', 'agent', 'task'];
const HARNESS_VALUES = ['claude', 'opencode', 'both'];

function load(dir, file) {
  return parse(readFileSync(join(dir, file), 'utf8')) ?? [];
}

// Extract every asset slug seeded in the platform migrations, so components.yaml
// stays in lock-step with the DB. Matches lines like: ('keycloak', 'Keycloak', ...
function migrationSlugs(repoRoot) {
  const dir = join(repoRoot, 'website', 'src', 'db', 'migrations');
  const files = readdirSync(dir).filter((f) => f.includes('platform_assets'));
  const slugs = new Set();
  for (const f of files) {
    const sql = readFileSync(join(dir, f), 'utf8');
    for (const m of sql.matchAll(/^\s*\('([a-z0-9-]+)',/gm)) slugs.add(m[1]);
  }
  return slugs;
}

export function validateRegistry(dir, repoRoot = null) {
  const errors = [];
  const warnings = [];
  const req = (cond, msg) => { if (!cond) errors.push(msg); };

  const taxonomy = load(dir, 'taxonomy.yaml');
  const guardrails = load(dir, 'guardrails.yaml');
  const tools = load(dir, 'tools.yaml');
  const goals = load(dir, 'goals.yaml');
  const components = load(dir, 'components.yaml');

  let themes = [];
  try { themes = load(dir, 'themes.yaml'); } catch { themes = []; }
  const themeIds = new Set((themes ?? []).map((t) => t && t.id));

  const taxIds = new Set(taxonomy.map((t) => t.id));
  const grIds = new Set(guardrails.map((g) => g.id));
  const toolIds = new Set(tools.map((t) => t.id));

  let flow = [];
  try { flow = load(dir, 'flow.yaml'); } catch { flow = []; }
  const flowIds = new Set((flow ?? []).map((f) => f && f.id));

  const goalIdSet = new Set(goals.map((g) => g.id));
  const cardIdSet = new Set([...goalIdSet, ...toolIds]); // valid relates_to / drill targets

  for (const f of flow ?? []) {
    for (const k of ['id', 'label_de', 'emoji', 'danger', 'order', 'blurb_de'])
      req(f?.[k] !== undefined && f?.[k] !== null, `flow[${f?.id}]: missing '${k}'`);
    if (f?.danger) req(taxIds.has(f.danger), `flow[${f?.id}]: danger '${f.danger}' not in taxonomy`);
  }

  for (const id of TAXONOMY_REQUIRED) req(taxIds.has(id), `taxonomy: missing required tier '${id}'`);
  for (const t of taxonomy)
    for (const k of ['id', 'label_de', 'emoji', 'meaning_de', 'doc_treatment', 'enforcement_default'])
      req(t?.[k], `taxonomy[${t?.id}]: missing '${k}'`);

  for (const g of guardrails)
    for (const k of ['id', 'name_de', 'rule_de', 'why_de', 'enforced_by'])
      req(g?.[k], `guardrails[${g?.id}]: missing '${k}'`);

  for (const t of tools) {
    for (const k of ['id', 'name_de', 'kind', 'summary_de', 'what_for_de', 'how_to_start_de',
      'what_could_go_wrong_de', 'danger'])
      req(t?.[k], `tools[${t?.id}]: missing '${k}'`);
    req(TOOL_KINDS.includes(t?.kind), `tools[${t?.id}]: kind '${t?.kind}' not in ${TOOL_KINDS}`);
    req(taxIds.has(t?.danger), `tools[${t?.id}]: danger '${t?.danger}' not in taxonomy`);
    for (const gid of t?.guardrails ?? []) req(grIds.has(gid), `tools[${t?.id}]: guardrail '${gid}' unknown`);
    for (const rid of t?.related ?? []) req(toolIds.has(rid), `tools[${t?.id}]: related '${rid}' unknown`);
    if (t?.harness !== undefined)
      req(HARNESS_VALUES.includes(t.harness), `tools[${t?.id}]: harness '${t.harness}' not in ${HARNESS_VALUES}`);
  }

  for (const g of goals) {
    for (const k of ['id', 'title_de', 'when_de', 'flow', 'example_prompt_de', 'danger'])
      req(g?.[k] !== undefined && g?.[k] !== null, `goals[${g?.id}]: missing '${k}'`);
    req(taxIds.has(g?.danger), `goals[${g?.id}]: danger '${g?.danger}' not in taxonomy`);
    for (const step of g?.flow ?? [])
      req(toolIds.has(step?.tool), `goals[${g?.id}]: flow tool '${step?.tool}' unknown`);
    for (const gid of g?.guardrails ?? []) req(grIds.has(gid), `goals[${g?.id}]: guardrail '${gid}' unknown`);
  }

  // Opt-in checks on the new additive fields (skip silently when absent).
  const checkCardExtras = (card, label) => {
    if (card?.theme && themeIds.size > 0)
      req(themeIds.has(card.theme), `${label}: theme '${card.theme}' not in themes.yaml`);
    if (typeof card?.one_liner_de === 'string')
      req(card.one_liner_de.length <= 80, `${label}: one_liner_de > 80 chars`);
    if (typeof card?.init_prompt_de === 'string')
      req(card.init_prompt_de.length <= 200, `${label}: init_prompt_de > 200 chars`);
    for (const l of card?.links ?? []) {
      if (l && typeof l === 'object')
        req(typeof l.url === 'string' && l.url.length > 0, `${label}: link has empty 'url'`);
    }
    for (const s of card?.stages ?? [])
      req(flowIds.size === 0 || flowIds.has(s), `${label}: stages ref '${s}' not in flow.yaml`);
  };
  for (const t of tools) checkCardExtras(t, `tools[${t?.id}]`);
  for (const g of goals) checkCardExtras(g, `goals[${g?.id}]`);

  for (const c of components) {
    for (const k of ['slug', 'kind', 'name', 'emoji', 'summary_de', 'what_for_de', 'placeholder_en', 'sensitivity'])
      req(c?.[k] !== undefined && c?.[k] !== null, `components[${c?.slug}]: missing '${k}'`);
    req(['software', 'hardware'].includes(c?.kind), `components[${c?.slug}]: bad kind '${c?.kind}'`);
    req((c?.summary_de ?? '').length <= 140, `components[${c?.slug}]: summary_de > 140 chars`);
    req(taxIds.has(c?.sensitivity), `components[${c?.slug}]: sensitivity '${c?.sensitivity}' not in taxonomy`);
    if (c?.area !== undefined && c?.area !== null)
      req(TERRITORY_AREA_IDS.has(c.area), `components[${c?.slug}]: area '${c.area}' not a known territory area`);
    if (c?.theme !== undefined && c?.theme !== null && themeIds.size > 0)
      req(themeIds.has(c.theme), `components[${c?.slug}]: theme '${c.theme}' not in themes.yaml`);
    for (const rid of c?.relates_to ?? [])
      req(cardIdSet.has(rid), `components[${c?.slug}]: relates_to '${rid}' not a known goal/tool id`);
  }

  if (repoRoot) {
    const dbSlugs = migrationSlugs(repoRoot);
    const compSlugs = new Set(components.map((c) => c.slug));
    for (const s of dbSlugs) req(compSlugs.has(s), `components: DB slug '${s}' has no registry entry`);
    for (const s of compSlugs) req(dbSlugs.has(s), `components: registry slug '${s}' not in any migration`);
  }

  if (flowIds.size > 0) {
    const usedStages = new Set();
    for (const card of [...goals, ...tools])
      for (const s of card?.stages ?? []) usedStages.add(s);
    for (const f of flow) if (!usedStages.has(f.id)) warnings.push(`flow station '${f.id}' has no goal/tool (stages)`);
  }

  return { ok: errors.length === 0, errors, warnings };
}

// CLI: validate the real registry (with DB slug cross-check) and exit non-zero on failure.
if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = process.cwd();
  const res = validateRegistry(join(repoRoot, 'docs', 'agent-guide', 'registry'), repoRoot);
  for (const w of res.warnings ?? []) console.warn('⚠', w);
  if (!res.ok) { for (const e of res.errors) console.error('✗', e); process.exit(1); }
  console.log('✓ agent-guide registry valid');
}
