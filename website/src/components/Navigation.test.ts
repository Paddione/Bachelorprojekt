import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import NavMobile from './NavMobile.svelte';
import Navigation from './Navigation.svelte';

describe('Navigation.svelte — brand link accessible name (WCAG 2.5.3, T002053)', () => {
  it('does not override the brand link accessible name with a redundant aria-label', () => {
    // The brand link renders its label from visible text (`{brandWord}.`).
    // An explicit aria-label duplicating that text triggers axe
    // `label-content-name-mismatch` (WCAG 2.5.3): the accessible name is not
    // reliably recognised as containing the composite visible text. Removing it
    // lets the accessible name derive from the visible text, so it can never
    // mismatch itself.
    const { container } = render(Navigation, { props: { siteTitle: 'mentolder.de' } });
    const brand = container.querySelector('a.brand');
    expect(brand).toBeTruthy();

    // The visible label must be present so the accessible name can derive from it.
    const visible = (brand!.querySelector('.brand-name')?.textContent ?? '').trim();
    expect(visible.length).toBeGreaterThan(0);

    // No redundant explicit aria-label: the accessible name is computed from the
    // visible text, so axe's label-content-name-mismatch can no longer fire.
    expect(brand!.getAttribute('aria-label')).toBeNull();
  });
});

describe('NavMobile.svelte', () => {
  const baseProps = {
    open: true,
    links: [
      { label: 'Angebote', href: '/#angebote' },
      { label: 'Über mich', href: '/ueber-mich' },
      { label: 'Kontakt', href: '/kontakt' },
    ],
    locale: 'de' as const,
    pathname: '/',
    user: null,
    authChecked: false,
    streamLive: false,
  };

  it('renders the link list when open is true', () => {
    const { container, getByText } = render(NavMobile, { props: baseProps });
    expect(container.querySelector('.mobile-menu')).toBeTruthy();
    expect(getByText('Angebote')).toBeTruthy();
    expect(getByText('Über mich')).toBeTruthy();
    expect(getByText('Kontakt')).toBeTruthy();
  });

  it('does not render when open is false', () => {
    const { container } = render(NavMobile, { props: { ...baseProps, open: false } });
    expect(container.querySelector('.mobile-menu')).toBeNull();
  });

  it('hides internal links behind a divider when authenticated', () => {
    const { container, getByText } = render(NavMobile, {
      props: {
        ...baseProps,
        authChecked: true,
        user: { name: 'Test User', email: 'test@example.com' },
      },
    });
    expect(container.querySelector('.mobile-divider')).toBeTruthy();
    expect(getByText('Test User')).toBeTruthy();
  });

  it('shows the "Anmelden"/login link when not authenticated', () => {
    const { getAllByText } = render(NavMobile, {
      props: { ...baseProps, authChecked: true, user: null },
    });
    // Multiple login links can appear (top + mobile menu); just assert at least one exists.
    expect(getAllByText(/Anmelden|Login|Register|Registrieren/).length).toBeGreaterThan(0);
  });
});
