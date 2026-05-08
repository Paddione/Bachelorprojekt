import { describe, it, expect } from 'vitest';
import {
  getOrCreateActiveConversation,
  appendMessage,
  loadHistory,
} from './conversations';

// NOTE: integration test — requires shared-db. Not run in CI.
// To run locally: task workspace:port-forward ENV=mentolder, then:
//   DATABASE_URL='postgresql://website:devwebsitedb@localhost:5432/website' \
//     npx vitest run src/lib/assistant/conversations.test.ts
describe.skip('assistant_conversations (integration)', () => {
  it('creates a conversation and appends messages in order', async () => {
    const userSub = `test-user-${Date.now()}`;
    const conv = await getOrCreateActiveConversation(userSub, 'admin');
    expect(conv.id).toBeDefined();

    await appendMessage(conv.id, 'user', 'hallo');
    await appendMessage(conv.id, 'assistant', 'hi');

    const history = await loadHistory(conv.id);
    expect(history.map((m) => m.content)).toEqual(['hallo', 'hi']);
  });
});
