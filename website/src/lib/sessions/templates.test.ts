import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../website-db', () => ({
  pool: { query: vi.fn(), end: vi.fn() },
}));
vi.mock('../logger', () => ({
  logger: { error: vi.fn() },
}));
import { pool } from '../website-db';
import { logger } from '../logger';
import { DEFAULT_TEMPLATES, listTemplates, cloneTemplate, deleteTemplate } from './templates';

describe('DEFAULT_TEMPLATES', () => {
  it('contains exactly 5 templates', () => {
    expect(DEFAULT_TEMPLATES).toHaveLength(5);
  });

  it('all defaults have is_default=true and owner_id=null', () => {
    for (const t of DEFAULT_TEMPLATES) {
      expect(t.is_default).toBe(true);
      expect(t.owner_id).toBeNull();
    }
  });

  it('slugs match: feature-intake, retro, grilling, workshop, spezifikation', () => {
    const slugs = DEFAULT_TEMPLATES.map(t => t.slug).sort();
    expect(slugs).toEqual(['feature-intake', 'grilling', 'retro', 'spezifikation', 'workshop']);
  });
});

describe('listTemplates — DB fallback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('falls back to DEFAULT_TEMPLATES when DB query throws', async () => {
    vi.mocked(pool.query).mockRejectedValue(new Error('connection refused'));
    const result = await listTemplates('user-123');
    expect(result).toHaveLength(5);
    expect(result[0].is_default).toBe(true);
  });

  it('logs the DB error instead of swallowing it silently (T001671)', async () => {
    vi.mocked(pool.query).mockRejectedValue(new Error('connection refused'));
    await listTemplates('user-123');
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('returns DB rows when query succeeds', async () => {
    const dbRows = [
      { id: 'a', slug: 'feature-intake', title: 'Feature-Intake', body_markdown: '# x',
        is_default: true, owner_id: null, created_from_template_id: null },
      { id: 'b', slug: 'my-custom', title: 'My Custom', body_markdown: '# y',
        is_default: false, owner_id: 'user-123', created_from_template_id: 'a' },
    ];
    vi.mocked(pool.query).mockResolvedValue({ rows: dbRows } as unknown as Awaited<ReturnType<typeof pool.query>>);
    const result = await listTemplates('user-123');
    expect(result).toHaveLength(2);
    expect(result[1].slug).toBe('my-custom');
  });
});

describe('cloneTemplate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when templateId not found', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as unknown as Awaited<ReturnType<typeof pool.query>>);
    await expect(cloneTemplate('nonexistent', 'user-123', {}))
      .rejects.toThrow('template not found');
  });
});

describe('deleteTemplate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when trying to delete a default template', async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{ id: 'a', is_default: true, owner_id: null }],
    } as unknown as Awaited<ReturnType<typeof pool.query>>);
    await expect(deleteTemplate('a', 'user-123'))
      .rejects.toThrow('cannot delete default template');
  });

  it('throws when template belongs to another user', async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{ id: 'b', is_default: false, owner_id: 'other-user' }],
    } as unknown as Awaited<ReturnType<typeof pool.query>>);
    await expect(deleteTemplate('b', 'user-123'))
      .rejects.toThrow('not owner');
  });
});
