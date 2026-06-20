import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import WhyMe from './WhyMe.svelte';
import QuoteCard from './QuoteCard.svelte';

describe('WhyMe.svelte', () => {
  const baseProps = {
    headline: 'Warum ich?',
    intro: 'Ich kenne beide Welten: 40 Jahre etablierte Strukturen UND modernste KI-Tools.',
    points: [
      { title: 'Pionier', text: 'Erste deutsche Polizeibehörde mit KI.' },
      { title: 'Systemischer Coach', text: 'Verbindet technologisches Verständnis mit Empathie.' },
      { title: 'Generation 50+', text: '65 Jahre. Kenne die Herausforderungen aus eigener Erfahrung.' },
    ],
    quote: 'Ich stelle unbequeme Fragen – weil echte Lösungen manchmal unbequeme Wahrheiten brauchen.',
    quoteName: 'Gerald Korczewski',
    quoteRole: 'Coach & digitaler Begleiter',
  };

  it('renders the headline eyebrow and the three points', () => {
    const { getByText, container } = render(WhyMe, { props: baseProps });
    // Headline is rendered as the eyebrow inside the section.
    expect(getByText('Warum ich?')).toBeTruthy();
    // h2 with set:html may not hydrate textContent in jsdom, but it is in the DOM.
    const h2 = container.querySelector('#why-heading');
    expect(h2).toBeTruthy();
    const points = container.querySelectorAll('.point');
    expect(points).toHaveLength(3);
  });

  it('renders the three points with numbered prefixes', () => {
    const { container } = render(WhyMe, { props: baseProps });
    const nums = container.querySelectorAll('.point-num');
    expect(nums).toHaveLength(3);
    expect(nums[0]?.textContent).toBe('01');
    expect(nums[1]?.textContent).toBe('02');
    expect(nums[2]?.textContent).toBe('03');
  });

  it('renders the QuoteCard with the supplied quote and name', () => {
    const { container } = render(WhyMe, { props: baseProps });
    expect(container.querySelector('.quote-card')).toBeTruthy();
    expect(container.querySelector('blockquote')?.textContent).toContain('unbequeme Fragen');
  });
});

describe('QuoteCard.svelte', () => {
  it('derives initials from the name when initials are not provided', () => {
    const { container } = render(QuoteCard, {
      props: {
        quote: 'Eine Frage des Stils.',
        name: 'Gerald Korczewski',
      },
    });
    expect(container.querySelector('.avatar')?.textContent).toBe('GK');
    expect(container.querySelector('.byline-name')?.textContent).toBe('Gerald Korczewski');
  });

  it('uses explicit initials when supplied', () => {
    const { container } = render(QuoteCard, {
      props: {
        quote: 'Eine Frage des Stils.',
        name: 'Anyone Else',
        initials: 'XY',
      },
    });
    expect(container.querySelector('.avatar')?.textContent).toBe('XY');
  });
});
