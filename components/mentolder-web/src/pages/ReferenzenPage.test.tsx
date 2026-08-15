import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReferenzenPage } from './ReferenzenPage';
import { referenzenConfig } from '@/content';

const renderPage = () =>
  render(
    <MemoryRouter>
      <ReferenzenPage />
    </MemoryRouter>,
  );

describe('ReferenzenPage', () => {
  it('renders the heading emphasis', () => {
    renderPage();
    expect(screen.getByText(/die mir vertrauen/)).toBeInTheDocument();
  });

  it('renders the subheading', () => {
    renderPage();
    expect(screen.getByText(referenzenConfig.subheading)).toBeInTheDocument();
  });

  it('renders all reference item names', () => {
    renderPage();
    for (const item of referenzenConfig.items) {
      expect(screen.getByText(item.name)).toBeInTheDocument();
    }
  });

  it('renders group labels when multiple types exist', () => {
    if (referenzenConfig.types.length > 1) {
      renderPage();
      expect(screen.getByText(referenzenConfig.types[0].label)).toBeInTheDocument();
    }
  });

  it('renders the Kontakt CTA link', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Jetzt Kontakt aufnehmen' })).toHaveAttribute('href', '/kontakt');
  });

  it('does NOT render the empty-state when items exist', () => {
    if (referenzenConfig.items.length > 0) {
      renderPage();
      expect(screen.queryByText('Referenzen werden demnächst ergänzt.')).not.toBeInTheDocument();
    }
  });
});
