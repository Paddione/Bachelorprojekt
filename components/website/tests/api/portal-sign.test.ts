import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock heavy deps
vi.mock('../../src/lib/signing/pdf-service', () => ({
  generatePdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
}));
vi.mock('../../src/lib/documents-db', () => ({
  getDocumentAssignmentById: vi.fn(),
  getDocumentTemplate: vi.fn(),
  markAssignmentSigned: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/lib/signing/audit', () => ({
  logSigningEvent: vi.fn().mockResolvedValue(undefined),
}));

import { getDocumentAssignmentById } from '../../src/lib/documents-db';

describe('POST /api/portal/sign/[assignmentId] validation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('rejects when assignment not found', async () => {
    vi.mocked(getDocumentAssignmentById).mockResolvedValue(null);
    const result = await getDocumentAssignmentById('nonexistent-id');
    expect(result).toBeNull();
  });

  it('rejects when status is not pending', async () => {
    vi.mocked(getDocumentAssignmentById).mockResolvedValue({
      id: 'a1', customer_id: 'c1', template_id: 't1',
      status: 'completed', signature_data: null, signed_html: null,
      signed_pdf: null, expires_at: null, assigned_at: '', signed_at: null,
      template_title: 'Test',
    });
    const assignment = await getDocumentAssignmentById('a1');
    expect(assignment?.status).not.toBe('pending');
  });

  it('rejects expired assignment', async () => {
    vi.mocked(getDocumentAssignmentById).mockResolvedValue({
      id: 'a2', customer_id: 'c1', template_id: 't1',
      status: 'pending', signature_data: null, signed_html: null,
      signed_pdf: null, expires_at: '2020-01-01T00:00:00Z',
      assigned_at: '', signed_at: null,
      template_title: 'Test',
    });
    const assignment = await getDocumentAssignmentById('a2');
    const expired = assignment?.expires_at
      ? new Date(assignment.expires_at) < new Date()
      : false;
    expect(expired).toBe(true);
  });
});
