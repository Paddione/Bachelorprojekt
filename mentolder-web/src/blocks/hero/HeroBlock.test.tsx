import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HeroBlock } from './HeroBlock';

const props = {
  title: 'Menschen, Prozesse und Technik',
  titleEmphasis: 'der Mensch und Technologie wieder verbindet.',
  subtitle: 'Mit 30+ Jahren Führungserfahrung begleite ich Menschen und Organisationen bei der digitalen Transformation — praxisnah, empathisch und auf Augenhöhe.',
  tagline: 'Digital Coach · Führungskräfte-Mentor',
  avatarType: 'initials' as const,
  avatarInitials: 'GK',
  personName: 'Gerald Korczewski',
  personRole: 'Digital Coach & Mentor',
};

describe('HeroBlock', () => {
  it('renders the hero section', () => {
    render(
      <MemoryRouter>
        <HeroBlock {...props} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Menschen, Prozesse und Technik')).toBeInTheDocument();
    expect(screen.getByText(/der Mensch und Technologie wieder verbindet/)).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    render(
      <MemoryRouter>
        <HeroBlock {...props} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/30\+ Jahren Führungserfahrung/)).toBeInTheDocument();
  });
});
