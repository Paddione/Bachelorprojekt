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
});
