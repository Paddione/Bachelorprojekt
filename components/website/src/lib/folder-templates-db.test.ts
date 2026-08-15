import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import type { Pool } from 'pg';

// folder-templates-db.ts imports `pool` from ./website-db and `ensureFolder`
// from ./nextcloud-files as MODULE BINDINGS, so both are vi.mock'd (see
// learning-db.test.ts for the HOISTING TRAP this pattern works around: the
// pg-mem pool has to be built inside vi.hoisted() so it exists before the
// vi.mock factory — which itself is hoisted above all imports — runs).
const { memPool } = vi.hoisted(() => {

  const { newDb, DataType } = require('pg-mem');
  const pgmem = newDb();
  pgmem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    impure: true,
    implementation: () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c: string) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      }),
  });
  pgmem.public.none(`
    CREATE TABLE public.folder_templates (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand      TEXT NOT NULL,
      name       TEXT NOT NULL,
      structure  JSONB NOT NULL,
      is_default BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (brand, name)
    );
  `);
  const { Pool: MemPool } = pgmem.adapters.createPg();
  return { memPool: new MemPool() as unknown as Pool };
});

vi.mock('./website-db', () => ({ pool: memPool }));

const ensureFolderMock = vi.hoisted(() => vi.fn());
vi.mock('./nextcloud-files', () => ({ ensureFolder: ensureFolderMock }));

import {
  DEFAULT_FOLDERS,
  validateStructure,
  MAX_FOLDERS,
  listTemplates,
  getTemplate,
  getDefaultTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  materializeTemplate,
} from './folder-templates-db';

beforeEach(async () => {
  await memPool.query('TRUNCATE public.folder_templates');
  ensureFolderMock.mockReset();
});

afterAll(async () => {
  await (memPool as unknown as { end(): Promise<void> }).end();
});

describe('DEFAULT_FOLDERS', () => {
  it('contains exactly 5 folders in the correct order', () => {
    expect(DEFAULT_FOLDERS).toHaveLength(5);
    expect(DEFAULT_FOLDERS[0]).toBe('01_Vertrag');
    expect(DEFAULT_FOLDERS[1]).toBe('02_Rechnungen');
    expect(DEFAULT_FOLDERS[2]).toBe('03_Dokumente');
    expect(DEFAULT_FOLDERS[3]).toBe('04_Assets');
    expect(DEFAULT_FOLDERS[4]).toBe('05_Kommunikation');
  });
});

describe('validateStructure', () => {
  it('accepts a valid folder list', () => {
    const result = validateStructure(['01_Vertrag', '02_Rechnungen']);
    expect(result.ok).toBe(true);
    expect(result.folders).toEqual(['01_Vertrag', '02_Rechnungen']);
  });

  it('rejects non-array input', () => {
    expect(validateStructure('not-an-array').ok).toBe(false);
    expect(validateStructure(null).ok).toBe(false);
    expect(validateStructure({}).ok).toBe(false);
  });

  it('rejects empty array', () => {
    expect(validateStructure([]).ok).toBe(false);
  });

  it('rejects .. path traversal', () => {
    expect(validateStructure(['..']).ok).toBe(false);
    expect(validateStructure(['foo/../bar']).ok).toBe(false);
    expect(validateStructure(['foo/bar/..']).ok).toBe(false);
  });

  it('rejects leading slash', () => {
    expect(validateStructure(['/etc']).ok).toBe(false);
  });

  it('rejects empty strings', () => {
    expect(validateStructure(['  ']).ok).toBe(false);
  });

  it('rejects too many folders', () => {
    const many = Array.from({ length: MAX_FOLDERS + 1 }, (_, i) => `ordner_${i}`);
    expect(validateStructure(many).ok).toBe(false);
  });

  it('rejects segment longer than 100 characters', () => {
    expect(validateStructure(['a'.repeat(101)]).ok).toBe(false);
    expect(validateStructure([`foo/${'b'.repeat(101)}`]).ok).toBe(false);
  });

  it('rejects unallowed characters', () => {
    expect(validateStructure(['foo*bar']).ok).toBe(false);
    expect(validateStructure(['foo?']).ok).toBe(false);
    expect(validateStructure(['<script>']).ok).toBe(false);
  });

  it('accepts nested paths with slash', () => {
    expect(validateStructure(['01_Vertrag/Draft', '02_Rechnungen/2024']).ok).toBe(true);
  });

  it('rejects duplicate folder names', () => {
    expect(validateStructure(['a', 'a']).ok).toBe(false);
  });

  it('accepts exactly MAX_FOLDERS', () => {
    const max = Array.from({ length: MAX_FOLDERS }, (_, i) => `ordner_${i}`);
    expect(validateStructure(max).ok).toBe(true);
  });
});

