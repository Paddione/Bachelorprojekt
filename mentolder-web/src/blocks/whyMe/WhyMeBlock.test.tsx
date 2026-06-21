import { render, screen } from '@testing-library/react';
import { WhyMeBlock } from './WhyMeBlock';

const props = {
  headline: 'Warum mit mir?',
  intro: { prefix: 'Ich ', emphasis: 'verbinde', suffix: ' technische Tiefe mit menschlicher Klarheit.' },
  points: [
    { title: '30+ Jahre Führungserfahrung', text: 'Vom Teamlead bis zur Geschäftsführung.' },
    { title: 'Technik trifft Empathie', text: 'Cloud, KI, DevOps.' },
  ],
  quote: 'Gerald hat es geschafft, technische Tiefe und menschliche Wärme in jeden Termin zu bringen.',
  quoteName: 'Dr. M. Albers',
  quoteRole: 'CTO · mittelständisches SaaS-Unternehmen',
};

describe('WhyMeBlock', () => {
  it('renders the headline and intro emphasis', () => {
    render(<WhyMeBlock {...props} />);
    expect(screen.getByText('Warum mit mir?')).toBeInTheDocument();
    expect(screen.getByText('verbinde')).toBeInTheDocument();
  });

  it('renders the testimonial', () => {
    render(<WhyMeBlock {...props} />);
    expect(screen.getByText('Dr. M. Albers')).toBeInTheDocument();
    expect(screen.getByText('CTO · mittelständisches SaaS-Unternehmen')).toBeInTheDocument();
  });

  it('renders why-me points', () => {
    render(<WhyMeBlock {...props} />);
    expect(screen.getByText('30+ Jahre Führungserfahrung')).toBeInTheDocument();
  });
});
