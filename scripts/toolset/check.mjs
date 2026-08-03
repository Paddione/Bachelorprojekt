// scripts/toolset/check.mjs
//
// Fail-closed, offline laufender Gate über die Toolset-Registry. Prüft die Bestandsregeln
// (max. 1 canonical je Capability, reason bei non-canonical, Drift gegen die Harness-Configs)
// sowie seit T002592 das Schema der Nutzungssemantik: eine `canonical`-Instanz ohne `use_when`
// oder `roles` kann nicht in einen Agent-Prompt gerendert werden, die Registry behauptete dann
// eine Kuration, die nicht stattgefunden hat.
//
// Bewusst NICHT fail-closed: der unreviewed-Report. Der SSOT-Spec verlangt Quarantäne ohne
// CI-Bruch — ein neu installiertes Plugin darf CI nicht rot machen, sonst wird die Quarantäne
// zur Blockade und in der Praxis umgangen.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadRegistry } from './lib/registry.mjs';
import { readClaudeCodeConfig } from './lib/harness.mjs';
import { collectInstances, withRegistryOnlyInstances } from './collect.mjs';

const registryPath = process.env.TOOLSET_REGISTRY || path.join(process.cwd(), 'docs', 'agent-guide', 'registry', 'capabilities.yaml');
const outDir = process.env.TOOLSET_OUT_DIR || process.cwd();

// Abschließendes Rollen-Vokabular. Bewusst hier dupliziert statt aus der `case`-Konstruktion
// in scripts/plan-context.sh geparst: Bash-Parsen wäre brüchig, und die beiden Listen
// unterscheiden sich um die Wildcard `all`. SSOT der Doppelung ist CONTRACT.md §2 des
// Change toolset-usage-injection.
const VALID_ROLES = new Set([
  'bachelorprojekt-website',
  'bachelorprojekt-ops',
  'bachelorprojekt-infra',
  'bachelorprojekt-test',
  'bachelorprojekt-db',
  'bachelorprojekt-security',
  'orchestrator',
  'all',
]);

const VALID_TIERS = new Set(['safe', 'caution', 'assisted', 'dangerous']);

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


  if (canonicals.length > 1) {
    console.error(`Capability '${capName}' has ${canonicals.length} canonical instances (max 1 allowed).`);
    hasError = true;
  }

  if (instEntries.length >= 2 && canonicals.length === 0) {
    console.error(`Capability '${capName}' has ${instEntries.length} instances but no canonical instance.`);
    hasError = true;
  }

  // 1b. Schema der Nutzungssemantik (T002592).
  for (const [instKey, cfg] of instEntries) {
    // `suppressed` ist ausgenommen: eine unterdrückte Instanz wird nie injiziert, also kann
    // sie keine Nutzungssemantik brauchen. Sie hier mitzuprüfen hieße, die Registry mit
    // Pflichtfeldern für Werkzeuge zu belasten, die niemand benutzen darf.
    if (cfg.state === 'canonical') {
      if (typeof cfg.use_when !== 'string' || cfg.use_when.trim() === '') {
        console.error(`Capability '${capName}' instance '${instKey}' is canonical but has no 'use_when'.`);
        hasError = true;
      }
      if (!Array.isArray(cfg.roles) || cfg.roles.length === 0) {
        console.error(`Capability '${capName}' instance '${instKey}' is canonical but has no non-empty 'roles' list.`);
        hasError = true;
      }
    }

    if (Array.isArray(cfg.roles)) {
      for (const role of cfg.roles) {
        if (!VALID_ROLES.has(role)) {
          console.error(`Capability '${capName}' instance '${instKey}': unknown role '${role}' (valid: ${[...VALID_ROLES].join(', ')}).`);
          hasError = true;
        }
      }
    }

    if (cfg.tier !== undefined && cfg.tier !== null && !VALID_TIERS.has(cfg.tier)) {
      console.error(`Capability '${capName}' instance '${instKey}': invalid tier '${cfg.tier}' (valid: ${[...VALID_TIERS].join(', ')}).`);
      hasError = true;
    }
  }
}

// 2. Check suppressed mcp servers against Claude Code settings.json
const suppressedMcp = new Set();
for (const [, instances] of Object.entries(registry.capabilities)) {
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

// 2b. Plugin-Durchsetzungslücke sichtbar machen (advisory, T002592).
//
// `sync.mjs` setzt `suppressed` nur für `mcp:` durch (Enforceability-Klasse `full`). Für
// `plugin:` ist die Klasse `partial` und der Sync nicht implementiert. Eine Registry-Entscheidung
// ohne Durchsetzung ist damit zulässig — sie stillschweigend zu lassen wäre der Fehler, weil die
// Karte dann eine Kuration behauptet, die im Harness nicht wirkt. Deshalb: melden, nicht failen.
if (fs.existsSync(claude.settingsPath)) {
  const enabledPlugins = claude.settings.enabledPlugins || {};
  const divergent = [];
  for (const instances of Object.values(registry.capabilities)) {
    for (const [instKey, cfg] of Object.entries(instances)) {
      if (!instKey.startsWith('plugin:')) continue;
      const pluginKey = instKey.slice('plugin:'.length);
      if (!(pluginKey in enabledPlugins)) continue;
      const enabled = enabledPlugins[pluginKey] === true;
      if (enabled && cfg.state === 'suppressed') {
        divergent.push(`${instKey}: registry says suppressed, settings.json has it enabled`);
      } else if (!enabled && cfg.state === 'canonical') {
        divergent.push(`${instKey}: registry says canonical, settings.json has it disabled`);
      }
    }
  }
  if (divergent.length > 0) {
    console.log(`\n${divergent.length} plugin decision(s) are not enforced (sync.mjs covers mcp: only):`);
    for (const d of divergent) console.log(`  advisory: ${d}`);
    console.log(`  → toggle them with /plugin, or revise the registry via the 'toolset-curate' skill.`);
  }
}

// 3. Quarantäne-Report (fail-open, T002592).
//
// Setzt `hasError` bewusst NICHT: der SSOT-Spec verlangt "SHALL still exit zero". Die Meldung
// ist ein Arbeitsauftrag an die Kuration, kein CI-Fehler. Bleibt offline — es werden nur
// Dateien gelesen, kein Netz und kein Cluster berührt.
try {
  const discovered = withRegistryOnlyInstances(
    collectInstances({ baseDir: outDir, homeDir: process.env.HOME || os.homedir() }),
    { baseDir: outDir }
  );
  const unreviewed = discovered.filter(i => i.curation === 'unreviewed');
  if (unreviewed.length > 0) {
    console.log(`\n${unreviewed.length} instance(s) are unreviewed — resolve them with the 'toolset-curate' skill:`);
    for (const inst of unreviewed) {
      console.log(`  unreviewed: ${inst.instance} (${inst.harness}, ${inst.source})`);
    }
  } else {
    console.log('No unreviewed instances.');
  }
} catch (e) {
  console.error(`WARN: unreviewed report unavailable: ${e.message}`);
}

if (hasError) {
  process.exit(1);
} else {
  console.log('Toolset registry check passed.');
}
