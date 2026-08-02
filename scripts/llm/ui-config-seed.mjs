import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

export function generateUiConfigSeed(options = {}) {
  const repoRoot = path.resolve(import.meta.dirname, '../..');
  const templatePath = options.templatePath || path.join(repoRoot, 'scripts/llm/ui-config.template.json');
  const outputPath = options.outputPath;
  const registryPath = options.registryPath || path.join(repoRoot, 'docs/agent-guide/registry/mcp.yaml');

  if (!outputPath) {
    throw new Error('outputPath argument is required');
  }

  const registryContent = fs.readFileSync(registryPath, 'utf8');
  const registry = yaml.load(registryContent);
  const clients = registry.clients || {};

  // T002549 — Die Serverauswahl wird aus der Registry ABGELEITET, nicht in einer
  // Codeliste gefuehrt. Eine hartkodierte Liste erzwingt eine Code-Aenderung fuer
  // jeden neuen Server; genau daran fiel github-mcp (T002547) heraus, obwohl die
  // Bruecke ihn bedient. Kriterium ist ausschliesslich die Erreichbarkeit:
  // browser_endpoint (bevorzugt) oder endpoint. stdio-Eintraege ohne beides
  // bedient die Bruecke nicht und gehoeren deshalb nicht in den Seed.
  //
  // Anzeigenamen entsprechen dem Registry-Schluessel — einzige Ausnahme ist
  // mcp-kubernetes, das in der UI seit jeher als "k8s" gefuehrt wird.
  const DISPLAY_NAME_OVERRIDES = { 'mcp-kubernetes': 'k8s' };

  let templateContent = {};
  let templateRaw = '';
  if (fs.existsSync(templatePath)) {
    templateRaw = fs.readFileSync(templatePath, 'utf8');
    templateContent = JSON.parse(templateRaw);
  }

  const needsToken = templateRaw.includes('${BGE_MCP_TOKEN}') ||
    Object.values(clients).some(c => c.headers && Object.values(c.headers).some(h => typeof h === 'string' && h.includes('${BGE_MCP_TOKEN}')));

  if (needsToken && !process.env.BGE_MCP_TOKEN) {
    throw new Error('Required environment variable BGE_MCP_TOKEN is not set');
  }

  const token = process.env.BGE_MCP_TOKEN || '';

  const servers = [];

  for (const key of Object.keys(clients)) {
    const entry = clients[key];
    if (!entry) continue;

    const name = DISPLAY_NAME_OVERRIDES[key] || key;
    const url = entry.browser_endpoint || entry.endpoint;

    if (!url) continue;

    const serverObj = {
      name,
      url,
      enabled: true
    };

    if (entry.headers) {
      const headers = {};
      for (const [hKey, hVal] of Object.entries(entry.headers)) {
        if (typeof hVal === 'string' && hVal.includes('${BGE_MCP_TOKEN}')) {
          headers[hKey] = hVal.replace('${BGE_MCP_TOKEN}', token);
        } else {
          headers[hKey] = hVal;
        }
      }
      serverObj.headers = headers;
    }

    servers.push(serverObj);
  }

  const mcpServersDoubleEncoded = JSON.stringify(servers);
  templateContent.mcpServers = mcpServersDoubleEncoded;

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(templateContent, null, 2), 'utf8');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const args = process.argv.slice(2);
  let outputPath = null;
  let templatePath = null;
  let registryPath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' || args[i] === '-o') {
      outputPath = args[++i];
    } else if (args[i] === '--template') {
      templatePath = args[++i];
    } else if (args[i] === '--registry') {
      registryPath = args[++i];
    }
  }

  if (!outputPath) {
    console.error('Usage: node ui-config-seed.mjs --output <path> [--template <path>] [--registry <path>]');
    process.exit(1);
  }

  try {
    generateUiConfigSeed({ outputPath, templatePath, registryPath });
  } catch (err) {
    console.error('Error generating ui-config seed:', err.message);
    process.exit(1);
  }
}
