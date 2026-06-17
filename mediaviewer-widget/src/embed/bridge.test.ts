import { describe, it, expect, vi } from 'vitest';
import { createInboundHandler, emitEvent, type BridgeDeps, type GrillingSessionData } from './bridge';
import type { MediaviewerHandle } from '@videovault-player';

function makeHandle(): MediaviewerHandle {
  return {
    playVideo: vi.fn(),
    setPlaylist: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    getState: vi.fn(() => ({ current: null, state: 'idle' as const, currentTime: 0 })),
  };
}

function deps(overrides: Partial<BridgeDeps> = {}): BridgeDeps {
  return {
    getHandle: () => makeHandle(),
    setVideos: vi.fn(),
    setMode: vi.fn(),
    setGrillingData: vi.fn(),
    post: vi.fn(),
    allowedOrigins: ['https://portal.example'],
    ...overrides,
  };
}

const mockGrillingData: GrillingSessionData = {
  ticketId: 'T000942',
  questionnaireId: 'final-grilling-v1',
  questions: [{ id: 'q1', label: 'Test?', section: 'S1' }],
  hints: {},
  suggestions: {},
  existingAnswers: {},
  assets: [],
};

describe('createInboundHandler', () => {
  it('ruft setVideos bei type=setVideos von erlaubter Origin', () => {
    const setVideos = vi.fn();
    const d = deps({ setVideos });
    const handler = createInboundHandler(d);
    const videos = [{ id: 'a', url: 'blob:a', title: 'A', duration: 1 }];
    handler({ origin: 'https://portal.example', data: { type: 'setVideos', videos } } as MessageEvent);
    expect(setVideos).toHaveBeenCalledWith(videos);
  });

  it('delegiert playVideo an das Handle', () => {
    const handle = makeHandle();
    const handler = createInboundHandler(deps({ getHandle: () => handle }));
    handler({ origin: 'https://portal.example', data: { type: 'playVideo', id: 'x' } } as MessageEvent);
    expect(handle.playVideo).toHaveBeenCalledWith('x');
  });

  it('delegiert play/pause/seek', () => {
    const handle = makeHandle();
    const handler = createInboundHandler(deps({ getHandle: () => handle }));
    handler({ origin: 'https://portal.example', data: { type: 'play' } } as MessageEvent);
    handler({ origin: 'https://portal.example', data: { type: 'pause' } } as MessageEvent);
    handler({ origin: 'https://portal.example', data: { type: 'seek', sec: 12 } } as MessageEvent);
    expect(handle.play).toHaveBeenCalled();
    expect(handle.pause).toHaveBeenCalled();
    expect(handle.seek).toHaveBeenCalledWith(12);
  });

  it('delegiert setMode an deps.setMode', () => {
    const setMode = vi.fn();
    const handler = createInboundHandler(deps({ setMode }));
    handler({ origin: 'https://portal.example', data: { type: 'setMode', mode: 'grilling', ticketId: 'T000001' } } as MessageEvent);
    expect(setMode).toHaveBeenCalledWith('grilling', 'T000001');
  });

  it('delegiert setGrillingData an deps.setGrillingData', () => {
    const setGrillingData = vi.fn();
    const handler = createInboundHandler(deps({ setGrillingData }));
    handler({ origin: 'https://portal.example', data: { type: 'setGrillingData', data: mockGrillingData } } as MessageEvent);
    expect(setGrillingData).toHaveBeenCalledWith(mockGrillingData);
  });

  it('ignoriert Nachrichten von nicht erlaubter Origin', () => {
    const handle = makeHandle();
    const handler = createInboundHandler(deps({ getHandle: () => handle }));
    handler({ origin: 'https://evil.example', data: { type: 'playVideo', id: 'x' } } as MessageEvent);
    expect(handle.playVideo).not.toHaveBeenCalled();
  });

  it('ignoriert fremde/formlose Nachrichten ohne bekannten type', () => {
    const setVideos = vi.fn();
    const handler = createInboundHandler(deps({ setVideos }));
    handler({ origin: 'https://portal.example', data: { foo: 'bar' } } as MessageEvent);
    handler({ origin: 'https://portal.example', data: 'string-noise' } as unknown as MessageEvent);
    expect(setVideos).not.toHaveBeenCalled();
  });

  it('emitEvent postet grillingAnswer an den Parent', () => {
    const post = vi.fn();
    emitEvent(post, { type: 'grillingAnswer', questionId: 'q1', answer: 'Yes' });
    expect(post).toHaveBeenCalledWith({ type: 'grillingAnswer', questionId: 'q1', answer: 'Yes' });
  });

  it('emitEvent postet type+payload an den Parent', () => {
    const post = vi.fn();
    emitEvent(post, { type: 'select', id: 'v2' });
    expect(post).toHaveBeenCalledWith({ type: 'select', id: 'v2' });
  });
});
