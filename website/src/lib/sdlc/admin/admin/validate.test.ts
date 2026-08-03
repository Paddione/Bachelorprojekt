import { describe, it, expect } from 'vitest';
import { validateAgainst } from './validate';
import type { FieldSchema } from './schema-types';

const schema: FieldSchema[] = [
  { key: 'email', label: 'E-Mail', type: 'text', validation: { required: true, email: true } },
  { key: 'phone', label: 'Telefon', type: 'text' },
  { key: 'url', label: 'Web', type: 'text', validation: { url: true } },
];

describe('validateAgainst', () => {
  it('flags a missing required field', () => {
    expect(validateAgainst(schema, { email: '', url: '' })).toContainEqual({ field: 'email', message: expect.stringContaining('erforderlich') });
  });
  it('flags an invalid email', () => {
    expect(validateAgainst(schema, { email: 'nope', url: '' }).some((e) => e.field === 'email')).toBe(true);
  });
  it('flags an invalid url but allows empty optional url', () => {
    expect(validateAgainst(schema, { email: 'a@b.de', url: 'not a url' }).some((e) => e.field === 'url')).toBe(true);
    expect(validateAgainst(schema, { email: 'a@b.de', url: '' })).toEqual([]);
  });
});
