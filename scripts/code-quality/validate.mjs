// scripts/code-quality/validate.mjs
// Fail-closed validation of subsystems.yaml + gates.yaml.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSubsystems, loadGates } from './load.mjs';
import { trackedFiles } from './scan.mjs';
import { matchGlob } from './glob.mjs';

export const ROUTING_AGENTS = new Set([
  'bachelorprojekt-website',
  'bachelorprojekt-infra',
  'bachelorprojekt-test',
  'bachelorprojekt-db',
  'bachelorprojekt-ops',
  'bachelorprojekt-security',
]);

/** Validate the registry+gates at cfgDir against the tracked tree at repoRoot. */
export function validateRegistry(cfgDir, repoRoot) {
  const errors = [];
  const req = (cond, msg) => { if (!cond) errors.push(msg); };

  const subs = loadSubsystems(cfgDir);
  const gates = loadGates(cfgDir);
  const tracked = trackedFiles(repoRoot);

  req(subs.length > 0, 'subsystems.yaml is empty');

  const seenGlobs = new Map(); // glob string -> first owner id
  for (const s of subs) {
    for (const k of ['id', 'name', 'owner_agent', 'test_location', 'purpose'])
      req(s?.[k], `subsystem[${s?.id}]: missing '${k}'`);
    req(Array.isArray(s?.paths) && s.paths.length > 0,
      `subsystem[${s?.id}]: 'paths' must be a non-empty array`);
    req(ROUTING_AGENTS.has(s?.owner_agent),
      `subsystem[${s?.id}]: owner_agent '${s?.owner_agent}' not one of the six routing agents`);
    for (const g of s?.paths ?? []) {
      if (seenGlobs.has(g))
        errors.push(`subsystem[${s?.id}]: duplicate path glob '${g}' (also in '${seenGlobs.get(g)}')`);
      else seenGlobs.set(g, s?.id);
      req(tracked.some((f) => matchGlob(f, g)),
        `subsystem[${s?.id}]: path glob '${g}' matches no tracked file`);
    }
  }

  // gates.yaml shape — fail closed on every key consumed downstream so a
  // malformed config cannot pass validate and misbehave in a later gate.
  req(Array.isArray(gates?.scan?.code_roots) && gates.scan.code_roots.length > 0,
    'gates.yaml: scan.code_roots must be a non-empty array');
  req(Array.isArray(gates?.scan?.ignore_globs),
    'gates.yaml: scan.ignore_globs must be an array');
  req(gates?.s1?.limits && typeof gates.s1.limits === 'object',
    'gates.yaml: s1.limits must be an object');
  // S1: every limit value must be a number (Task 7 compares lines > limit).
  if (gates?.s1?.limits && typeof gates.s1.limits === 'object') {
    for (const [ext, lim] of Object.entries(gates.s1.limits))
      req(typeof lim === 'number',
        `gates.yaml: s1.limits['${ext}'] must be a number`);
  }
  req(Array.isArray(gates?.s2?.graphs) && gates.s2.graphs.length > 0,
    'gates.yaml: s2.graphs must be a non-empty array');
  // S2: every graph entry must carry a string id and a string tsconfig (Task 8).
  for (const g of gates?.s2?.graphs ?? []) {
    req(typeof g?.id === 'string' && g.id.length > 0,
      `gates.yaml: s2.graphs entry missing string 'id' (got ${JSON.stringify(g?.id)})`);
    req(typeof g?.tsconfig === 'string' && g.tsconfig.length > 0,
      `gates.yaml: s2.graphs[${g?.id}] missing string 'tsconfig'`);
  }
  req(Array.isArray(gates?.s3?.scope_dirs) && gates.s3.scope_dirs.length > 0,
    'gates.yaml: s3.scope_dirs must be a non-empty array');
  req(Array.isArray(gates?.s3?.allowlist_files),
    'gates.yaml: s3.allowlist_files must be an array');
  req(Array.isArray(gates?.s4?.manifest_globs),
    'gates.yaml: s4.manifest_globs must be an array');
  req(Array.isArray(gates?.s4?.script_globs),
    'gates.yaml: s4.script_globs must be an array');
  req(Array.isArray(gates?.s4?.reference_sources) && gates.s4.reference_sources.length > 0,
    'gates.yaml: s4.reference_sources must be a non-empty array');
  req(Array.isArray(gates?.s4?.allowlist_globs),
    'gates.yaml: s4.allowlist_globs must be an array');

  req(Array.isArray(gates?.s5?.rules),
    'gates.yaml: s5.rules must be an array');
  if (Array.isArray(gates?.s5?.rules)) {
    for (const [idx, r] of gates.s5.rules.entries()) {
      req(r && typeof r === 'object',
        `gates.yaml: s5.rules[${idx}] must be an object`);
      req(typeof r?.path === 'string',
        `gates.yaml: s5.rules[${idx}].path must be a string`);
      req(Array.isArray(r?.allowed) && r.allowed.every((x) => typeof x === 'string'),
        `gates.yaml: s5.rules[${idx}].allowed must be an array of strings`);
      req(Array.isArray(r?.forbidden) && r.forbidden.every((x) => typeof x === 'string'),
        `gates.yaml: s5.rules[${idx}].forbidden must be an array of strings`);
    }
  }

  return { ok: errors.length === 0, errors };
}

// CLI: validate the real registry, exit non-zero on failure.
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const repoRoot = join(dirname(__filename), '..', '..');
  const cfgDir = join(repoRoot, 'docs', 'code-quality');
  const res = validateRegistry(cfgDir, repoRoot);
  if (!res.ok) { for (const e of res.errors) console.error('✗', e); process.exit(1); }
  console.log('✓ code-quality registry valid');
}
