// scripts/toolset/collect.mjs
//
// Erhebt alle Werkzeug-Instanzen aller Kinds aus den Harness-Configs und dem Repo und
// gleicht sie gegen docs/agent-guide/registry/capabilities.yaml ab. Instanzen, die dort
// fehlen, tragen `curation: "unreviewed"` — die im SSOT-Spec geforderte Quarantäne.
//
// Aufrufe:
//   node scripts/toolset/collect.mjs               → alle Instanzen als JSON
//   node scripts/toolset/collect.mjs --unreviewed  → nur die unkuratierten
//
// Die Erhebung ist bewusst fehlertolerant: fällt eine der neuen Quellen aus (fehlende
// tools.yaml, unlesbares SKILL.md), wird gewarnt und die Quelle übersprungen. Ein
// Teilausfall darf die übrigen Kinds nicht mitreißen, sonst ist im Fehlerfall gar keine
// Kuration mehr möglich. Für die MCP-Configs gilt weiterhin das strengere Bestandsverhalten
// (Exit 1) — sie sind die Pflichtquelle.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import yaml from 'js-yaml';
import { readClaudeCodeConfig, readOpencodeConfig, readAgyConfig } from './lib/harness.mjs';
import { loadRegistry } from './lib/registry.mjs';

export function collectInstances({ baseDir, homeDir }) {
  const instances = [];

  // --- mcp: aus den drei Harness-Configs (Pflichtquelle, Bestandsverhalten) ------------
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

  // --- plugin: aus enabledPlugins in .claude/settings.json -----------------------------
  // Der Marketplace-Suffix bleibt Teil der Id: `superpowers@claude-plugins-official` und ein
  // gleichnamiges Plugin aus einem anderen Marketplace sind verschiedene Instanzen.
  if (claude.settings && claude.settings.enabledPlugins) {
    for (const [pluginKey, enabled] of Object.entries(claude.settings.enabledPlugins)) {
      instances.push({
        harness: 'claude_code',
        instance: `plugin:${pluginKey}`,
        active: enabled === true,
        source: claude.settingsPath
      });
    }
  }

  // --- skill: aus dem name-Frontmatter von .claude/skills/*/SKILL.md -------------------
  const skillsDir = path.join(baseDir, '.claude', 'skills');
  if (fs.existsSync(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      // Nur Verzeichnisse: OVERVIEW.md ist kein Skill, `references/` hält Referenzmaterial
      // ohne SKILL.md und ist deshalb kein Fehlerfall.
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;

      let skillName = null;
      try {
        const content = fs.readFileSync(skillFile, 'utf8');
        const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (fm) {
          const nameLine = fm[1].match(/^name:\s*(.+?)\s*$/m);
          if (nameLine) skillName = nameLine[1].replace(/^['"]|['"]$/g, '');
        }
      } catch (err) {
        console.error(`WARN: could not read ${skillFile}: ${err.message}`);
      }

      if (!skillName) {
        // Ein SKILL.md ohne `name:` ist ein echter Defekt — sichtbar melden, nicht still
        // auf den Verzeichnisnamen zurückfallen.
        console.error(`WARN: ${skillFile} has no 'name:' frontmatter — falling back to directory name '${entry.name}'`);
        skillName = entry.name;
      }

      instances.push({
        harness: 'claude_code',
        instance: `skill:${skillName}`,
        active: true,
        source: skillFile
      });
    }
  }

  // --- cli: und agent: aus docs/agent-guide/registry/tools.yaml ------------------------
  const toolsPath = path.join(baseDir, 'docs', 'agent-guide', 'registry', 'tools.yaml');
  if (fs.existsSync(toolsPath)) {
    try {
      const tools = yaml.load(fs.readFileSync(toolsPath, 'utf8'));
      if (Array.isArray(tools)) {
        for (const tool of tools) {
          if (!tool || !tool.id) continue;
          if (tool.kind !== 'cli' && tool.kind !== 'agent') continue;
          instances.push({
            harness: tool.harness || 'both',
            instance: `${tool.kind}:${tool.id}`,
            active: true,
            source: toolsPath
          });
        }
      }
    } catch (err) {
      console.error(`WARN: could not parse ${toolsPath}: ${err.message}`);
    }
  } else {
    console.error(`WARN: ${toolsPath} not found — cli:/agent: instances not collected`);
  }

  // --- Kurations-Abgleich gegen capabilities.yaml --------------------------------------
  const registryPath = process.env.TOOLSET_REGISTRY
    || path.join(baseDir, 'docs', 'agent-guide', 'registry', 'capabilities.yaml');
  const stateByInstance = new Map();
  try {
    const registry = loadRegistry(registryPath);
    for (const inst of Object.values(registry.capabilities)) {
      for (const [instKey, instCfg] of Object.entries(inst)) {
        stateByInstance.set(instKey, instCfg.state);
      }
    }
  } catch (err) {
    console.error(`WARN: could not load registry ${registryPath}: ${err.message}`);
  }

  for (const inst of instances) {
    inst.curation = stateByInstance.get(inst.instance) || 'unreviewed';
  }

  return instances;
}

// `cli:` fehlt in tools.yaml als eigenständiger Eintragstyp nicht — aber die Registry führt
// cli-Instanzen, die dort (noch) nicht stehen. Damit der Abgleich sie nicht verliert, werden
// alle in capabilities.yaml gelisteten cli:/agent:-Instanzen ergänzt, die die Quellen oben
// nicht gefunden haben. Sie sind per Definition kuriert und nie `unreviewed`.
export function withRegistryOnlyInstances(instances, { baseDir }) {
  const seen = new Set(instances.map(i => i.instance));
  const registryPath = process.env.TOOLSET_REGISTRY
    || path.join(baseDir, 'docs', 'agent-guide', 'registry', 'capabilities.yaml');
  try {
    const registry = loadRegistry(registryPath);
    for (const inst of Object.values(registry.capabilities)) {
      for (const [instKey, instCfg] of Object.entries(inst)) {
        if (seen.has(instKey)) continue;
        if (!instKey.startsWith('cli:') && !instKey.startsWith('agent:')) continue;
        instances.push({
          harness: 'both',
          instance: instKey,
          active: instCfg.state !== 'suppressed',
          source: registryPath,
          curation: instCfg.state
        });
        seen.add(instKey);
      }
    }
  } catch {
    // Registry-Fehler wurden bereits in collectInstances gemeldet.
  }
  return instances;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const baseDir = process.env.TOOLSET_OUT_DIR || process.cwd();
  const homeDir = process.env.HOME || os.homedir();

  let instances;
  try {
    instances = collectInstances({ baseDir, homeDir });
    withRegistryOnlyInstances(instances, { baseDir });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const onlyUnreviewed = process.argv.includes('--unreviewed');
  const out = onlyUnreviewed ? instances.filter(i => i.curation === 'unreviewed') : instances;
  console.log(JSON.stringify(out, null, 2));
}
