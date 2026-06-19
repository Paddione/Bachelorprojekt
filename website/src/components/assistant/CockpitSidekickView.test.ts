import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import CockpitSidekickView from './CockpitSidekickView.svelte';
import { selectFeature } from '../../lib/stores/cockpitStore';

const portfolio = {
  products: [{
    id: 'p1', extId: 'p1', title: 'Produkt Alpha',
    rollup: { total: 4, done: 0, blocked: 0, inProgress: 1, awaitingDeploy: 0, open: 3, pctDone: 0 },
    features: [
      { id: 'f1', extId: 'F-AUTH', title: 'Auth', priority: 'hoch', health: 'amber' as const,
        rollup: { total: 4, done: 0, blocked: 0, inProgress: 1, awaitingDeploy: 0, open: 3, pctDone: 0 },
        nextStep: false, discarded: false, majorFeature: false, synthetic: false },
      { id: 'f2', extId: 'F-CRM', title: 'CRM', priority: 'mittel', health: 'green' as const,
        rollup: { total: 2, done: 2, blocked: 0, inProgress: 0, awaitingDeploy: 0, open: 0, pctDone: 100 },
        nextStep: false, discarded: false, majorFeature: false, synthetic: false },
    ],
  }],
};

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
  selectFeature(null);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/api/admin/cockpit/portfolio')) {
      return new Response(JSON.stringify(portfolio), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('CockpitSidekickView', () => {
  it('rendert Produkt-Überschrift und Feature-Zeilen nach Fetch (activeOnly filtert CRM mit open=0 aus)', async () => {
    const { findByText, getAllByTestId } = render(CockpitSidekickView);
    expect(await findByText('Produkt Alpha')).toBeTruthy();
    const feats = getAllByTestId('csv-feature');
    expect(feats).toHaveLength(1);
  });

  it('zeigt nur Features mit offener Arbeit wenn activeOnly=true (Standard)', async () => {
    const { findByText, queryByText } = render(CockpitSidekickView);
    await findByText('Auth');
    expect(queryByText('CRM')).toBeNull();
  });

  it('zeigt alle Features wenn activeOnly=false', async () => {
    const { findByText, getByTestId } = render(CockpitSidekickView);
    await findByText('Auth');
    await fireEvent.click(getByTestId('csv-active-only'));
    expect(await findByText('CRM')).toBeTruthy();
  });

  it('filtert Features per Suchfeld', async () => {
    const { findByText, getByTestId, queryByText } = render(CockpitSidekickView);
    await findByText('Auth');
    await fireEvent.click(getByTestId('csv-active-only'));
    await waitFor(() => expect(queryByText('CRM')).toBeTruthy());
    await fireEvent.input(getByTestId('csv-filter'), { target: { value: 'Auth' } });
    expect(queryByText('CRM')).toBeNull();
  });

  it('dispatcht cockpit:feature-selected wenn Feature angeklickt (auf /admin/cockpit)', async () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/admin/cockpit', href: 'http://localhost/admin/cockpit' },
      writable: true,
    });
    const events: CustomEvent[] = [];
    window.addEventListener('cockpit:feature-selected', (e) => events.push(e as CustomEvent));
    const { findByText } = render(CockpitSidekickView);
    await fireEvent.click(await findByText('Auth'));
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].detail.extId).toBe('F-AUTH');
  });

  it('dispatcht cockpit:portfolio-mutated nach Feature-Aktion', async () => {
    const mutatedEvents: Event[] = [];
    window.addEventListener('cockpit:portfolio-mutated', (e) => mutatedEvents.push(e));
    vi.stubGlobal('fetch', vi.fn(async (url: string, opts?: RequestInit) => {
      if (String(url).includes('feature-action') && opts?.method === 'POST') {
        return new Response('{}', { status: 200 });
      }
      return new Response(JSON.stringify(portfolio), { status: 200 });
    }));
    const { findAllByTestId } = render(CockpitSidekickView);
    const nextBtns = await findAllByTestId('csv-action-next');
    await fireEvent.click(nextBtns[0]);
    await waitFor(() => expect(mutatedEvents.length).toBeGreaterThan(0));
  });

  it('collapsed state persistiert in localStorage', async () => {
    const { findByTestId } = render(CockpitSidekickView);
    const toggle = await findByTestId('csv-product-toggle');
    await fireEvent.click(toggle);
    const raw = localStorage.getItem('cockpit:collapsed');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as string[];
    expect(parsed).toContain('p1');
  });

  it('activeOnly persistiert in localStorage', async () => {
    const { findByTestId } = render(CockpitSidekickView);
    await findByTestId('csv-active-only');
    await fireEvent.click(await findByTestId('csv-active-only'));
    expect(localStorage.getItem('cockpit:activeOnly')).toBe('0');
  });

  it('refetcht Portfolio bei cockpit:portfolio-mutated Event', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/admin/cockpit/portfolio')) callCount++;
      return new Response(JSON.stringify(portfolio), { status: 200 });
    }));
    const { findByText } = render(CockpitSidekickView);
    await findByText('Produkt Alpha');
    const before = callCount;
    window.dispatchEvent(new Event('cockpit:portfolio-mutated'));
    await waitFor(() => expect(callCount).toBeGreaterThan(before));
  });
});
