import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import NavMobile from './NavMobile.svelte';

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
