import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CtaBlock } from './CtaBlock';

const props = {
  eyebrow: 'Bereit?',
  title: 'Lassen Sie uns',
  titleEmphasis: 'herausfinden, ob es passt.',
  subtitle: '30 Minuten, kostenlos, unverbindlich.',
  primaryText: 'Termin vereinbaren',
  primaryHref: '/kontakt',
  secondaryText: 'mail@mentolder.de',
  secondaryHref: 'mailto:mail@mentolder.de',
};

describe('CtaBlock', () => {
  it('renders CTA content', () => {
    render(
      <MemoryRouter>
        <CtaBlock {...props} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Bereit?')).toBeInTheDocument();
    expect(screen.getByText('Lassen Sie uns')).toBeInTheDocument();
    expect(screen.getByText('Termin vereinbaren')).toBeInTheDocument();
  });
});
