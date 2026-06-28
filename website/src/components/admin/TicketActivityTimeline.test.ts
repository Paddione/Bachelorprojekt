import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import TicketActivityTimeline from './TicketActivityTimeline.svelte';
import type { TimelineEntry } from '../../lib/tickets/admin';

function makeEntries(n: number): TimelineEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    kind: 'created' as const,
    at: new Date(2026, 0, i + 1),
    actor: `user${i}`,
    ticketId: `t${i}`,
  }));
}

describe('TicketActivityTimeline — collapse/expand', () => {
  it('shows only initialCount entries by default when entries > initialCount', () => {
    const entries = makeEntries(10);
    render(TicketActivityTimeline, { props: { entries, initialCount: 5 } });
    const rows = document.querySelectorAll('.ticket-timeline-row');
    expect(rows.length).toBe(5);
  });

  it('shows all entries after clicking the expand button', async () => {
    const entries = makeEntries(10);
    render(TicketActivityTimeline, { props: { entries, initialCount: 5 } });
    const btn = screen.getByRole('button', { name: /10 Einträge/ });
    await fireEvent.click(btn);
    const rows = document.querySelectorAll('.ticket-timeline-row');
    expect(rows.length).toBe(10);
  });

  it('shows "Weniger anzeigen" button after expanding', async () => {
    const entries = makeEntries(10);
    render(TicketActivityTimeline, { props: { entries, initialCount: 5 } });
    await fireEvent.click(screen.getByRole('button', { name: /10 Einträge/ }));
    expect(screen.getByRole('button', { name: /Weniger anzeigen/ })).toBeTruthy();
  });

  it('shows all entries when entries <= initialCount (no button)', () => {
    const entries = makeEntries(3);
    render(TicketActivityTimeline, { props: { entries, initialCount: 5 } });
    const rows = document.querySelectorAll('.ticket-timeline-row');
    expect(rows.length).toBe(3);
    expect(screen.queryByRole('button', { name: /Einträge/ })).toBeNull();
  });

  it('shows all entries when initialCount is omitted (defaults to 5)', () => {
    const entries = makeEntries(3);
    render(TicketActivityTimeline, { props: { entries } });
    const rows = document.querySelectorAll('.ticket-timeline-row');
    expect(rows.length).toBe(3);
  });
});
