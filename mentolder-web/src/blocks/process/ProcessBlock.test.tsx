import { render, screen } from '@testing-library/react';
import { ProcessBlock } from './ProcessBlock';

const props = {
  eyebrow: "So geht's los",
  headline: 'In vier Schritten zu mehr Klarheit.',
  steps: [
    { num: '01', title: 'Kennenlernen', text: 'Kostenloses 30-Minuten-Erstgespräch.' },
    { num: '02', title: 'Klärung', text: 'Wir definieren Ziele.' },
  ],
};

describe('ProcessBlock', () => {
  it('renders eyebrow and headline', () => {
    render(<ProcessBlock {...props} />);
    expect(screen.getByText("So geht's los")).toBeInTheDocument();
    expect(screen.getByText('In vier Schritten zu mehr Klarheit.')).toBeInTheDocument();
  });

  it('renders process steps', () => {
    render(<ProcessBlock {...props} />);
    expect(screen.getByText('Kennenlernen')).toBeInTheDocument();
    expect(screen.getByText('Klärung')).toBeInTheDocument();
  });
});
