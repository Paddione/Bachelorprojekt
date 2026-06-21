import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readBuffer, writeBuffer, classifyBundle } from '../../../scripts/ticket-mcp/lib/mishap-buffer.js';

let tmpDir;
let bufferPath;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'mishap-test-'));
  bufferPath = join(tmpDir, 'mishap-buffer.json');
});

afterEach(() => rmSync(tmpDir, { recursive: true }));

describe('readBuffer', () => {
  it('returns empty array when file missing', () => {
    assert.deepEqual(readBuffer(bufferPath), []);
  });

  it('returns parsed entries', () => {
    writeFileSync(bufferPath, JSON.stringify([{ title: 'x', reported_at: '2026-01-01' }]));
    assert.equal(readBuffer(bufferPath).length, 1);
  });
});

describe('writeBuffer', () => {
  it('persists entries as JSON', () => {
    const entries = [{ title: 'a' }, { title: 'b' }];
    writeBuffer(entries, bufferPath);
    assert.deepEqual(readBuffer(bufferPath), entries);
  });
});

describe('classifyBundle', () => {
  it('sets severity major when any entry type is broken', () => {
    const entries = [
      { title: 'x', type: 'broken', component: 'auth', description: 'a' },
      { title: 'y', type: 'drift',  component: 'chat', description: 'b' },
      { title: 'z', type: 'drift',  component: 'auth', description: 'c' },
    ];
    const result = classifyBundle(entries);
    assert.equal(result.severity, 'major');
    assert.equal(result.priority, 'hoch');
    assert.ok(result.areas.includes('auth'));
  });

  it('sets severity minor when no broken/security entries', () => {
    const entries = [
      { title: 'x', type: 'drift',       component: 'docs', description: 'a' },
      { title: 'y', type: 'suspicious',  component: 'docs', description: 'b' },
      { title: 'z', type: 'degraded',    component: 'docs', description: 'c' },
    ];
    const result = classifyBundle(entries);
    assert.equal(result.severity, 'minor');
    assert.equal(result.priority, 'mittel');
  });

  it('builds bundled description markdown', () => {
    const entries = Array.from({ length: 3 }, (_, i) => ({
      title: `Mishap ${i}`, type: 'drift', component: 'infra', description: `desc ${i}`,
    }));
    const result = classifyBundle(entries);
    assert.ok(result.description.includes('Mishap 0'));
    assert.ok(result.description.includes('Mishap 2'));
  });
});
