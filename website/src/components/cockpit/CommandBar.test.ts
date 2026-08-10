import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import CommandBar from './CommandBar.svelte';

describe('CommandBar', () => {
  const defaultProps = {
    brand: 'mentolder',
    initialMode: 'overview' as const,
  };

  it('renders the brand name', () => {
    const { getByText } = render(CommandBar, { props: defaultProps });
    expect(getByText('mentolder')).toBeTruthy();
  });

  it('shows cluster health indicator', () => {
    const { container } = render(CommandBar, { props: defaultProps });
    // The PilotLight component renders with role="status"
    const statusElements = container.querySelectorAll('[role="status"]');
    expect(statusElements.length).toBeGreaterThan(0);
  });

  it('shows slot usage', () => {
    const { container } = render(CommandBar, { props: defaultProps });
    // Slot usage badge should be present
    const badges = container.querySelectorAll('.command-bar__badge');
    const slotBadge = Array.from(badges).find(
      (el) => el.textContent?.includes('/'),
    );
    expect(slotBadge).toBeTruthy();
  });

  it('renders Overview/Fokus/Insights toggle buttons', () => {
    const { getByText } = render(CommandBar, { props: defaultProps });
    expect(getByText('Übersicht')).toBeTruthy();
    expect(getByText('Fokus')).toBeTruthy();
    expect(getByText('Insights')).toBeTruthy();
  });

  it('Overview button is active when initialMode is overview', () => {
    const { getByText } = render(CommandBar, { props: defaultProps });
    const overviewBtn = getByText('Übersicht');
    expect(overviewBtn.classList.contains('active')).toBe(true);
  });

  it('renders with fokus initial mode', () => {
    const { getByText } = render(CommandBar, {
      props: { ...defaultProps, initialMode: 'fokus' as const },
    });
    const fokusBtn = getByText('Fokus');
    expect(fokusBtn.classList.contains('active')).toBe(true);
  });

  it('renders the tick countdown area', () => {
    const { container } = render(CommandBar, { props: defaultProps });
    const tickElements = container.querySelectorAll('.command-bar__tick');
    expect(tickElements.length).toBeGreaterThan(0);
  });
});

// Regressionsschutz. Die erste Fassung dispatchte das Mode-Change-Event auf
// einem per document.createElement erzeugten, nirgends eingehaengten <div>.
// Ein Event bubbelt nur bis zur Wurzel seines EIGENEN Baums — der Listener in
// cockpit.astro haengt an `document` und feuerte deshalb nie: der Umschalter
// war tot, obwohl das gerenderte HTML vollstaendig korrekt aussah.
describe('CommandBar — Modus-Umschaltung', () => {
  const listeners: Array<(e: Event) => void> = [];

  function onModeChange(fn: (e: Event) => void) {
    listeners.push(fn);
    document.addEventListener('cockpit-modechange', fn);
  }

  afterEach(() => {
    listeners.splice(0).forEach((fn) => document.removeEventListener('cockpit-modechange', fn));
    vi.restoreAllMocks();
  });

  it('meldet den Moduswechsel an document — nicht an einen losen Knoten', async () => {
    const seen = vi.fn();
    onModeChange((e) => seen((e as CustomEvent).detail));

    const { getByText } = render(CommandBar, {
      props: { brand: 'mentolder', initialMode: 'overview' as const },
    });
    await fireEvent.click(getByText('Insights'));

    expect(seen).toHaveBeenCalledWith({ mode: 'insights' });
  });

  it('markiert den geklickten Modus als aktiv', async () => {
    const { getByText } = render(CommandBar, {
      props: { brand: 'mentolder', initialMode: 'overview' as const },
    });
    const fokus = getByText('Fokus');
    expect(fokus.getAttribute('aria-selected')).toBe('false');

    await fireEvent.click(fokus);

    expect(fokus.getAttribute('aria-selected')).toBe('true');
    expect(getByText('Übersicht').getAttribute('aria-selected')).toBe('false');
  });

  it('schreibt den Modus in die URL und raeumt phase ausserhalb von Fokus ab', async () => {
    window.history.replaceState({}, '', '/sdlc/cockpit?mode=fokus&phase=bauen');

    const { getByText } = render(CommandBar, {
      props: { brand: 'mentolder', initialMode: 'fokus' as const },
    });
    await fireEvent.click(getByText('Insights'));

    const url = new URL(window.location.href);
    expect(url.searchParams.get('mode')).toBe('insights');
    expect(url.searchParams.has('phase')).toBe(false);
  });

  it('behaelt phase beim Wechsel zurueck nach Fokus', async () => {
    window.history.replaceState({}, '', '/sdlc/cockpit?mode=fokus&phase=review');

    const { getByText } = render(CommandBar, {
      props: { brand: 'mentolder', initialMode: 'overview' as const },
    });
    await fireEvent.click(getByText('Fokus'));

    const url = new URL(window.location.href);
    expect(url.searchParams.get('mode')).toBe('fokus');
    expect(url.searchParams.get('phase')).toBe('review');
  });
});
