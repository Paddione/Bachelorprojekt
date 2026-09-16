import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateUiConfigSeed } from './ui-config-seed.mjs';

describe('generateUiConfigSeed', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-config-seed-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates double-encoded JSON string array for mcpServers and uses browser_endpoint when available', () => {
    const templatePath = path.join(tmpDir, 'ui-config.template.json');
    const outputPath = path.join(tmpDir, 'ui-config.json');
    const registryPath = path.join(tmpDir, 'mcp.yaml');

    fs.writeFileSync(templatePath, JSON.stringify({ existingProp: true }));
    fs.writeFileSync(registryPath, `
clients:
  srv1:
    endpoint: "http://127.0.0.1:1001/mcp"
    browser_endpoint: "http://127.0.0.1:2001/mcp"
    enabled: true
  srv2:
    endpoint: "http://127.0.0.1:1002/mcp"
    enabled: true
    headers:
      Authorization: "Bearer \${BGE_MCP_TOKEN}"
`);

    process.env.BGE_MCP_TOKEN = 'secret-token-123';

    generateUiConfigSeed({
      templatePath,
      outputPath,
      registryPath,
    });

    const outputRaw = fs.readFileSync(outputPath, 'utf8');
    const parsed = JSON.parse(outputRaw);

    expect(parsed.existingProp).toBe(true);
    expect(typeof parsed.mcpServers).toBe('string');

    // Double encoding check: parsing mcpServers string must result in an array
    const servers = JSON.parse(parsed.mcpServers);
    expect(Array.isArray(servers)).toBe(true);
    expect(servers.length).toBe(2);

    expect(servers[0].url).toBe('http://127.0.0.1:2001/mcp'); // preferred browser_endpoint
    expect(servers[1].url).toBe('http://127.0.0.1:1002/mcp'); // fallback to endpoint
    expect(servers[1].headers.Authorization).toBe('Bearer secret-token-123'); // env expanded
  });

  it('fails if required BGE_MCP_TOKEN environment variable is missing when template references it', () => {
    const templatePath = path.join(tmpDir, 'ui-config.template.json');
    const outputPath = path.join(tmpDir, 'ui-config.json');
    const registryPath = path.join(tmpDir, 'mcp.yaml');

    fs.writeFileSync(templatePath, JSON.stringify({}));
    fs.writeFileSync(registryPath, `
clients:
  bge-mcp:
    endpoint: "http://127.0.0.1:13005/mcp"
    headers:
      Authorization: "Bearer \${BGE_MCP_TOKEN}"
`);

    delete process.env.BGE_MCP_TOKEN;

    expect(() => {
      generateUiConfigSeed({
        templatePath,
        outputPath,
        registryPath,
      });
    }).toThrow(/BGE_MCP_TOKEN/);
  });

  // ── T900202: Browser-Tokens fuer mcp-postgres, factory-mcp und k8s ────────
  // Gleiches Muster wie BGE_MCP_TOKEN: Platzhalter aus process.env aufloesen,
  // fehlende Variable hart mit klarer Meldung abbrechen.

  it('substitutes MCP_POSTGRES_TOKEN, FACTORY_MCP_TOKEN and MCP_KUBERNETES_TOKEN from env', () => {
    const templatePath = path.join(tmpDir, 'ui-config.template.json');
    const outputPath = path.join(tmpDir, 'ui-config.json');
    const registryPath = path.join(tmpDir, 'mcp.yaml');

    fs.writeFileSync(templatePath, JSON.stringify({}));
    fs.writeFileSync(registryPath, `
clients:
  mcp-postgres:
    endpoint: "http://127.0.0.1:13001/mcp"
    headers:
      Authorization: "Bearer \${MCP_POSTGRES_TOKEN}"
  factory-mcp:
    endpoint: "http://127.0.0.1:13003/mcp"
    headers:
      Authorization: "Bearer \${FACTORY_MCP_TOKEN}"
  mcp-kubernetes:
    browser_endpoint: "http://127.0.0.1:18082/mcp"
    headers:
      Authorization: "Bearer \${MCP_KUBERNETES_TOKEN}"
`);

    process.env.MCP_POSTGRES_TOKEN = 'postgres-token-123';
    process.env.FACTORY_MCP_TOKEN = 'factory-token-123';
    process.env.MCP_KUBERNETES_TOKEN = 'k8s-token-123';

    generateUiConfigSeed({
      templatePath,
      outputPath,
      registryPath,
    });

    const servers = JSON.parse(JSON.parse(fs.readFileSync(outputPath, 'utf8')).mcpServers);
    const byName = Object.fromEntries(servers.map((s) => [s.name, s]));

    expect(byName['mcp-postgres'].headers.Authorization).toBe('Bearer postgres-token-123');
    expect(byName['factory-mcp'].headers.Authorization).toBe('Bearer factory-token-123');
    expect(byName['k8s'].headers.Authorization).toBe('Bearer k8s-token-123');
  });

  it('uebernimmt Template-Header als Fallback, wenn der Registry-Eintrag keinen Header traegt (k8s, factory-mcp)', () => {
    const templatePath = path.join(tmpDir, 'ui-config.template.json');
    const outputPath = path.join(tmpDir, 'ui-config.json');
    const registryPath = path.join(tmpDir, 'mcp.yaml');

    fs.writeFileSync(templatePath, JSON.stringify({
      mcpServers: JSON.stringify([
        { name: 'k8s', url: 'http://127.0.0.1:18082/mcp', enabled: true, headers: { Authorization: 'Bearer ${MCP_KUBERNETES_TOKEN}' } },
        { name: 'factory-mcp', url: 'http://127.0.0.1:13003/mcp', enabled: true, headers: { Authorization: 'Bearer ${FACTORY_MCP_TOKEN}' } },
      ]),
    }));
    fs.writeFileSync(registryPath, `
clients:
  mcp-kubernetes:
    browser_endpoint: "http://127.0.0.1:18082/mcp"
  factory-mcp-node:
    endpoint: "http://127.0.0.1:13003/mcp"
`);

    process.env.MCP_KUBERNETES_TOKEN = 'k8s-token-123';
    process.env.FACTORY_MCP_TOKEN = 'factory-token-123';

    generateUiConfigSeed({
      templatePath,
      outputPath,
      registryPath,
    });

    const servers = JSON.parse(JSON.parse(fs.readFileSync(outputPath, 'utf8')).mcpServers);
    const byName = Object.fromEntries(servers.map((s) => [s.name, s]));

    // factory-mcp-node wird als "factory-mcp" gefuehrt (Display-Override)
    expect(byName['k8s'].headers.Authorization).toBe('Bearer k8s-token-123');
    expect(byName['factory-mcp'].headers.Authorization).toBe('Bearer factory-token-123');
  });

  it.each(['MCP_POSTGRES_TOKEN', 'FACTORY_MCP_TOKEN', 'MCP_KUBERNETES_TOKEN'])(
    'fails if required %s environment variable is missing when referenced in registry headers',
    (tokenName) => {
      const templatePath = path.join(tmpDir, 'ui-config.template.json');
      const outputPath = path.join(tmpDir, 'ui-config.json');
      const registryPath = path.join(tmpDir, 'mcp.yaml');

      fs.writeFileSync(templatePath, JSON.stringify({}));
      fs.writeFileSync(registryPath, `
clients:
  srv:
    endpoint: "http://127.0.0.1:1001/mcp"
    headers:
      Authorization: "Bearer \${${tokenName}}"
`);

      delete process.env[tokenName];

      expect(() => {
        generateUiConfigSeed({
          templatePath,
          outputPath,
          registryPath,
        });
      }).toThrow(new RegExp(tokenName));
    }
  );

  it('fails if a token referenced only in the template is missing from env', () => {
    const templatePath = path.join(tmpDir, 'ui-config.template.json');
    const outputPath = path.join(tmpDir, 'ui-config.json');
    const registryPath = path.join(tmpDir, 'mcp.yaml');

    fs.writeFileSync(templatePath, JSON.stringify({
      mcpServers: JSON.stringify([
        { name: 'k8s', url: 'http://127.0.0.1:18082/mcp', enabled: true, headers: { Authorization: 'Bearer ${MCP_KUBERNETES_TOKEN}' } },
      ]),
    }));
    fs.writeFileSync(registryPath, `
clients:
  mcp-kubernetes:
    browser_endpoint: "http://127.0.0.1:18082/mcp"
`);

    delete process.env.MCP_KUBERNETES_TOKEN;

    expect(() => {
      generateUiConfigSeed({
        templatePath,
        outputPath,
        registryPath,
      });
    }).toThrow(/MCP_KUBERNETES_TOKEN/);
  });

  // ── T002549: Serverauswahl aus der Registry statt aus einer Codeliste ──────
  //
  // T002544 fuehrte eine hartkodierte targetServerKeys-Liste. Damit braucht
  // jeder neue Server eine Code-Aenderung, und github-mcp (T002547) fiel
  // heraus, obwohl die Bruecke ihn bedient.

  it('nimmt jeden Registry-Eintrag mit erreichbarer Adresse auf, auch neu hinzugekommene', () => {
    const templatePath = path.join(tmpDir, 'tpl.json');
    const registryPath = path.join(tmpDir, 'reg.yaml');
    const outputPath = path.join(tmpDir, 'out.json');

    fs.writeFileSync(templatePath, JSON.stringify({}));
    fs.writeFileSync(registryPath, `
clients:
  factory-mcp:
    transport: http
    endpoint: "http://127.0.0.1:13003/mcp"
  github-mcp:
    transport: stdio
    browser_endpoint: "http://127.0.0.1:18235/mcp/github-mcp"
  playwright:
    transport: stdio
`);
    process.env.BGE_MCP_TOKEN = 'test-token';
    generateUiConfigSeed({ templatePath, outputPath, registryPath });

    const names = JSON.parse(JSON.parse(fs.readFileSync(outputPath, 'utf8')).mcpServers)
      .map((s) => s.name);

    // Positiv-Anker zuerst (T002356-M1): ohne ihn waere die Negativ-Aussage
    // bei einer leeren Liste trivial erfuellt.
    expect(names).toContain('factory-mcp');
    expect(names).toContain('github-mcp');
    // stdio ohne jede Adresse bleibt draussen — die Bruecke bedient ihn nicht.
    expect(names).not.toContain('playwright');
  });
});
