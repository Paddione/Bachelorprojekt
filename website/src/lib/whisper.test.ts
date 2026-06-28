import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), child: vi.fn() },
  createRequestLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() })),
}));
import { transcribeAudio, formatTranscript, type TranscriptionResult } from './whisper';

describe('formatTranscript', () => {
  it('returns plain text when there are no segments', () => {
    const r: TranscriptionResult = { text: 'Hello world', language: 'de', duration: 1.5 };
    expect(formatTranscript(r)).toBe('Hello world');
  });

  it('returns plain text when segments are an empty array', () => {
    const r: TranscriptionResult = { text: 'Hello world', language: 'de', duration: 1.5, segments: [] };
    expect(formatTranscript(r)).toBe('Hello world');
  });

  it('prefixes each segment with a [mm:ss] timestamp', () => {
    const r: TranscriptionResult = {
      text: 'Hello world',
      language: 'de',
      duration: 65,
      segments: [
        { start: 0, end: 2, text: 'Hello' },
        { start: 62, end: 65, text: 'world' },
      ],
    };
    const out = formatTranscript(r);
    expect(out).toContain('[0:00] Hello');
    expect(out).toContain('[1:02] world');
  });

  it('zero-pads the seconds field', () => {
    const r: TranscriptionResult = {
      text: 'x',
      language: 'de',
      duration: 1,
      segments: [{ start: 5, end: 6, text: 'hi' }],
    };
    expect(formatTranscript(r)).toContain('[0:05] hi');
  });
});

describe('transcribeAudio (network failure path)', () => {
  const ORIGINAL_FETCH = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it('returns null on a non-OK response', async () => {
    globalThis.fetch = (async () =>
      new Response('boom', { status: 500 })) as typeof fetch;
    const out = await transcribeAudio(Buffer.from('abc'), 'clip.wav', 'de');
    expect(out).toBeNull();
  });

  it('returns null when the fetch throws', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network down');
    }) as typeof fetch;
    const out = await transcribeAudio(Buffer.from('abc'), 'clip.wav', 'de');
    expect(out).toBeNull();
  });

  it('parses a successful response into a TranscriptionResult', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          text: 'hello world',
          language: 'en',
          duration: 2.5,
          segments: [{ start: 0, end: 1, text: 'hello' }, { start: 1, end: 2, text: 'world' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch;
    const out = await transcribeAudio(Buffer.from('abc'), 'clip.wav', 'en');
    expect(out).not.toBeNull();
    expect(out?.text).toBe('hello world');
    expect(out?.language).toBe('en');
    expect(out?.duration).toBe(2.5);
    expect(out?.segments).toHaveLength(2);
  });
});
