import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import ServiceRow from './ServiceRow.svelte';

describe('ServiceRow.svelte', () => {
  const baseProps = {
    num: '01',
    title: '50+ digital',
    description: 'Digitale Begleitung für Menschen 65+ in Lüneburg und Hamburg.',
    features: ['Smartphone Grundlagen', 'WhatsApp & Email', 'Online-Banking sicher nutzen'],
    price: '60 € / pro Stunde',
    href: '/50plus-digital',
  };

  it('renders the title, description, and number', () => {
    const { container, getByText } = render(ServiceRow, baseProps);
    expect(getByText('50+ digital')).toBeTruthy();
    expect(getByText('Digitale Begleitung für Menschen 65+ in Lüneburg und Hamburg.')).toBeTruthy();
    expect(container.querySelector('.no')?.textContent).toBe('01');
  });

  it('renders every feature as a list item', () => {
    const { container } = render(ServiceRow, baseProps);
    const items = container.querySelectorAll('ul li');
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toContain('Smartphone Grundlagen');
    expect(items[1]?.textContent).toContain('WhatsApp & Email');
    expect(items[2]?.textContent).toContain('Online-Banking sicher nutzen');
  });

  it('renders price with split price/unit', () => {
    const { container } = render(ServiceRow, baseProps);
    expect(container.querySelector('.price .p')?.textContent).toBe('60 €');
    expect(container.querySelector('.price .u')?.textContent).toBe('pro Stunde');
  });

  it('renders the meta-label when provided', () => {
    const { container } = render(ServiceRow, { ...baseProps, meta: 'Einzeln · Gruppe · Pakete' });
    expect(container.querySelector('.meta-label')?.textContent).toBe('Einzeln · Gruppe · Pakete');
  });

  it('renders the "Mehr" link to the service href', () => {
    const { container } = render(ServiceRow, baseProps);
    const link = container.querySelector('a.go') as HTMLAnchorElement | null;
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('/50plus-digital');
  });
});
