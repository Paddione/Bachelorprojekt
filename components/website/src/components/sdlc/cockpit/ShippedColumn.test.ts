import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ShippedColumn from './ShippedColumn.svelte';

const baseProps = {
  shipped: [
    { extId: 'T001001', title: 'Erstes Ticket', prNumber: 42, doneAt: '2026-07-01T10:00:00Z' },
    { extId: 'T001002', title: 'Zweites Ticket', prNumber: null, doneAt: '2026-07-01T09:00:00Z' },
  ],
  mobileColIndex: 0,
  relTime: (_iso: string | null) => 'vor 1h',
  prUrl: (n: number) => `https://example.test/pr/${n}`,
};

describe('ShippedColumn.svelte', () => {
  it('shows ticket number, relTime badge and PR badge but hides the title by default', () => {
    const { getByText, getAllByText, queryByText, getByTestId } = render(ShippedColumn, baseProps);
    expect(getByText('T001001')).toBeTruthy();
    expect(getAllByText('vor 1h').length).toBeGreaterThan(0);
    expect(getByTestId('floor-shipped-pr')).toBeTruthy();
    expect(queryByText('Erstes Ticket')).toBeNull();
  });

  it('renders the ticket number as a button, with no ticket-overview anchor link', () => {
    const { getByText, container } = render(ShippedColumn, baseProps);
    expect(getByText('T001001').tagName).toBe('BUTTON');
    expect(container.querySelector('a[title*="Ticket-Übersicht"]')).toBeNull();
  });

  it('reveals only the clicked ticket title and toggles it off on a second click', async () => {
    const { getByText, queryByText } = render(ShippedColumn, baseProps);
    await fireEvent.click(getByText('T001001'));
    expect(queryByText('Erstes Ticket')).not.toBeNull();
    expect(queryByText('Zweites Ticket')).toBeNull();
    await fireEvent.click(getByText('T001001'));
    expect(queryByText('Erstes Ticket')).toBeNull();
  });
});
