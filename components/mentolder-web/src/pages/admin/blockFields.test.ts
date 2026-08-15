import { describe, it, expect } from 'vitest';
import { fieldsForBlock, getAtPath, setAtPath, BLOCK_FIELDS } from './blockFields';

describe('fieldsForBlock', () => {
  it('returns hero fields including a title text field', () => {
    const fields = fieldsForBlock('hero');
    expect(fields.some((f) => f.key === 'title' && f.kind === 'text')).toBe(true);
  });

  it('models nested whyMe intro as dotted paths', () => {
    const fields = fieldsForBlock('whyMe');
    expect(fields.some((f) => f.key === 'intro.prefix')).toBe(true);
  });

  it('models services.items as an objectList with item fields', () => {
    const fields = fieldsForBlock('services');
    const items = fields.find((f) => f.key === 'items');
    expect(items?.kind).toBe('objectList');
    expect(items?.itemFields?.some((f) => f.key === 'features' && f.kind === 'stringList')).toBe(true);
  });

  it('covers every block type in the schema', () => {
    for (const t of ['hero', 'stats', 'services', 'whyMe', 'process', 'faq', 'cta', 'richText', 'image', 'spacer']) {
      expect(BLOCK_FIELDS[t]).toBeDefined();
    }
  });

  it('returns [] for an unknown type', () => {
    expect(fieldsForBlock('nope')).toEqual([]);
  });
});

describe('getAtPath / setAtPath', () => {
  it('reads a flat key', () => {
    expect(getAtPath({ title: 'x' }, 'title')).toBe('x');
  });

  it('reads a dotted path', () => {
    expect(getAtPath({ intro: { prefix: 'p' } }, 'intro.prefix')).toBe('p');
  });

  it('immutably sets a flat key', () => {
    const obj = { title: 'old' };
    const next = setAtPath(obj, 'title', 'new');
    expect(next).toEqual({ title: 'new' });
    expect(obj.title).toBe('old'); // original untouched
  });

  it('immutably sets a dotted path without mutating the source', () => {
    const obj = { intro: { prefix: 'old', emphasis: 'e' } };
    const next = setAtPath(obj, 'intro.prefix', 'new') as any;
    expect(next.intro.prefix).toBe('new');
    expect(next.intro.emphasis).toBe('e');
    expect(obj.intro.prefix).toBe('old');
  });
});
