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
    expect(iframe.getAttribute('src')).toBe('https://mediaviewer.localhost/embed.html?v=mediaviewer.localhost');
  });
});

describe('PortalSidekick — terminal view', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));
  });

  it('shows the Terminal iframe when navigating to terminal view', async () => {
    const { getByLabelText, getByText, getByTitle } = render(PortalSidekick, {
      helpContext: 'admin',
      terminalHost: 'terminal.localhost',
    });
    await fireEvent.click(getByLabelText('Sidekick öffnen'));
    await fireEvent.click(getByText('Agentic Terminal'));
    const iframe = getByTitle('Agentic Terminal') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe('https://terminal.localhost/');
  });
});

describe('PortalSidekick — agent-settings view', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ authenticated: true, user: { givenName: 'Admin' } }),
        });
      }
      if (url.includes('/api/admin/factory-control')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            killSwitch: false,
            contextBudget: 180000,
            spawnHarness: false,
            lavishDelegation: false,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    });
  });

  it('shows the Agenten-Einstellungen panel when navigated', async () => {
    const { getByLabelText, getByText, findByText } = render(PortalSidekick, {
      helpContext: 'admin',
    });
    await fireEvent.click(getByLabelText('Sidekick öffnen'));
    await fireEvent.click(getByText('Agenten-Einstellungen'));
    
    // Check for title and setting labels
    expect(await findByText('Agenten-Einstellungen')).toBeTruthy();
    expect(await findByText('Token-Budget')).toBeTruthy();
    expect(await findByText('opencode Spawn Harness')).toBeTruthy();
    expect(await findByText('Lavish HTML Delegation Review')).toBeTruthy();
    expect(await findByText('Master Kill-Switch (Alle Agenten)')).toBeTruthy();
  });
});
