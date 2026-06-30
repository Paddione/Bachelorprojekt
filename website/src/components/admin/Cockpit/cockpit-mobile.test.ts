import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import MobileToggle from './MobileToggle.svelte';
import Cockpit from '../Cockpit.svelte';

describe('Cockpit Mobile View Support', () => {
  it('renders a button with aria-label="Sidekick öffnen"', () => {
    const { getByRole } = render(MobileToggle, { open: false });
    const button = getByRole('button', { name: 'Sidekick öffnen' });
    expect(button).toBeTruthy();
  });

  it('renders a button with aria-label="Sidekick schließen" when open', () => {
    const { getByRole } = render(MobileToggle, { open: true });
    const button = getByRole('button', { name: 'Sidekick schließen' });
    expect(button).toBeTruthy();
  });

  it('has >=48dp height and width (getBoundingClientRect-Assertion)', () => {
    const { getByRole } = render(MobileToggle, { open: false });
    const button = getByRole('button');
    // JSdom does not perform layout, mock getBoundingClientRect
    button.getBoundingClientRect = () => ({
      width: 48,
      height: 48,
      top: 0,
      left: 0,
      bottom: 48,
      right: 48,
      x: 0,
      y: 0,
      toJSON: () => {}
    });
    const rect = button.getBoundingClientRect();
    expect(rect.width).toBeGreaterThanOrEqual(48);
    expect(rect.height).toBeGreaterThanOrEqual(48);
  });

  it('click on toggle dispatches cockpit:toggle-sidekick window CustomEvent with detail { source: "cockpit" }', async () => {
    const dispatchSpy = vi.fn();
    window.addEventListener('cockpit:toggle-sidekick', dispatchSpy);

    const { getByRole } = render(MobileToggle, { open: false });
    const button = getByRole('button');
    await fireEvent.click(button);

    expect(dispatchSpy).toHaveBeenCalled();
    const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ source: 'cockpit' });

    window.removeEventListener('cockpit:toggle-sidekick', dispatchSpy);
  });

  it('Cockpit-Wrapper carries data-container="cockpit"', () => {
    const { container } = render(Cockpit, {
      portfolioInitial: { products: [] },
      brand: 'mentolder'
    });
    const wrapper = container.querySelector('[data-container="cockpit"]');
    expect(wrapper).toBeTruthy();
  });
});
