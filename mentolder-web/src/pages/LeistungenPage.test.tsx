import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LeistungenPage } from './LeistungenPage';
import { leistungenKategorien } from '@/content';

const renderPage = () =>
  render(
    <MemoryRouter>
      <LeistungenPage />
    </MemoryRouter>,
  );

describe('LeistungenPage', () => {
  it('renders the Erstgespräch hero card', () => {
    renderPage();
    expect(screen.getByText('Kostenloses Erstgespräch')).toBeInTheDocument();
  });

  it('renders all category titles', () => {
    renderPage();
    for (const kat of leistungenKategorien) {
      expect(screen.getByRole('heading', { level: 2, name: kat.title })).toBeInTheDocument();
    }
  });

  it('renders all service titles', () => {
    renderPage();
    for (const kat of leistungenKategorien) {
      for (const svc of kat.services) {
        expect(screen.getAllByText(svc.title).length).toBeGreaterThan(0);
      }
    }
  });

  it('renders §19 UStG price hint', () => {
    renderPage();
    expect(screen.getByText(/§\s?19 UStG/)).toBeInTheDocument();
  });

  it('renders link to /kontakt for Erstgespräch', () => {
    renderPage();
    const links = screen.getAllByRole('link', { name: /buchen/i });
    expect(links.some((l) => l.getAttribute('href') === '/kontakt')).toBe(true);
  });
});
