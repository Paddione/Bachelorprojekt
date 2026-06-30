import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: (...a: unknown[]) => mockCreate(...a) };
  },
}));

const getProviderConfig = vi.fn();
vi.mock('./provider-config', () => ({
  getProviderConfig: (...a: unknown[]) => getProviderConfig(...a),
}));

// The module-level constant `ANTHROPIC_API_KEY` is captured at import time.
// We pre-set it via vitest's env loader — this is the only reliable way in
// Vitest because `vi.mock` is hoisted before the test body runs.
vi.hoisted(() => {
  process.env.ANTHROPIC_API_KEY = 'k';
});

import { generateMeetingInsights } from './claude';
import * as loggerModule from './logger';

beforeEach(() => {
  mockCreate.mockReset();
  getProviderConfig.mockReset();
});

describe('claude.generateMeetingInsights', () => {
  it('parses the JSON out of a model response and returns the structured insights', async () => {
    getProviderConfig.mockResolvedValueOnce({ provider: 'anthropic', modelId: 'sonnet', apiKey: 'k', baseUrl: null });
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: 'Hier ist die Analyse: {"summary":"x","actionItems":"y","keyTopics":"a,b","sentiment":"good","coachingNotes":"n"}',
      }],
    });
    const out = await generateMeetingInsights({ customerName: 'C', meetingType: '1:1', transcript: 'hi' });
    expect(out).toEqual({
      summary: 'x', actionItems: 'y', keyTopics: 'a,b', sentiment: 'good', coachingNotes: 'n',
    });
  });

  it('returns null when no JSON object is found in the response', async () => {
    getProviderConfig.mockResolvedValueOnce({ provider: 'anthropic', modelId: 'sonnet', apiKey: 'k', baseUrl: null });
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'leider kein json hier' }] });
    const out = await generateMeetingInsights({ customerName: 'C', meetingType: '1:1', transcript: 'hi' });
    expect(out).toBeNull();
  });

  it('returns null and logs the error when the SDK throws', async () => {
    getProviderConfig.mockResolvedValueOnce({ provider: 'anthropic', modelId: 'sonnet', apiKey: 'k', baseUrl: null });
    mockCreate.mockRejectedValueOnce(new Error('upstream 500'));
    const errSpy = vi.spyOn(loggerModule.logger, 'error').mockReturnValue(undefined);
    const out = await generateMeetingInsights({ customerName: 'C', meetingType: '1:1', transcript: 'hi' });
    expect(out).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('appends the artifacts section to the prompt when provided', async () => {
    getProviderConfig.mockResolvedValueOnce({ provider: 'anthropic', modelId: 'sonnet', apiKey: 'k', baseUrl: null });
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"summary":"s","actionItems":"a","keyTopics":"k","sentiment":"g","coachingNotes":"c"}' }],
    });
    await generateMeetingInsights({
      customerName: 'C', meetingType: '1:1', transcript: 'transcript', artifacts: 'BOARD',
    });
    const req = mockCreate.mock.calls[0][0] as { messages: { content: string }[] };
    expect(req.messages[0].content).toContain('Whiteboard-Artefakte');
    expect(req.messages[0].content).toContain('BOARD');
  });

  it('clamps transcript to 30000 chars in the prompt', async () => {
    getProviderConfig.mockResolvedValueOnce({ provider: 'anthropic', modelId: 'sonnet', apiKey: 'k', baseUrl: null });
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"summary":"s","actionItems":"a","keyTopics":"k","sentiment":"g","coachingNotes":"c"}' }],
    });
    const long = 'x'.repeat(50000);
    await generateMeetingInsights({ customerName: 'C', meetingType: '1:1', transcript: long });
    const req = mockCreate.mock.calls[0][0] as { messages: { content: string }[] };
    const prompt = req.messages[0].content;
    expect(prompt).toContain('x'.repeat(30000));
    expect(prompt).not.toContain('x'.repeat(30001));
  });
});
