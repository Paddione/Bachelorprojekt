import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TicketAttachmentsPanel from './TicketAttachmentsPanel.svelte';

const baseAttachment = {
  id: 'att-1',
  filename: 'test.pdf',
  mimeType: 'application/pdf',
  fileSize: 2048,
  hasDataUrl: true,
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});

describe('TicketAttachmentsPanel', () => {
  it('renders "Keine Anhänge" when empty', () => {
    render(TicketAttachmentsPanel, { props: { ticketId: 't1', attachments: [] } });
    expect(screen.getByText(/Keine Anhänge/)).toBeTruthy();
  });

  it('renders attachment filename as download link when hasDataUrl is true', () => {
    render(TicketAttachmentsPanel, {
      props: { ticketId: 't1', attachments: [baseAttachment] },
    });
    const link = screen.getByRole('link', { name: 'test.pdf' }) as HTMLAnchorElement;
    expect(link.href).toContain('/api/admin/tickets/t1/attachments/att-1');
    expect(link.getAttribute('download')).toBe('test.pdf');
  });

  it('renders filename as plain text when hasDataUrl is false', () => {
    render(TicketAttachmentsPanel, {
      props: {
        ticketId: 't1',
        attachments: [{ ...baseAttachment, hasDataUrl: false }],
      },
    });
    expect(screen.queryByRole('link', { name: 'test.pdf' })).toBeNull();
    expect(screen.getByText('test.pdf')).toBeTruthy();
  });

  it('formats file sizes correctly', () => {
    render(TicketAttachmentsPanel, {
      props: {
        ticketId: 't1',
        attachments: [
          { ...baseAttachment, id: 'a1', filename: 'small.txt', fileSize: 500 },
          { ...baseAttachment, id: 'a2', filename: 'medium.jpg', fileSize: 2048 },
          { ...baseAttachment, id: 'a3', filename: 'large.zip', fileSize: 2 * 1024 * 1024 },
        ],
      },
    });
    expect(screen.getByText('500 B')).toBeTruthy();
    expect(screen.getByText('2.0 KB')).toBeTruthy();
    expect(screen.getByText('2.0 MB')).toBeTruthy();
  });

  it('shows the count in the header', () => {
    render(TicketAttachmentsPanel, {
      props: { ticketId: 't1', attachments: [baseAttachment] },
    });
    expect(screen.getByText(/Anhänge \(1\)/)).toBeTruthy();
  });
});
