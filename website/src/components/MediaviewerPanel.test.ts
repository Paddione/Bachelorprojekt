import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import MediaviewerPanel from './MediaviewerPanel.svelte';
import type { HelpVideo } from '../lib/help-videos';
import type { GrillingSessionData } from '../lib/tickets/final-grilling';

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

describe('MediaviewerPanel', () => {
  it('renders an iframe pointing at the embed entry of the configured host', () => {
    const { getByTitle } = render(MediaviewerPanel, { mediaviewerHost: 'mediaviewer.localhost', videos });
    const iframe = getByTitle('Mediaviewer') as HTMLIFrameElement;
    expect(iframe.tagName).toBe('IFRAME');
    expect(iframe.getAttribute('src')).toBe('https://mediaviewer.localhost/embed.html');
  });

  it('posts setVideos to the iframe once it has loaded', async () => {
    const { getByTitle } = render(MediaviewerPanel, { mediaviewerHost: 'mediaviewer.localhost', videos });
    const iframe = getByTitle('Mediaviewer') as HTMLIFrameElement;
    const post = vi.fn();
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: post }, configurable: true });
    await fireEvent.load(iframe);
    expect(post).toHaveBeenCalledWith(
      { type: 'setVideos', videos },
      'https://mediaviewer.localhost',
    );
  });

  it('posts setMode on load', async () => {
    const { getByTitle } = render(MediaviewerPanel, { mediaviewerHost: 'mediaviewer.localhost', videos, mode: 'video' });
    const iframe = getByTitle('Mediaviewer') as HTMLIFrameElement;
    const post = vi.fn();
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: post }, configurable: true });
    await fireEvent.load(iframe);
    expect(post).toHaveBeenCalledWith(
      { type: 'setMode', mode: 'video' },
      'https://mediaviewer.localhost',
    );
  });

  it('posts setMode and setGrillingData in grilling mode', async () => {
    const { getByTitle } = render(MediaviewerPanel, {
      mediaviewerHost: 'mediaviewer.localhost',
      videos,
      mode: 'grilling',
      grillingData: mockGrillingData,
    });
    const iframe = getByTitle('Mediaviewer') as HTMLIFrameElement;
    const post = vi.fn();
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: post }, configurable: true });
    await fireEvent.load(iframe);
    expect(post).toHaveBeenCalledWith(
      { type: 'setMode', mode: 'grilling', ticketId: 'T000942' },
      'https://mediaviewer.localhost',
    );
    expect(post).toHaveBeenCalledWith(
      { type: 'setGrillingData', data: mockGrillingData },
      'https://mediaviewer.localhost',
    );
  });

  it('invokes onGrillingAnswer when the widget posts grillingAnswer', () => {
    const onGrillingAnswer = vi.fn();
    render(MediaviewerPanel, { mediaviewerHost: 'mediaviewer.localhost', videos, onGrillingAnswer });
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'grillingAnswer', questionId: 'q1', answer: 'Yes' },
      origin: 'https://mediaviewer.localhost',
    }));
    expect(onGrillingAnswer).toHaveBeenCalledWith('q1', 'Yes');
  });

  it('invokes onGrillingComplete when the widget posts grillingComplete', () => {
    const onGrillingComplete = vi.fn();
    render(MediaviewerPanel, { mediaviewerHost: 'mediaviewer.localhost', videos, onGrillingComplete });
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'grillingComplete', answers: { q1: 'Yes' } },
      origin: 'https://mediaviewer.localhost',
    }));
    expect(onGrillingComplete).toHaveBeenCalledWith({ q1: 'Yes' });
  });

  it('invokes onSelect when the widget posts a valid select message from the widget origin', async () => {
    const onSelect = vi.fn();
    render(MediaviewerPanel, { mediaviewerHost: 'mediaviewer.localhost', videos, onSelect });
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'select', id: 'v1' },
      origin: 'https://mediaviewer.localhost',
    }));
    expect(onSelect).toHaveBeenCalledWith('v1');
  });

  it('ignores messages from a foreign origin', async () => {
    const onSelect = vi.fn();
    render(MediaviewerPanel, { mediaviewerHost: 'mediaviewer.localhost', videos, onSelect });
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'select', id: 'v1' },
      origin: 'https://evil.example',
    }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
