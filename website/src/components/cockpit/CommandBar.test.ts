import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
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
