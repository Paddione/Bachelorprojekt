import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import PortalSidekick from './PortalSidekick.svelte';

describe('PortalSidekick — mediaviewer view', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));
  });

  it('opens the drawer and shows the Mediaviewer iframe after navigating', async () => {
    const { getByLabelText, getByText, getByTitle } = render(PortalSidekick, {
      helpContext: 'portal',
      mediaviewerHost: 'mediaviewer.localhost',
    });
    await fireEvent.click(getByLabelText('Sidekick öffnen'));
    await fireEvent.click(getByText('Mediaviewer'));
    const iframe = getByTitle('Mediaviewer') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe('https://mediaviewer.localhost/embed.html');
  });
});
