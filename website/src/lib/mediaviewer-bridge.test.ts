import { describe, it, expect } from 'vitest';
import { buildSetVideosMessage, buildSetModeMessage, buildSetGrillingDataMessage, parseOutbound } from './mediaviewer-bridge';
import type { HelpVideo } from './help-videos';
import type { GrillingSessionData } from './tickets/final-grilling';

const videos: HelpVideo[] = [{ id: 'v1', url: 'https://x/v.mp4', title: 'T', duration: 10 }];

const mockGrillingData: GrillingSessionData = {
  ticketId: 'T000942',
  questionnaireId: 'final-grilling-v1',
  questions: [{ id: 'q1', label: 'Test?', section: 'S1' }],
  hints: {},
  suggestions: {},
  existingAnswers: {},
  assets: [],
};

describe('buildSetVideosMessage', () => {
  it('wraps videos in the inbound setVideos envelope', () => {
    expect(buildSetVideosMessage(videos)).toEqual({ type: 'setVideos', videos });
  });
});

describe('buildSetModeMessage', () => {
  it('builds setMode for video mode', () => {
    expect(buildSetModeMessage('video')).toEqual({ type: 'setMode', mode: 'video' });
  });
  it('builds setMode for grilling mode with ticketId', () => {
    expect(buildSetModeMessage('grilling', 'T000001')).toEqual({ type: 'setMode', mode: 'grilling', ticketId: 'T000001' });
  });
  it('builds setMode for brainstorm mode with ticketId', () => {
    expect(buildSetModeMessage('brainstorm', 'T000001')).toEqual({ type: 'setMode', mode: 'brainstorm', ticketId: 'T000001' });
  });
});

describe('buildSetGrillingDataMessage', () => {
  it('wraps GrillingSessionData in setGrillingData envelope', () => {
    expect(buildSetGrillingDataMessage(mockGrillingData)).toEqual({ type: 'setGrillingData', data: mockGrillingData });
  });
});

describe('parseOutbound', () => {
  it('accepts a well-formed select message', () => {
    expect(parseOutbound({ type: 'select', id: 'v1' })).toEqual({ type: 'select', id: 'v1' });
  });
  it('accepts progress with a numeric sec', () => {
    expect(parseOutbound({ type: 'progress', sec: 4.2 })).toEqual({ type: 'progress', sec: 4.2 });
  });
  it('accepts an error message', () => {
    expect(parseOutbound({ type: 'error', id: 'v1', message: 'boom' })).toEqual({ type: 'error', id: 'v1', message: 'boom' });
  });
  it('accepts grillingAnswer', () => {
    expect(parseOutbound({ type: 'grillingAnswer', questionId: 'q1', answer: 'Yes' }))
      .toEqual({ type: 'grillingAnswer', questionId: 'q1', answer: 'Yes' });
  });
  it('accepts grillingDismiss', () => {
    expect(parseOutbound({ type: 'grillingDismiss', questionId: 'q3' }))
      .toEqual({ type: 'grillingDismiss', questionId: 'q3' });
  });
  it('accepts grillingComplete', () => {
    expect(parseOutbound({ type: 'grillingComplete', answers: { q1: 'Yes' } }))
      .toEqual({ type: 'grillingComplete', answers: { q1: 'Yes' } });
  });
  it('accepts sessionStarted', () => {
    expect(parseOutbound({ type: 'sessionStarted', sessionType: 'brainstorm-v1', sessionId: 's1' }))
      .toEqual({ type: 'sessionStarted', sessionType: 'brainstorm-v1', sessionId: 's1' });
    expect(parseOutbound({ type: 'sessionStarted', sessionType: 'brainstorm-v1' }))
      .toEqual({ type: 'sessionStarted', sessionType: 'brainstorm-v1' });
  });
  it('accepts sessionProgress', () => {
    expect(parseOutbound({ type: 'sessionProgress', sessionType: 'brainstorm-v1', answeredCount: 2, totalCount: 9 }))
      .toEqual({ type: 'sessionProgress', sessionType: 'brainstorm-v1', answeredCount: 2, totalCount: 9 });
  });
  it('rejects sessionStarted without sessionType and sessionProgress with non-numeric counts', () => {
    expect(parseOutbound({ type: 'sessionStarted' })).toBeNull();
    expect(parseOutbound({ type: 'sessionProgress', sessionType: 'b', answeredCount: 'x', totalCount: 9 })).toBeNull();
  });
  it('returns null for unknown types', () => {
    expect(parseOutbound({ type: 'setVideos', videos: [] })).toBeNull();
    expect(parseOutbound({ type: 'setMode', mode: 'grilling' })).toBeNull();
    expect(parseOutbound({ foo: 'bar' })).toBeNull();
    expect(parseOutbound(null)).toBeNull();
    expect(parseOutbound('select')).toBeNull();
  });
  it('returns null when required fields are missing/mistyped', () => {
    expect(parseOutbound({ type: 'select' })).toBeNull();
    expect(parseOutbound({ type: 'progress', sec: 'x' })).toBeNull();
    expect(parseOutbound({ type: 'error', id: 'v1' })).toBeNull();
    expect(parseOutbound({ type: 'grillingAnswer', questionId: 'q1' })).toBeNull();
    expect(parseOutbound({ type: 'grillingDismiss' })).toBeNull();
    expect(parseOutbound({ type: 'grillingComplete' })).toBeNull();
  });
});
