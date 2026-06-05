// scripts/code-quality/emit-index.mjs
// Scans the scan-universe, enforces C4 (every file owned by exactly one
// subsystem), and writes a byte-deterministic repo-index.json (NO timestamp).
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSubsystems, loadGates } from './load.mjs';
import { scanUniverse, ownerOf } from './scan.mjs';

/**
 * Build the index object. Throws on the first orphan (file under the
 * scan-universe with no owning subsystem) — that is the C4 enforcement.
 */
export function buildIndex(repoRoot, subsystems, gates) {
  const files = scanUniverse(repoRoot, gates);
  const buckets = new Map(subsystems.map((s) => [s.id, []]));
  for (const f of files) {
    const owner = ownerOf(f, subsystems);
    if (!owner) throw new Error(`C4 orphan: '${f}' is owned by no subsystem`);
    buckets.get(owner.id).push(f);
  }
  return {
    generated_by: 'scripts/code-quality/emit-index.mjs',
    subsystems: subsystems.map((s) => ({
      id: s.id,
      name: s.name,
      owner_agent: s.owner_agent,
      file_count: buckets.get(s.id).length,
      files: buckets.get(s.id).slice().sort(),
    })),
  };
}

/** Serialize deterministically (2-space, trailing newline) and write to outPath. */
export function writeIndex(outPath, index) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(index, null, 2) + '\n', 'utf8');
}

// CLI: validate-first, then emit to docs/code-quality/repo-index.json.
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const repoRoot = join(dirname(__filename), '..', '..');
  const cfgDir = join(repoRoot, 'docs', 'code-quality');
  const { validateRegistry } = await import('./validate.mjs');
  const v = validateRegistry(cfgDir, repoRoot);
  if (!v.ok) { for (const e of v.errors) console.error('✗', e); process.exit(1); }
  try {
    const index = buildIndex(repoRoot, loadSubsystems(cfgDir), loadGates(cfgDir));
    writeIndex(join(cfgDir, 'repo-index.json'), index);
    console.log(`✓ wrote docs/code-quality/repo-index.json (${index.subsystems.reduce((n, s) => n + s.file_count, 0)} files)`);
  } catch (err) {
    console.error('✗', err.message);
    process.exit(1);
  }
}
