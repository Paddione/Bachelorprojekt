import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import MediaviewerPanel from './MediaviewerPanel.svelte';
import type { HelpVideo } from '../lib/help-videos';

const videos: HelpVideo[] = [{ id: 'v1', url: 'https://x/v.mp4', title: 'T', duration: 10 }];

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
