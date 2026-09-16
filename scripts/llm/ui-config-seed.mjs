import fs from 'node:fs';
import path from 'node:path';
import * as yamlPkg from 'js-yaml';
const yaml = yamlPkg.default ?? yamlPkg;

/**
 * Baut den Systemprompt aus der Registry (T002550).
 *
 * Bewusst kurz gehalten: er steht vor JEDER Unterhaltung im Kontext und kostet
 * dort Platz, der fuer die eigentliche Aufgabe fehlt. Was das Modell ohnehin aus
 * den Tool-Schemata erfaehrt — Parameter, Rueckgabewerte — wird hier NICHT
 * wiederholt. Nur die Zustaendigkeit, die kein Schema ausdrueckt.
 *
 * @param {Record<string, any>} clients Registry-Eintraege
 * @param {Array<{name: string}>} servers Die tatsaechlich eingebundenen Server
 * @returns {string}
 */
export function buildSystemMessage(clients, servers) {
  const PURPOSE = {
    'k8s': 'Kubernetes-Cluster: Pods, Logs, Ressourcen, Events (lesend bevorzugt)',
    'mcp-postgres': 'SQL gegen die mentolder-Datenbank — NICHT fuer Tickets',
    'factory-mcp': 'Software-Factory: Queue, Status, Dispatch',
    'bge-mcp': 'Embeddings und Reranking',
    'ticket-mcp': 'Tickets: lesen, anlegen, Status, Plaene',
    'mcp-task-runner': 'Taskfile-Ziele ausfuehren',
    'codebase-memory-mcp': 'Code-Graph: Symbole finden, Aufrufketten verfolgen, Architektur',
    'github-mcp': 'GitHub: Repos, Issues, Pull Requests',
  };

  const lines = [
    'Du arbeitest am Repository Bachelorprojekt — einer Kubernetes-Plattform (Bachelorarbeit).',
    '',
    'Verfuegbare MCP-Server und ihre Zustaendigkeit:',
  ];

  for (const s of servers) {
    const purpose = PURPOSE[s.name] || clients[s.name]?.description || 'siehe Tool-Beschreibungen';
    lines.push(`- ${s.name}: ${purpose}`);
  }

  lines.push(
    '',
    'Regeln:',
    '- Code suchen: erst codebase-memory-mcp (Graph), dann grep_search. Der Graph kennt',
    '  Aufrufbeziehungen, die eine Textsuche nicht findet.',
    '- Tickets ausschliesslich ueber ticket-mcp lesen und schreiben. mcp-postgres ist an die',
    '  mentolder-Datenbank gebunden und liefert bei korczewski-IDs still die falsche Zeile.',
    '- Vor dem Aendern einer Datei diese lesen. edit_file setzt den exakten Bestand voraus.',
    '- Aenderungen am Repository laufen ueber Branch und Pull Request, nie direkt auf main.',
    '- Behauptungen ueber den Zustand des Systems mit einem Kommando belegen, nicht schaetzen.',
  );

  return lines.join('\n');
}

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
  // Anzeigenamen entsprechen dem Registry-Schluessel — Ausnahmen:
  // mcp-kubernetes heisst in der UI seit jeher "k8s", factory-mcp-node wird
  // als "factory-mcp" gefuehrt (Template, Runbook, Systemprompt-PURPOSE).
  const DISPLAY_NAME_OVERRIDES = { 'mcp-kubernetes': 'k8s', 'factory-mcp-node': 'factory-mcp' };

  let templateContent = {};
  let templateRaw = '';
  if (fs.existsSync(templatePath)) {
    templateRaw = fs.readFileSync(templatePath, 'utf8');
    templateContent = JSON.parse(templateRaw);
  }

  // T900202 — Browser-Tokens: die llama-Web-UI braucht fuer mcp-postgres,
  // factory-mcp und k8s denselben Bearer-Header wie bge-mcp. Die Registry
  // traegt die Header fuer mcp-postgres und bge-mcp bereits auf Top-Level;
  // mcp-kubernetes und factory-mcp-node bewusst nicht (T002779-Guard: ein
  // ${VAR}-Header wuerde factory-mcp-node aus .mcp.json entfernen). SSOT fuer
  // diese Browser-Header ist das Template (docs/runbooks/mcp-http-local-security.md,
  // Schritt 2) — der Seed uebernimmt sie als Fallback in die Serverliste.
  const TOKEN_PLACEHOLDERS = ['BGE_MCP_TOKEN', 'MCP_POSTGRES_TOKEN', 'FACTORY_MCP_TOKEN', 'MCP_KUBERNETES_TOKEN'];

  const referencedTokens = TOKEN_PLACEHOLDERS.filter((name) =>
    templateRaw.includes(`\${${name}}`) ||
    Object.values(clients).some((c) =>
      c.headers &&
      Object.values(c.headers).some((h) => typeof h === 'string' && h.includes(`\${${name}}`))
    )
  );

  for (const name of referencedTokens) {
    if (!process.env[name]) {
      throw new Error(`Required environment variable ${name} is not set`);
    }
  }

  // ${VAR}-Platzhalter aus process.env aufloesen. Unbekannte Platzhalter
  // bleiben unveraendert stehen (fail-safe, kein stilles Leeren).
  const expandTokens = (value) =>
    value.replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (match, name) => process.env[name] ?? match);

  // Template-Eintraege als Header-Quelle fuer Browser-Clients, deren
  // Registry-Eintrag bewusst keinen Top-Level-Header traegt (k8s, factory-mcp).
  let templateServers = [];
  if (typeof templateContent.mcpServers === 'string') {
    try {
      const parsed = JSON.parse(templateContent.mcpServers);
      if (Array.isArray(parsed)) templateServers = parsed;
    } catch {
      // Kaputtes Template — die Serverliste kommt ohnehin aus der Registry.
    }
  }

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

    const headers = {};
    if (entry.headers) {
      for (const [hKey, hVal] of Object.entries(entry.headers)) {
        headers[hKey] = typeof hVal === 'string' ? expandTokens(hVal) : hVal;
      }
    } else {
      const templateEntry = templateServers.find((s) => s.name === name);
      if (templateEntry?.headers) {
        for (const [hKey, hVal] of Object.entries(templateEntry.headers)) {
          headers[hKey] = typeof hVal === 'string' ? expandTokens(hVal) : hVal;
        }
      }
    }
    if (Object.keys(headers).length > 0) {
      serverObj.headers = headers;
    }

    servers.push(serverObj);
  }

  const mcpServersDoubleEncoded = JSON.stringify(servers);
  templateContent.mcpServers = mcpServersDoubleEncoded;

  // T002550 — Werkzeug-Routing als Systemprompt.
  //
  // Das Modell erfaehrt Namen, Beschreibung und Parameter jedes Tools
  // automatisch (MCP: tools/list; eingebaute: aus dem Server), und einzelne
  // Server liefern eigene `instructions` mit. Was KEIN Server kennt, ist die
  // projektspezifische Zustaendigkeit: welcher der Server fuer welche Frage.
  // Genau das steht hier — abgeleitet aus der Registry, damit es mitwaechst,
  // statt als handgepflegter Text zu veralten.
  //
  // Ein im Template gesetzter systemMessage gewinnt: wer bewusst etwas
  // Eigenes hinterlegt, soll nicht bei jedem Rendern ueberschrieben werden.
  if (!templateContent.systemMessage) {
    templateContent.systemMessage = buildSystemMessage(clients, servers);
  }

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
