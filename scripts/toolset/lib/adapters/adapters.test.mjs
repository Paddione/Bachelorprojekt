// scripts/toolset/lib/adapters/adapters.test.mjs — node:test für beide Adapter (T900791).
import test from 'node:test';
import assert from 'node:assert/strict';
import { render as renderClaude } from './claude.mjs';
import { render as renderOpencode } from './opencode.mjs';

test('claude adapter disables registry servers outside the toolset, keeps the rest', () => {
  const current = JSON.stringify({ theme: 'dark', disabledMcpjsonServers: [] });
  const rendered = renderClaude(current, {
    toolset: new Set(['mcp:a']),
    registryMcp: new Set(['a', 'b']),
    suppressedMcp: new Set(),
    projectMcp: new Set(['a', 'b', 'c']),
  });
  const obj = JSON.parse(rendered);
  assert.deepEqual(obj.disabledMcpjsonServers, ['b']);
  assert.equal(obj.theme, 'dark');
});

test('claude adapter keeps disabled servers without a registry entry untouched', () => {
  const current = JSON.stringify({ disabledMcpjsonServers: ['quarantine-x'] });
  const rendered = renderClaude(current, {
    toolset: new Set(['mcp:a']),
    registryMcp: new Set(['a']),
    suppressedMcp: new Set(),
    projectMcp: new Set(['a']),
  });
  const obj = JSON.parse(rendered);
  assert.deepEqual(obj.disabledMcpjsonServers, ['quarantine-x']);
});

test('opencode adapter flips only enabled values and keeps comments byte-identical', () => {
  const current = [
    '{',
    '  // keep me',
    '  "mcp": {',
    '    "a": {',
    '      "type": "local",',
    '      "command": ["echo", "a"],',
    '      "enabled": true',
    '    },',
    '    "b": {',
    '      "type": "local",',
    '      "command": ["echo", "b"],',
    '      "enabled": true',
    '    }',
    '  }',
    '}',
    '',
  ].join('\n');
  const rendered = renderOpencode(current, {
    toolset: new Set(['mcp:a']),
    registryMcp: new Set(['a', 'b']),
  });
  assert.match(rendered, /"a": \{\n      "type": "local",\n      "command": \["echo", "a"\],\n      "enabled": true/);
  assert.match(rendered, /"b": \{\n      "type": "local",\n      "command": \["echo", "b"\],\n      "enabled": false/);
  assert.ok(rendered.includes('  // keep me\n'));
});

test('opencode adapter leaves servers without a registry entry unchanged', () => {
  const current = [
    '{',
    '  "mcp": {',
    '    "x": {',
    '      "type": "local",',
    '      "enabled": true',
    '    }',
    '  }',
    '}',
    '',
  ].join('\n');
  const rendered = renderOpencode(current, {
    toolset: new Set(),
    registryMcp: new Set(['a']),
  });
  assert.equal(rendered, current);
});
