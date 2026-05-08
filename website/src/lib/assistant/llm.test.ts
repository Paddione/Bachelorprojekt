import { describe, it, expect } from 'vitest';
import { assistantChat } from './llm';

describe('assistantChat (stub)', () => {
  it('returns a deterministic placeholder reply when no LLM is wired', async () => {
    const result = await assistantChat({
      profile: 'admin',
      userSub: 'user-123',
      messages: [{ role: 'user', content: 'wie finalisiere ich ein meeting?' }],
      context: { currentRoute: '/admin/meetings', counts: { unfinalizedMeetings: 3 } },
    });
    expect(result.reply).toContain('LLM nicht verbunden');
    expect(result.proposedAction).toBeUndefined();
  });
});
