// scripts/toolset/lib/harness.mjs
import fs from 'node:fs';
import path from 'node:path';

export const HARNESSES = ['claude_code', 'opencode', 'agy', 'llamacpp', 'factory'];

export function readClaudeCodeConfig(baseDir) {
  const settingsPath = path.join(baseDir, '.claude', 'settings.json');
  const mcpPath = path.join(baseDir, '.mcp.json');

  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {
      throw new Error(`Failed to parse ${settingsPath}: ${e.message}`);
    }
  }

  let mcp = {};
  if (fs.existsSync(mcpPath)) {
    try {
      mcp = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    } catch (e) {
      throw new Error(`Failed to parse ${mcpPath}: ${e.message}`);
    }
  }

  return { settingsPath, mcpPath, settings, mcp };
}

export function readOpencodeConfig(baseDir) {
  const configPath = path.join(baseDir, '.opencode', 'opencode.jsonc');
  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      const stripped = content.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
      config = JSON.parse(stripped);
    } catch (e) {
      throw new Error(`Failed to parse ${configPath}: ${e.message}`);
    }
  }
  return { configPath, config };
}

export function readAgyConfig(homeDir) {
  const mcpConfigPath = path.join(homeDir, '.gemini', 'config', 'mcp_config.json');
  const settingsPath = path.join(homeDir, '.gemini', 'settings.json');

  let mcpConfig = null;
  if (fs.existsSync(mcpConfigPath)) {
    try {
      mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
    } catch (e) {
      throw new Error(`Failed to parse ${mcpConfigPath}: ${e.message}`);
    }
  }

  let settings = null;
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {
      throw new Error(`Failed to parse ${settingsPath}: ${e.message}`);
    }
  }

  return { mcpConfigPath, settingsPath, mcpConfig, settings };
}
