import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LeistungDetailPage } from './LeistungDetailPage';
import { leistungenKategorien } from '@/content';

const renderWithSlug = (slug: string) =>
  render(
    <MemoryRouter initialEntries={[`/leistungen/${slug}`]}>
      <Routes>
        <Route path="/leistungen/:slug" element={<LeistungDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

const firstSvc = leistungenKategorien[0].services[0];

describe('LeistungDetailPage — valid slug', () => {
  it('renders the service headline', () => {
    renderWithSlug(firstSvc.slug);
    expect(screen.getByText(firstSvc.pageContent.headline)).toBeInTheDocument();
  });

  it('renders the intro text', () => {
    renderWithSlug(firstSvc.slug);
    expect(screen.getByText(firstSvc.pageContent.intro)).toBeInTheDocument();
  });

  it('renders the price', () => {
    renderWithSlug(firstSvc.slug);
    expect(screen.getByText(firstSvc.price)).toBeInTheDocument();
  });

  it('renders all features in the sidebar', () => {
    renderWithSlug(firstSvc.slug);
    for (const f of firstSvc.features) {
      expect(screen.getByText(f)).toBeInTheDocument();
    }
  });

  it('renders "Für wen?" when forWhom is non-empty', () => {
    if (firstSvc.pageContent.forWhom.length > 0) {
      renderWithSlug(firstSvc.slug);
      expect(screen.getByText('Für wen?')).toBeInTheDocument();
      expect(screen.getByText(firstSvc.pageContent.forWhom[0])).toBeInTheDocument();
    }
  });

  it('renders breadcrumb link to /leistungen', () => {
    renderWithSlug(firstSvc.slug);
    expect(screen.getByRole('link', { name: /Alle Leistungen/i })).toHaveAttribute('href', '/leistungen');
  });

  it('renders a contact link with service param', () => {
    renderWithSlug(firstSvc.slug);
    const ctaLinks = screen.getAllByRole('link', { name: /Kontakt aufnehmen/i });
    expect(ctaLinks.some((l) => l.getAttribute('href')?.includes(`service=${firstSvc.slug}`))).toBe(true);
  });
});

describe('LeistungDetailPage — invalid slug', () => {
  it('renders a 404 message', () => {
    renderWithSlug('gibts-nicht-das-angebot');
    expect(screen.getByText(/404/)).toBeInTheDocument();
  });

  it('renders a link back to /leistungen in 404 state', () => {
    renderWithSlug('gibts-nicht-das-angebot');
    expect(screen.getByRole('link', { name: /Alle Leistungen/i })).toHaveAttribute('href', '/leistungen');
  });
});
