import { render, screen } from '@testing-library/react';
import { FaqBlock } from './FaqBlock';

const items = [
  { question: 'Wie läuft ein Erstgespräch ab?', answer: '30 Minuten, kostenlos.' },
  { question: 'Vertraulichkeit?', answer: 'Alle Inhalte sind streng vertraulich.' },
];

describe('FaqBlock', () => {
  it('renders the title and questions', () => {
    render(<FaqBlock title="Häufige Fragen" items={items} />);
    expect(screen.getByText('Häufige Fragen')).toBeInTheDocument();
    expect(screen.getByText('Wie läuft ein Erstgespräch ab?')).toBeInTheDocument();
    expect(screen.getByText('Vertraulichkeit?')).toBeInTheDocument();
  });
});
