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
