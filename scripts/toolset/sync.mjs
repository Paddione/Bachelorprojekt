// scripts/toolset/sync.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { loadRegistry } from './lib/registry.mjs';
import { validateHarnesses, resolveToolset } from './lib/resolve.mjs';
import { ADAPTERS } from './lib/adapters/index.mjs';
import { readClaudeCodeConfig } from './lib/harness.mjs';
import { ROLES } from './lib/roles.mjs';

const registryPath = process.env.TOOLSET_REGISTRY || path.join(process.cwd(), 'docs', 'agent-guide', 'registry', 'capabilities.yaml');
const outDir = process.env.TOOLSET_OUT_DIR || process.cwd();

// Rollen-Vokabular für validateHarnesses — SSOT lib/roles.mjs (T900980).
const VALID_ROLES = new Set(ROLES);

const args = process.argv.slice(2);
let dryRun = false;
let onlyHarness = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dry-run') {
    dryRun = true;
  } else if (args[i] === '--harness') {
    onlyHarness = args[++i];
  }
}
if (onlyHarness && !ADAPTERS[onlyHarness]) {
  console.error(`Unknown harness '${onlyHarness}' (known: ${Object.keys(ADAPTERS).join(', ')})`);
  process.exit(1);
}

const registry = loadRegistry(registryPath);

const harnessErrors = validateHarnesses(registry.harnesses, registry.forbiddenProviders, VALID_ROLES);
if (harnessErrors.length > 0) {
  for (const msg of harnessErrors) console.error(msg);
  process.exit(1);
}

// mcp-Namen der Registry, aufgeteilt nach suppressed / Rest.
const registryMcp = new Set();
const suppressedMcp = new Set();
for (const instances of Object.values(registry.capabilities)) {
  for (const [instKey, instCfg] of Object.entries(instances)) {
    if (!instKey.startsWith('mcp:')) continue;
    registryMcp.add(instKey.slice(4));
    if (instCfg.state === 'suppressed') suppressedMcp.add(instKey.slice(4));
  }
}

// Legacy-Fallback für Registries ohne harnesses-Eintrag (Fixture-Kompatibilität):
// Werkzeugsatz = alle nicht-suppressed Instanzen, d.h. nur suppressed wird deaktiviert.
const legacyToolset = new Set();
for (const instances of Object.values(registry.capabilities)) {
  for (const [instKey, instCfg] of Object.entries(instances)) {
    if (instCfg.state !== 'suppressed') legacyToolset.add(instKey);
  }
}

const claudeCfg = readClaudeCodeConfig(outDir);
const projectMcp = new Set(Object.keys(claudeCfg.mcp.mcpServers ?? {}));

function unifiedDiff(before, after, filePath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolset-dry-run-'));
  const a = path.join(dir, 'a');
  const b = path.join(dir, 'b');
  fs.writeFileSync(a, before);
  fs.writeFileSync(b, after);
  const res = spawnSync('diff', ['-u', '--label', `a/${filePath}`, '--label', `b/${filePath}`, a, b], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return res.stdout;
}

// 1+2. Adapter-Dispatcher (T900791): ersetzt Block (1) claude-suppressed und Block (2)
// opencode-mcpServers. Jede Harness mit Adapter rendert ihr Konfigurationsziel im Speicher.
for (const [name, adapter] of Object.entries(ADAPTERS)) {
  if (onlyHarness && name !== onlyHarness) continue;
  const harness = registry.harnesses?.[name];
  if (harness && harness.config === null) continue;
  const targetPath = path.join(outDir, adapter.file);
  if (!fs.existsSync(targetPath)) {
    console.log(`SKIP ${name}: ${adapter.file} missing`);
    continue;
  }
  const toolset = harness ? resolveToolset(registry.capabilities, harness) : legacyToolset;
  const ctx = name === 'claude'
    ? { toolset, registryMcp, suppressedMcp, projectMcp }
    : { toolset, registryMcp };
  const current = fs.readFileSync(targetPath, 'utf8');
  const rendered = adapter.render(current, ctx);
  if (rendered === current) continue;
  if (dryRun) {
    console.log(`DRIFT ${name} ${adapter.file}`);
    process.stdout.write(unifiedDiff(current, rendered, adapter.file));
    continue;
  }
  const tmpPath = `${targetPath}.tmp.${Date.now()}`;
  fs.writeFileSync(tmpPath, rendered);
  fs.renameSync(tmpPath, targetPath);
  console.log(`Updated ${targetPath}`);
}

// 3. Sync plugin: curation decisions → registry/settings.json
//    T014551: The sync was missing plugin: decisions — only mcp: was handled.
//    Every harness that reads the capabilities registry should also see
//    the curated plugin state so it can enforce the decision (enable/disable).
const pluginInstances = {};
for (const [capName, instances] of Object.entries(registry.capabilities)) {
  for (const [instKey, instCfg] of Object.entries(instances)) {
    if (instKey.startsWith('plugin:')) {
      pluginInstances[instKey] = {
        state: instCfg.state,
        reason: instCfg.reason || null,
        // Preserve any extra fields from the registry (description, version, etc.)
        ...Object.fromEntries(
          Object.entries(instCfg).filter(([k]) => !['state', 'reason'].includes(k))
        ),
      };
    }
  }
}

// Im Dry-Run schreibt Block (3) nichts und meldet nichts: registry/settings.json ist ein
// generiertes, unversioniertes Artefakt, kein verwaltetes Harness-Konfigurationsziel —
// die Dry-Run-Vorschau deckt die Adapter-Ziele ab.
if (Object.keys(pluginInstances).length > 0 && !dryRun) {
  const settingsDir = path.join(outDir, 'registry');
  const settingsPath = path.join(settingsDir, 'settings.json');
  fs.mkdirSync(settingsDir, { recursive: true });
  const settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch { /* fresh file */ }

  settings.plugins = pluginInstances;

  const tmpPath = `${settingsPath}.tmp.${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(settings, null, 2) + '\n');
  fs.renameSync(tmpPath, settingsPath);
  console.log(`Updated ${settingsPath} (${Object.keys(pluginInstances).length} plugin decisions)`);
}
