// scripts/toolset/lib/adapters/adapters.test.mjs — node:test für beide Adapter (T900791).
import test from 'node:test';
import assert from 'node:assert/strict';
import { render as renderClaude } from './claude.mjs';
import { render as renderOpencode } from './opencode.mjs';
import { render as renderOpenclaw, validate as validateOpenclaw, serverNames, probe } from './openclaw.mjs';

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

test('openclaw adapter returns user-scope text byte-identical (manages no repo state)', () => {
  const current = [
    '// user scope, comments are full lines only',
    '{',
    '  "gateway": { "port": 18789 },',
    '  "mcp": { "servers": { "x": { "command": "echo" } } },',
    '  "models": { "primary": "local/local-default // kept" }',
    '}',
    '',
  ].join('\n');
  assert.deepEqual(validateOpenclaw(current), []);
  assert.deepEqual(serverNames(current), ['x']);
  assert.equal(renderOpenclaw(current, { toolset: new Set(), registryMcp: new Set() }), current);
});

test('openclaw adapter accepts configs without an mcp block', () => {
  const current = '{"gateway":{"port":18789}}\n';
  assert.deepEqual(validateOpenclaw(current), []);
  assert.deepEqual(serverNames(current), []);
  assert.equal(renderOpenclaw(current, {}), current);
});

test('openclaw adapter throws on unparsable config (drift signal)', () => {
  assert.throws(() => renderOpenclaw('{not json', {}), /invalid openclaw user-scope config/);
  assert.deepEqual(validateOpenclaw('["array"]'), ['config must be a JSON object']);
  assert.deepEqual(
    validateOpenclaw('{"mcp":{"servers":{"x":"nope"}}}'),
    ['mcp.servers.x must be an object'],
  );
});

test('openclaw probe reports skip when the binary is unavailable', () => {
  const res = probe('x', { spawn: () => ({ error: new Error('ENOENT'), status: null }) });
  assert.equal(res.ok, false);
  assert.equal(res.skipped, true);
});

test('openclaw probe passes through doctor --probe results', () => {
  const ok = probe('x', { spawn: (args) => {
    assert.deepEqual(args, ['mcp', 'doctor', 'x', '--probe']);
    return { status: 0, stdout: 'healthy', stderr: '' };
  } });
  assert.equal(ok.ok, true);
  const fail = probe('x', { spawn: () => ({ status: 1, stdout: '', stderr: 'unreachable' }) });
  assert.equal(fail.ok, false);
  assert.equal(fail.skipped, undefined);
});
