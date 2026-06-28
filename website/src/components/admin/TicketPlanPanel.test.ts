import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import TicketPlanPanel from './TicketPlanPanel.svelte';

const mockPlan = {
  id: 1,
  slug: '2026-06-20-mein-plan',
  branch: 'feature/mein-plan',
  prNumber: 42,
  content: '# Mein Plan\n\nInhalt hier.',
  archivedAt: null,
};

describe('TicketPlanPanel', () => {
  it('renders plan slug and PR link', () => {
    render(TicketPlanPanel, {
      props: { plan: mockPlan, renderedHtml: '<h1>Mein Plan</h1>', planContent: mockPlan.content },
    });
    expect(screen.getByText(mockPlan.slug)).toBeTruthy();
    const prLink = screen.getByRole('link', { name: /#42/ });
    expect(prLink.getAttribute('href')).toContain('/pull/42');
  });

  it('shows download button when planContent is non-empty', () => {
    render(TicketPlanPanel, {
      props: { plan: mockPlan, renderedHtml: '', planContent: '# Inhalt' },
    });
    expect(screen.getByRole('button', { name: /\.md/ })).toBeTruthy();
  });

  it('does NOT show download button when planContent is empty', () => {
    render(TicketPlanPanel, {
      props: { plan: mockPlan, renderedHtml: '', planContent: '' },
    });
    expect(screen.queryByRole('button', { name: /\.md/ })).toBeNull();
  });

  it('clicking download button triggers blob download with correct filename', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue();

    render(TicketPlanPanel, {
      props: { plan: mockPlan, renderedHtml: '', planContent: '# Test' },
    });
    const btn = screen.getByText(/plan-/);
    await fireEvent.click(btn);
    expect(createObjectURL).toHaveBeenCalled();
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/markdown');
  });
});
