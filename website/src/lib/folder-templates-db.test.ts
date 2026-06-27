import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
const clientQ = vi.fn();
vi.mock('./website-db', () => ({
  pool: {
    query: (...a: unknown[]) => query(...a),
    connect: async () => ({
      query: (...a: unknown[]) => clientQ(...a),
      release: () => undefined,
    }),
  },
}));

import { validateStructure, listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate, DEFAULT_FOLDERS, MAX_FOLDERS } from './folder-templates-db';

beforeEach(() => { query.mockReset(); clientQ.mockReset(); });

describe('folder-templates-db.validateStructure', () => {
  it('accepts a valid array of unique folder names', () => {
    const out = validateStructure(['01_Vertrag', '02_Rechnungen', '03_Dokumente/Assets']);
    expect(out).toEqual({ ok: true, folders: ['01_Vertrag', '02_Rechnungen', '03_Dokumente/Assets'] });
  });

  it('rejects non-array input', () => {
    expect(validateStructure('hello')).toEqual({ ok: false, error: expect.stringMatching(/Array/) });
  });

  it('rejects an empty array', () => {
    expect(validateStructure([])).toEqual({ ok: false, error: expect.stringMatching(/Mindestens/) });
  });

  it('rejects more than MAX_FOLDERS entries', () => {
    const arr = Array.from({ length: MAX_FOLDERS + 1 }, (_, i) => `Folder-${i}`);
    expect(validateStructure(arr)).toEqual({ ok: false, error: expect.stringMatching(/Maximal/) });
  });

  it('rejects non-string entries', () => {
    expect(validateStructure([1, 2])).toEqual({ ok: false, error: expect.stringMatching(/String/) });
  });

  it('rejects empty / whitespace-only entries', () => {
    expect(validateStructure(['valid', '   '])).toEqual({ ok: false, error: expect.stringMatching(/leer/) });
  });

  it('rejects entries starting with /', () => {
    expect(validateStructure(['/leading'])).toEqual({ ok: false, error: expect.stringMatching(/\//) });
  });

  it('rejects entries containing ..', () => {
    expect(validateStructure(['a/../b'])).toEqual({ ok: false, error: expect.stringMatching(/\.\./) });
  });

  it('rejects entries with illegal characters', () => {
    expect(validateStructure(['a$b'])).toEqual({ ok: false, error: expect.stringMatching(/Zeichen/) });
  });

  it('rejects duplicate folders', () => {
    expect(validateStructure(['a', 'b', 'a'])).toEqual({ ok: false, error: expect.stringMatching(/doppelt/) });
  });

  it('rejects segments longer than 100 chars', () => {
    const long = 'x'.repeat(101);
    expect(validateStructure([long])).toEqual({ ok: false, error: expect.stringMatching(/100/) });
  });

  it('exports DEFAULT_FOLDERS with 5 known buckets', () => {
    expect(DEFAULT_FOLDERS).toHaveLength(5);
    expect(DEFAULT_FOLDERS[0]).toBe('01_Vertrag');
  });
});

describe('folder-templates-db CRUD (db-mocked)', () => {
  it('listTemplates: simple SELECT WHERE brand', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 't1', brand: 'mentolder', name: 'Default', structure: { folders: [] }, is_default: true, created_at: '2026-01-01', updated_at: '2026-01-01' }] });
    const out = await listTemplates('mentolder');
    expect(out).toHaveLength(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/FROM public\.folder_templates/);
    expect(sql).toMatch(/WHERE brand = \$1/);
    expect(params).toEqual(['mentolder']);
  });

  it('getTemplate: returns null when missing', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await getTemplate('mentolder', 'missing')).toBeNull();
  });

  it('getTemplate: returns the row when found', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 't1', brand: 'mentolder', name: 'X', structure: { folders: [] }, is_default: false, created_at: '', updated_at: '' }] });
    expect(await getTemplate('mentolder', 't1')).not.toBeNull();
  });

  it('createTemplate: INSERT with brand + structure JSON + is_default', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [] })  // BEGIN
      .mockResolvedValueOnce({ rows: [] })  // UPDATE clear other defaults (isDefault=true)
      .mockResolvedValueOnce({ rows: [{ id: 't2' }] })  // INSERT
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    await createTemplate({ brand: 'mentolder', name: 'Neu', folders: ['a', 'b'], isDefault: true });
    const [insertSql, insertParams] = clientQ.mock.calls[2];
    expect(insertSql).toMatch(/INSERT INTO public\.folder_templates/);
    expect(insertParams[0]).toBe('mentolder');
    expect(insertParams[1]).toBe('Neu');
    expect(insertParams[2]).toBe(JSON.stringify({ folders: ['a', 'b'] }));
    expect(insertParams[3]).toBe(true);
  });

  it('updateTemplate: builds a dynamic SET clause from the provided fields', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [] })  // BEGIN
      .mockResolvedValueOnce({ rows: [] })  // UPDATE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    await updateTemplate('mentolder', 't1', { name: 'Updated', isDefault: false });
    const [updateSql, updateParams] = clientQ.mock.calls[1];
    expect(updateSql).toMatch(/UPDATE public\.folder_templates/);
    expect(updateSql).toMatch(/name = \$1/);
    expect(updateSql).toMatch(/is_default = \$2/);
    expect(updateParams).toEqual(['Updated', false, 'mentolder', 't1']);
  });

  it('updateTemplate: with no fields still updates the timestamp', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [] })  // BEGIN
      .mockResolvedValueOnce({ rows: [] })  // UPDATE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    await updateTemplate('mentolder', 't1', {});
    const updateSql = clientQ.mock.calls[1][0] as string;
    expect(updateSql).toMatch(/SET updated_at = now\(\)/);
  });

  it('updateTemplate: clears other defaults when isDefault=true', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [] })  // BEGIN
      .mockResolvedValueOnce({ rows: [] })  // UPDATE clear other defaults
      .mockResolvedValueOnce({ rows: [] })  // UPDATE this row
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    await updateTemplate('mentolder', 't1', { isDefault: true });
    const clearSql = clientQ.mock.calls[1][0] as string;
    expect(clearSql).toMatch(/SET is_default = false/);
    expect(clearSql).toMatch(/is_default = true AND id != \$2/);
  });

  it('deleteTemplate: returns false when the row is missing', async () => {
    clientQ.mockResolvedValueOnce({ rows: [] }); // SELECT
    expect(await deleteTemplate('mentolder', 'missing')).toBe(false);
  });

  it('deleteTemplate: returns true for a non-default row', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [{ is_default: false }] })  // SELECT existing
      .mockResolvedValueOnce({ rows: [] });                      // DELETE
    expect(await deleteTemplate('mentolder', 't1')).toBe(true);
    const deleteSql = clientQ.mock.calls[1][0] as string;
    expect(deleteSql).toMatch(/DELETE FROM public\.folder_templates/);
  });

  it('deleteTemplate: refuses to delete the only default template', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [{ is_default: true }] })  // SELECT existing
      .mockResolvedValueOnce({ rows: [{ cnt: '1' }] });          // SELECT count defaults
    expect(await deleteTemplate('mentolder', 't1')).toBe(false);
  });
});
