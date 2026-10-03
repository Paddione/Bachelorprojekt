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
import { spawnSync } from 'node:child_process';
import { loadRegistry } from './lib/registry.mjs';
import { validateHarnesses, resolveToolset } from './lib/resolve.mjs';
import { ADAPTERS } from './lib/adapters/index.mjs';
import { readClaudeCodeConfig } from './lib/harness.mjs';
import { collectInstances, withRegistryOnlyInstances } from './collect.mjs';
import { ROLES, LEGACY_ROLE_ALIASES } from './lib/roles.mjs';

const registryPath = process.env.TOOLSET_REGISTRY || path.join(process.cwd(), 'docs', 'agent-guide', 'registry', 'capabilities.yaml');
const outDir = process.env.TOOLSET_OUT_DIR || process.cwd();

// Abschließendes Rollen-Vokabular aus lib/roles.mjs (T900980). Eine Legacy-Rolle
// (bachelorprojekt-*) ist in der Registry ein Fehler mit Ersatzvorschlag — die Registry ist
// migriert, ein Rückfall soll rot werden.
const VALID_ROLES = new Set(ROLES);

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
        if (Object.hasOwn(LEGACY_ROLE_ALIASES, role)) {
          console.error(`Capability '${capName}' instance '${instKey}': legacy role '${role}' — use '${LEGACY_ROLE_ALIASES[role]}' (T900858).`);
          hasError = true;
        } else if (!VALID_ROLES.has(role)) {
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

// 1c. Harness-Schema (T900791): Pflichtfelder, Rollen-Vokabular, verbotene Anbieter.
for (const msg of validateHarnesses(registry.harnesses, registry.forbiddenProviders, VALID_ROLES)) {
  console.error(msg);
  hasError = true;
}

// 2. Drift-Prüfung über Adapter (T900791): ersetzt den claude-suppressed-Vergleich.
//    Jede Harness mit Adapter und existierender Zieldatei wird im Speicher gerendert;
//    weicht das Render vom Dateitext ab, ist das Drift. Registries ohne
//    harnesses-Eintrag fallen auf das Legacy-Verhalten zurück (nur suppressed
//    wird deaktiviert), damit Fixture-Registries ohne Harness-Block weiter prüfbar sind.
const registryMcp = new Set();
const suppressedMcp = new Set();
for (const [, instances] of Object.entries(registry.capabilities)) {
  for (const [instKey, instCfg] of Object.entries(instances)) {
    if (instKey.startsWith('mcp:') && instCfg.state === 'suppressed') {
      suppressedMcp.add(instKey.slice(4));
    }
    if (instKey.startsWith('mcp:')) {
      registryMcp.add(instKey.slice(4));
    }
  }
}

const legacyToolset = new Set();
for (const [, instances] of Object.entries(registry.capabilities)) {
  for (const [instKey, instCfg] of Object.entries(instances)) {
    if (instCfg.state !== 'suppressed') legacyToolset.add(instKey);
  }
}

// Verwalteter Schlüssel je Harness für die Drift-Meldung. check-drift-detection.bats
// verlangt Datei UND Schlüssel in einer Zeile.
const MANAGED_KEYS = { claude: 'disabledMcpjsonServers', opencode: 'enabled' };

function unifiedDiff(before, after, filePath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolset-check-'));
  const a = path.join(dir, 'a');
  const b = path.join(dir, 'b');
  fs.writeFileSync(a, before);
  fs.writeFileSync(b, after);
  const res = spawnSync('diff', ['-u', '--label', `a/${filePath}`, '--label', `b/${filePath}`, a, b], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return res.stdout;
}

// Drift-Semantik je Ziel: claude vergleicht nur den verwalteten Schlüssel als Menge —
// eine fehlende Liste zählt wie eine leere, andere Keys und reine Formatierung sind kein
// Drift (Verallgemeinerung des alten §2-Teilmengenvergleichs auf den vollen Soll-Zustand).
// opencode fällt auf den Byte-Vergleich zurück — der Adapter erhält dort jedes Byte.
function isDrift(name, current, rendered) {
  if (current === rendered) return false;
  if (name === 'claude') {
    try {
      const a = JSON.parse(current).disabledMcpjsonServers ?? [];
      const b = JSON.parse(rendered).disabledMcpjsonServers ?? [];
      return JSON.stringify([...a].sort()) !== JSON.stringify([...b].sort());
    } catch {
      return true;
    }
  }
  return true;
}

const claude = readClaudeCodeConfig(outDir);
const projectMcp = new Set(Object.keys(claude.mcp?.mcpServers ?? {}));
for (const [name, adapter] of Object.entries(ADAPTERS)) {
  const harness = registry.harnesses?.[name];
  if (harness && harness.config === null) continue;
  const targetPath = path.join(outDir, adapter.file);
  if (!fs.existsSync(targetPath)) continue;
  const toolset = harness ? resolveToolset(registry.capabilities, harness) : legacyToolset;
  const ctx = name === 'claude'
    ? { toolset, registryMcp, suppressedMcp, projectMcp }
    : { toolset, registryMcp };
  const current = fs.readFileSync(targetPath, 'utf8');
  let rendered;
  try {
    rendered = adapter.render(current, ctx);
  } catch (e) {
    console.error(`Drift detected in ${targetPath} (DRIFT ${name}): render failed: ${e.message}`);
    hasError = true;
    continue;
  }
  if (!isDrift(name, current, rendered)) continue;
  console.error(`Drift detected in ${targetPath} (DRIFT ${name}): managed key '${MANAGED_KEYS[name] ?? 'managed state'}' differs`);
  console.error(unifiedDiff(current, rendered, adapter.file).trimEnd());
  hasError = true;
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
