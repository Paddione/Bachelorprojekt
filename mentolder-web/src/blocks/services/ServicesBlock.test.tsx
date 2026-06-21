import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ServicesBlock } from './ServicesBlock';

const props = {
  headline: 'Drei Wege, mit mir zu arbeiten.',
  subheadline: 'Vom Coaching über Transformation bis zum Workshop — wählen Sie das Format, das zu Ihrer Situation passt.',
  items: [
    {
      id: 'fuehrungs-coaching',
      title: 'Führungs-Coaching',
      description: 'Description.',
      features: ['1:1-Sessions', 'Vertraulich'],
      price: 'ab 240',
      priceUnit: 'EUR / 60 min',
      href: '/angebote/fuehrung',
      icon: 'fuehrung' as const,
    },
  ],
};

describe('ServicesBlock', () => {
  it('renders headline and subheadline', () => {
    render(
      <MemoryRouter>
        <ServicesBlock {...props} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Drei Wege, mit mir zu arbeiten.')).toBeInTheDocument();
    expect(screen.getByText(/Vom Coaching über Transformation/)).toBeInTheDocument();
  });

  it('renders service items', () => {
    render(
      <MemoryRouter>
        <ServicesBlock {...props} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Führungs-Coaching')).toBeInTheDocument();
  });
});
