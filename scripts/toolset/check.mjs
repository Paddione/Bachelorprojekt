// scripts/toolset/check.mjs
import fs from 'node:fs';
import path from 'node:path';
import { loadRegistry } from './lib/registry.mjs';
import { readClaudeCodeConfig, readOpencodeConfig } from './lib/harness.mjs';

const registryPath = process.env.TOOLSET_REGISTRY || path.join(process.cwd(), 'docs', 'agent-guide', 'registry', 'capabilities.yaml');
const outDir = process.env.TOOLSET_OUT_DIR || process.cwd();

let registry;
try {
  registry = loadRegistry(registryPath);
} catch (e) {
  console.error(`Registry error: ${e.message}`);
  process.exit(1);
}

let hasError = false;

// 1. Check capability invariants
for (const [capName, instances] of Object.entries(registry.capabilities)) {
  const instEntries = Object.entries(instances);
  const canonicals = instEntries.filter(([_, cfg]) => cfg.state === 'canonical');
  const activeCount = instEntries.filter(([_, cfg]) => cfg.state !== 'suppressed').length;

  if (canonicals.length > 1) {
    console.error(`Capability '${capName}' has ${canonicals.length} canonical instances (max 1 allowed).`);
    hasError = true;
  }

  if (instEntries.length >= 2 && canonicals.length === 0) {
    console.error(`Capability '${capName}' has ${instEntries.length} instances but no canonical instance.`);
    hasError = true;
  }
}

// 2. Check suppressed mcp servers against Claude Code settings.json
const suppressedMcp = new Set();
for (const [capName, instances] of Object.entries(registry.capabilities)) {
  for (const [instKey, instCfg] of Object.entries(instances)) {
    if (instKey.startsWith('mcp:') && instCfg.state === 'suppressed') {
      suppressedMcp.add(instKey.slice(4));
    }
  }
}

const claude = readClaudeCodeConfig(outDir);
if (fs.existsSync(claude.settingsPath)) {
  const disabledInSettings = new Set(claude.settings.disabledMcpjsonServers || []);
  for (const serverName of suppressedMcp) {
    if (!disabledInSettings.has(serverName)) {
      console.error(`Drift detected in ${claude.settingsPath}: disabledMcpjsonServers is missing '${serverName}'`);
      hasError = true;
    }
  }
} else {
  console.log(`SKIP: Claude Code settings file missing at ${claude.settingsPath}`);
}

if (hasError) {
  process.exit(1);
} else {
  console.log('Toolset registry check passed.');
}
