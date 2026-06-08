import { test } from 'node:test';
import assert from 'node:assert';
import { listCoachingTemplates, getCoachingTemplate } from '../src/server/coaching-templates';

function fakePool(rows: any[]) {
  const calls: { text: string; params?: unknown[] }[] = [];
  return {
    pool: {
      async query(text: string, params?: unknown[]) { calls.push({ text, params }); return { rows }; },
    } as any,
    calls,
  };
}

test('listCoachingTemplates filters by brand + active and maps steps', async () => {
  const { pool, calls } = fakePool([
    { id: 'a', brand: 'mentolder', name: 'N', description: 'D', steps: ['s1', 's2'], is_system: true },
  ]);
  const out = await listCoachingTemplates(pool, 'mentolder');
  assert.match(calls[0].text, /FROM brett\.coaching_templates/);
  assert.match(calls[0].text, /brand = \$1/);
  assert.match(calls[0].text, /is_active = true/);
  assert.deepStrictEqual(calls[0].params, ['mentolder']);
  assert.strictEqual(out.length, 1);
  assert.deepStrictEqual(out[0].steps, ['s1', 's2']);
  assert.strictEqual(out[0].isSystem, true);
});

test('getCoachingTemplate returns null when absent', async () => {
  const { pool } = fakePool([]);
  const out = await getCoachingTemplate(pool, 'missing-id');
  assert.strictEqual(out, null);
});

test('getCoachingTemplate parses steps when returned as JSON string', async () => {
  const { pool } = fakePool([
    { id: 'x', brand: 'mentolder', name: 'N', description: null, steps: '["a","b"]', is_system: false },
  ]);
  const out = await getCoachingTemplate(pool, 'x');
  assert.deepStrictEqual(out!.steps, ['a', 'b']);
});
