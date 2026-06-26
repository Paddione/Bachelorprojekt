import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '@/App';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

describe('Routing', () => {
  it('renders ueber-mich page at /ueber-mich', () => {
    renderAt('/ueber-mich');
    expect(screen.getByRole('heading', { name: /Mein Weg/i })).toBeInTheDocument();
  });

  it('renders leistungen page at /leistungen', () => {
    renderAt('/leistungen');
    expect(screen.getByRole('heading', { name: /Was ich anbiete/i })).toBeInTheDocument();
  });

  it('renders leistung detail at /leistungen/fuehrung', () => {
    renderAt('/leistungen/fuehrung');
    expect(screen.getByRole('link', { name: /Alle Leistungen/i })).toBeInTheDocument();
  });

  it('renders referenzen page at /referenzen', () => {
    renderAt('/referenzen');
    expect(screen.getByRole('heading', { name: /die mir vertrauen/i })).toBeInTheDocument();
  });
});

describe('Navigation', () => {
  it('contains a link to /#angebote', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: 'Angebote' })).toHaveAttribute('href', '/#angebote');
  });

  it('does not contain a "Leistungen" label in the primary navigation', () => {
    renderAt('/');
    expect(screen.queryByRole('link', { name: 'Leistungen' })).not.toBeInTheDocument();
  });
});
