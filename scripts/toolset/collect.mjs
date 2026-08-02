// scripts/toolset/collect.mjs
import path from 'node:path';
import os from 'node:os';
import { readClaudeCodeConfig, readOpencodeConfig, readAgyConfig } from './lib/harness.mjs';

const baseDir = process.env.TOOLSET_OUT_DIR || process.cwd();
const homeDir = process.env.HOME || os.homedir();

const instances = [];

// Collect Claude Code instances
try {
  const claude = readClaudeCodeConfig(baseDir);
  if (claude.mcp && claude.mcp.mcpServers) {
    const disabled = new Set(claude.settings.disabledMcpjsonServers || []);
    for (const serverName of Object.keys(claude.mcp.mcpServers)) {
      instances.push({
        harness: 'claude_code',
        instance: `mcp:${serverName}`,
        active: !disabled.has(serverName),
        source: claude.mcpPath
      });
    }
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// Collect opencode instances
try {
  const opencode = readOpencodeConfig(baseDir);
  if (opencode.config && opencode.config.mcpServers) {
    for (const [serverName, serverCfg] of Object.entries(opencode.config.mcpServers)) {
      instances.push({
        harness: 'opencode',
        instance: `mcp:${serverName}`,
        active: serverCfg.enabled !== false,
        source: opencode.configPath
      });
    }
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// Collect agy instances
try {
  const agy = readAgyConfig(homeDir);
  if (agy.mcpConfig && agy.mcpConfig.mcpServers) {
    for (const serverName of Object.keys(agy.mcpConfig.mcpServers)) {
      instances.push({
        harness: 'agy',
        instance: `mcp:${serverName}`,
        active: true,
        source: agy.mcpConfigPath
      });
    }
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

console.log(JSON.stringify(instances, null, 2));
