import { render, screen } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import CentralizedLoggingPanel from './CentralizedLoggingPanel.svelte';

describe('CentralizedLoggingPanel', () => {
  it('renders one link per Grafana dashboard with the correct UID path', () => {
    render(CentralizedLoggingPanel, { props: { grafanaUrl: 'http://grafana.test' } });
    const expected: Record<string, string> = {
      'Log Explorer': 'http://grafana.test/d/log-explorer',
      'API Error Tracker': 'http://grafana.test/d/api-errors',
      'Traefik Access Analytics': 'http://grafana.test/d/traefik-access',
      'Keycloak Audit Trail': 'http://grafana.test/d/keycloak-audit',
    };
    for (const [name, href] of Object.entries(expected)) {
      const link = screen.getByRole('link', { name: new RegExp(name, 'i') }) as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe(href);
    }
  });

  it('opens every dashboard in a new tab with noopener', () => {
    render(CentralizedLoggingPanel, { props: { grafanaUrl: 'http://grafana.test' } });
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(4);
    for (const link of links) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });
});
