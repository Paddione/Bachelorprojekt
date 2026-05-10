// website/src/lib/coaching-classifier.test.ts
import { describe, it, expect, vi } from 'vitest';
import { classifyChunk } from './coaching-classifier';

function fakeClient(responses: string[]) {
  let i = 0;
  return {
    messages: {
      create: vi.fn(async () => {
        const text = responses[i++] ?? responses[responses.length - 1];
        return { content: [{ type: 'text', text }] };
      }),
    },
  } as any;
}

describe('classifyChunk', () => {
  it('returns reflection with valid payload', async () => {
    const client = fakeClient([
      JSON.stringify({ kind: 'reflection', payload: { title: 'Selbstwahrnehmung', question: 'Was bemerkst du gerade?', follow_up: null }, reason: 'reflexive Frage' }),
    ]);
    const r = await classifyChunk('Was bemerkst du in diesem Moment?', { client, model: 'test' });
    expect(r.kind).toBe('reflection');
    expect(r.payload?.question).toBe('Was bemerkst du gerade?');
    expect(r.model).toBe('test');
  });

  it('returns dialog_pattern with valid payload', async () => {
    const client = fakeClient([
      JSON.stringify({ kind: 'dialog_pattern', payload: { title: 'Spiegeln', coach_line: 'Du sagst gerade...', client_response_pattern: 'Klient bestätigt oder korrigiert', next_move: 'Vertiefen' } }),
    ]);
    const r = await classifyChunk('...', { client, model: 'test' });
    expect(r.kind).toBe('dialog_pattern');
  });

  it('returns exercise with phases array', async () => {
    const client = fakeClient([
      JSON.stringify({ kind: 'exercise', payload: { title: 'Atemübung', phases: [{ name: 'Einleitung', instruction: 'Augen schließen' }], duration_min: 5 } }),
    ]);
    const r = await classifyChunk('...', { client, model: 'test' });
    expect(r.kind).toBe('exercise');
    expect((r.payload as any).phases).toHaveLength(1);
  });

  it('returns case_example with summary', async () => {
    const client = fakeClient([
      JSON.stringify({ kind: 'case_example', payload: { title: 'Klient A', summary: 'Klient A kam mit Konflikt zwischen Karriere und Familie und entwickelte über drei Sitzungen...', client_archetype: 'Karriere-Wechsler' } }),
    ]);
    const r = await classifyChunk('...', { client, model: 'test' });
    expect(r.kind).toBe('case_example');
  });

  it('passes theory through with null payload', async () => {
    const client = fakeClient([JSON.stringify({ kind: 'theory', reason: 'Hintergrund' })]);
    const r = await classifyChunk('...', { client, model: 'test' });
    expect(r.kind).toBe('theory');
    expect(r.payload).toBeNull();
  });

  it('passes noise through with null payload', async () => {
    const client = fakeClient([JSON.stringify({ kind: 'noise' })]);
    const r = await classifyChunk('...', { client, model: 'test' });
    expect(r.kind).toBe('noise');
    expect(r.payload).toBeNull();
  });

  it('retries once on malformed first response', async () => {
    const client = fakeClient([
      'no json here at all',
      JSON.stringify({ kind: 'theory' }),
    ]);
    const r = await classifyChunk('...', { client, model: 'test' });
    expect(r.kind).toBe('theory');
    expect(client.messages.create).toHaveBeenCalledTimes(2);
  });

  it('throws after second failure', async () => {
    const client = fakeClient(['bad', 'still bad']);
    await expect(classifyChunk('...', { client, model: 'test' })).rejects.toThrow();
  });

  it('rejects payload that violates schema', async () => {
    const client = fakeClient([
      JSON.stringify({ kind: 'reflection', payload: { title: 'x' /* too short */, question: 'too short' } }),
      JSON.stringify({ kind: 'noise' }),
    ]);
    const r = await classifyChunk('...', { client, model: 'test' });
    expect(r.kind).toBe('noise');
  });
});
