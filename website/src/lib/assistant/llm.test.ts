import { describe, it, expect } from 'vitest';
import { assistantChat } from './llm';

describe('assistantChat (no-LLM keyword fallback)', () => {
  it('returns a help-section reply when a known keyword is in the query', async () => {
    const result = await assistantChat({
      profile: 'admin',
      userSub: 'user-123',
      messages: [{ role: 'user', content: 'wie finalisiere ich ein meeting?' }],
      context: { currentRoute: '/admin/meetings' },
    });
    // Admin "Meetings" section should match. The reply is the formatted hit
    // (starts with the section title, possibly preceded by a glyph).
    expect(result.reply.toLowerCase()).toContain('meeting');
    expect(result.proposedAction).toBeUndefined();
  });

  it('falls back to a discovery reply when nothing matches', async () => {
    const result = await assistantChat({
      profile: 'portal',
      userSub: 'u',
      messages: [{ role: 'user', content: 'qwerty asdf zzz' }],
      context: { currentRoute: '/portal' },
    });
    expect(result.reply).toMatch(/keinen passenden|Stichworten/i);
  });

  it('handles an empty conversation gracefully', async () => {
    const result = await assistantChat({
      profile: 'portal',
      userSub: 'u',
      messages: [],
      context: { currentRoute: '/portal' },
    });
    expect(result.reply).toMatch(/Frag mich/);
  });
});

import { vi, beforeEach } from 'vitest';
import { resolveCoachingCollectionIds, __resetCacheForTests } from './coaching-collections';
import { Pool } from 'pg';

describe('resolveCoachingCollectionIds', () => {
  beforeEach(() => {
    __resetCacheForTests();
  });

  it('returns collection IDs from coaching.books joined to knowledge.collections', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ collection_id: 'abc-123' }, { collection_id: 'def-456' }],
      }),
    } as unknown as Pool;

    const ids = await resolveCoachingCollectionIds(mockPool);
    expect(ids).toEqual(['abc-123', 'def-456']);
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });

  it('uses cached result on second call within 60s', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [{ collection_id: 'abc-123' }] }),
    } as unknown as Pool;

    await resolveCoachingCollectionIds(mockPool);
    await resolveCoachingCollectionIds(mockPool);
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when no books exist', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as unknown as Pool;

    const ids = await resolveCoachingCollectionIds(mockPool);
    expect(ids).toEqual([]);
  });
});