describe('createTemplate + listTemplates + getTemplate', () => {
  it('creates a template and lists it for its brand, ordered by name', async () => {
    await createTemplate({ brand: 'mentolder', name: 'Zebra', folders: ['a'] });
    await createTemplate({ brand: 'mentolder', name: 'Alpha', folders: ['b'] });
    await createTemplate({ brand: 'korczewski', name: 'Other Brand', folders: ['c'] });

    const list = await listTemplates('mentolder');
    expect(list).toHaveLength(2);
    expect(list.map((t) => t.name)).toEqual(['Alpha', 'Zebra']); // ORDER BY name
  });

  it('returns an empty array when the brand has no templates', async () => {
    expect(await listTemplates('mentolder')).toEqual([]);
  });

  it('getTemplate returns the matching row for brand+id', async () => {
    const created = await createTemplate({ brand: 'mentolder', name: 'T1', folders: ['x', 'y'] });
    const found = await getTemplate('mentolder', created.id);
    expect(found?.name).toBe('T1');
    expect(found?.structure.folders).toEqual(['x', 'y']);
  });

  it('getTemplate returns null for a non-existent id', async () => {
    expect(await getTemplate('mentolder', '00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('getTemplate returns null when brand does not match the row', async () => {
    const created = await createTemplate({ brand: 'mentolder', name: 'T1', folders: ['x'] });
    expect(await getTemplate('korczewski', created.id)).toBeNull();
  });

  it('creating a second isDefault template in the same brand unsets the previous default', async () => {
    const first = await createTemplate({ brand: 'mentolder', name: 'First', folders: ['a'], isDefault: true });
    expect(first.is_default).toBe(true);

    const second = await createTemplate({ brand: 'mentolder', name: 'Second', folders: ['b'], isDefault: true });
    expect(second.is_default).toBe(true);

    const refreshedFirst = await getTemplate('mentolder', first.id);
    expect(refreshedFirst?.is_default).toBe(false);
  });

  it('ON CONFLICT (brand, name): re-creating with the same brand+name upserts in place', async () => {
    const first = await createTemplate({ brand: 'mentolder', name: 'Dup', folders: ['a'] });
    const second = await createTemplate({ brand: 'mentolder', name: 'Dup', folders: ['a', 'b'] });
    expect(second.id).toBe(first.id);
    expect(second.structure.folders).toEqual(['a', 'b']);

    const list = await listTemplates('mentolder');
    expect(list).toHaveLength(1); // still just one row, not a duplicate
  });
});

describe('getDefaultTemplate', () => {
  it('returns null when the brand has no default template', async () => {
    await createTemplate({ brand: 'mentolder', name: 'NotDefault', folders: ['a'] });
    expect(await getDefaultTemplate('mentolder')).toBeNull();
  });

  it('returns the default template for the brand', async () => {
    await createTemplate({ brand: 'mentolder', name: 'D', folders: ['a'], isDefault: true });
    const found = await getDefaultTemplate('mentolder');
    expect(found?.name).toBe('D');
    expect(found?.is_default).toBe(true);
  });
});

describe('updateTemplate', () => {
  it('returns null when the template does not exist', async () => {
    expect(await updateTemplate('mentolder', '00000000-0000-0000-0000-000000000000', { name: 'X' })).toBeNull();
  });

  it('updates the name only, leaving folders untouched', async () => {
    const created = await createTemplate({ brand: 'mentolder', name: 'Old', folders: ['a', 'b'] });
    const updated = await updateTemplate('mentolder', created.id, { name: 'New' });
    expect(updated?.name).toBe('New');
    expect(updated?.structure.folders).toEqual(['a', 'b']);
  });

  it('updates folders only, leaving name untouched', async () => {
    const created = await createTemplate({ brand: 'mentolder', name: 'Keep', folders: ['a'] });
    const updated = await updateTemplate('mentolder', created.id, { folders: ['x', 'y', 'z'] });
    expect(updated?.name).toBe('Keep');
    expect(updated?.structure.folders).toEqual(['x', 'y', 'z']);
  });

  it('setting isDefault=true unsets any other default in the same brand (excluding itself)', async () => {
    const a = await createTemplate({ brand: 'mentolder', name: 'A', folders: ['a'], isDefault: true });
    const b = await createTemplate({ brand: 'mentolder', name: 'B', folders: ['b'] });

    const updated = await updateTemplate('mentolder', b.id, { isDefault: true });
    expect(updated?.is_default).toBe(true);

    const refreshedA = await getTemplate('mentolder', a.id);
    expect(refreshedA?.is_default).toBe(false);
  });

  it('a no-op update (no fields) still bumps updated_at and returns the row', async () => {
    const created = await createTemplate({ brand: 'mentolder', name: 'NoOp', folders: ['a'] });
    const updated = await updateTemplate('mentolder', created.id, {});
    expect(updated?.id).toBe(created.id);
    expect(updated?.name).toBe('NoOp');
  });
});

describe('deleteTemplate', () => {
  it('returns false for a non-existent template', async () => {
    expect(await deleteTemplate('mentolder', '00000000-0000-0000-0000-000000000000')).toBe(false);
  });

  it('deletes a non-default template and returns true', async () => {
    const created = await createTemplate({ brand: 'mentolder', name: 'ToDelete', folders: ['a'] });
    expect(await deleteTemplate('mentolder', created.id)).toBe(true);
    expect(await getTemplate('mentolder', created.id)).toBeNull();
  });

  it('refuses to delete the only default template for a brand', async () => {
    const created = await createTemplate({ brand: 'mentolder', name: 'OnlyDefault', folders: ['a'], isDefault: true });
    expect(await deleteTemplate('mentolder', created.id)).toBe(false);
    expect(await getTemplate('mentolder', created.id)).not.toBeNull(); // still there
  });

  it('allows deleting a default template when another default exists for the same brand', async () => {
    const a = await createTemplate({ brand: 'mentolder', name: 'A', folders: ['a'], isDefault: true });
    // Manually mark a second row is_default=true too (simulates pre-existing data
    // inconsistency / a migration state) so the "count > 1" branch is exercised.
    await memPool.query(`UPDATE public.folder_templates SET is_default = true WHERE brand = 'mentolder'`);
    await createTemplate({ brand: 'mentolder', name: 'B', folders: ['b'], isDefault: true });

    expect(await deleteTemplate('mentolder', a.id)).toBe(true);
  });
});

describe('materializeTemplate', () => {
  it('creates every folder and reports them all as created when ensureFolder succeeds', async () => {
    ensureFolderMock.mockResolvedValue(undefined);
    const result = await materializeTemplate('proj-1', ['01_Vertrag', '02_Rechnungen']);
    expect(result.created).toEqual(['01_Vertrag', '02_Rechnungen']);
    expect(result.failed).toEqual([]);
    expect(ensureFolderMock).toHaveBeenCalledWith('Projects/proj-1/01_Vertrag');
    expect(ensureFolderMock).toHaveBeenCalledWith('Projects/proj-1/02_Rechnungen');
  });

  it('collects per-folder failures without aborting the remaining folders', async () => {
    ensureFolderMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('WebDAV 500'))
      .mockResolvedValueOnce(undefined);

    const result = await materializeTemplate('proj-2', ['a', 'b', 'c']);
    expect(result.created).toEqual(['a', 'c']);
    expect(result.failed).toEqual([{ folder: 'b', error: 'WebDAV 500' }]);
  });

  it('stringifies a non-Error rejection as the failure message', async () => {
    ensureFolderMock.mockRejectedValueOnce('plain string failure');
    const result = await materializeTemplate('proj-3', ['only']);
    expect(result.failed).toEqual([{ folder: 'only', error: 'plain string failure' }]);
  });

  it('returns empty created/failed for an empty folder list', async () => {
    const result = await materializeTemplate('proj-4', []);
    expect(result).toEqual({ created: [], failed: [] });
    expect(ensureFolderMock).not.toHaveBeenCalled();
  });
});
