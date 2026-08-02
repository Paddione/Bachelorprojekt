// scripts/toolset/sync.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadRegistry } from './lib/registry.mjs';

const registryPath = process.env.TOOLSET_REGISTRY || path.join(process.cwd(), 'docs', 'agent-guide', 'registry', 'capabilities.yaml');
const outDir = process.env.TOOLSET_OUT_DIR || process.cwd();

const registry = loadRegistry(registryPath);

// Gather suppressed MCP servers
const suppressedMcpServers = new Set();
for (const [capName, instances] of Object.entries(registry.capabilities)) {
  for (const [instKey, instCfg] of Object.entries(instances)) {
    if (instKey.startsWith('mcp:') && instCfg.state === 'suppressed') {
      suppressedMcpServers.add(instKey.slice(4));
    }
  }
}

// 1. Surgical update of .claude/settings.json
const claudeSettingsPath = path.join(outDir, '.claude', 'settings.json');
if (fs.existsSync(claudeSettingsPath)) {
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf8'));
  } catch (e) {
    console.error(`Failed to read ${claudeSettingsPath}: ${e.message}`);
    process.exit(1);
  }

  settings.disabledMcpjsonServers = Array.from(suppressedMcpServers).sort();

  const tmpPath = `${claudeSettingsPath}.tmp.${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(settings, null, 2) + '\n');
  fs.renameSync(tmpPath, claudeSettingsPath);
  console.log(`Updated ${claudeSettingsPath}`);
}

// 2. Surgical update of .opencode/opencode.jsonc
const opencodeConfigPath = path.join(outDir, '.opencode', 'opencode.jsonc');
if (fs.existsSync(opencodeConfigPath)) {
  let content = fs.readFileSync(opencodeConfigPath, 'utf8');
  // For opencode, we update the "enabled" field of mcpServers if they exist
  try {
    const stripped = content.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
    const config = JSON.parse(stripped);
    if (config.mcpServers) {
      for (const serverName of Object.keys(config.mcpServers)) {
        const isSuppressed = suppressedMcpServers.has(serverName);
        config.mcpServers[serverName].enabled = !isSuppressed;
      }
      const tmpPath = `${opencodeConfigPath}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2) + '\n');
      fs.renameSync(tmpPath, opencodeConfigPath);
      console.log(`Updated ${opencodeConfigPath}`);
    }
  } catch (e) {
    console.error(`Failed to update ${opencodeConfigPath}: ${e.message}`);
    process.exit(1);
  }
}
