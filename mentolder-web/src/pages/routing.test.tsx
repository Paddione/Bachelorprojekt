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
    expect(screen.getByTestId('ueber-mich-page')).toBeInTheDocument();
  });

  it('renders leistungen page at /leistungen', () => {
    renderAt('/leistungen');
    expect(screen.getByTestId('leistungen-page')).toBeInTheDocument();
  });

  it('renders leistung detail at /leistungen/fuehrung', () => {
    renderAt('/leistungen/fuehrung');
    expect(screen.getByTestId('leistung-detail-page')).toBeInTheDocument();
  });

  it('renders referenzen page at /referenzen', () => {
    renderAt('/referenzen');
    expect(screen.getByTestId('referenzen-page')).toBeInTheDocument();
  });
});

describe('Navigation', () => {
  it('contains a link to /leistungen', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: 'Leistungen' })).toHaveAttribute('href', '/leistungen');
  });

  it('does not contain the old /#angebote link', () => {
    renderAt('/');
    expect(screen.queryByRole('link', { name: 'Angebote' })).not.toBeInTheDocument();
  });
});
