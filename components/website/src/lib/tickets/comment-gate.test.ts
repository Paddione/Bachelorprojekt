import { describe, it, expect } from 'vitest';

import { checkCommentAccess } from './comment-gate';

const FORM_ORIGIN = 'https://session-abc.sessions.mentolder.de';

describe('tickets/comment-gate (F6)', () => {
  it('admin session allows everything', () => {
    expect(checkCommentAccess({ origin: null, referer: null, hasSession: true, hasTicketId: true })).toEqual({ allow: true });
  });

  it('anonymous creation (no ticketId) is allowed (session-form flow)', () => {
    expect(checkCommentAccess({ origin: null, referer: null, hasSession: false, hasTicketId: false })).toEqual({ allow: true });
  });

  it('anonymous comment from a session form origin is allowed', () => {
    expect(checkCommentAccess({ origin: FORM_ORIGIN, referer: null, hasSession: false, hasTicketId: true })).toEqual({ allow: true });
  });

  it('anonymous comment from an unknown origin is rejected with 403', () => {
    expect(checkCommentAccess({ origin: 'https://evil.example.com', referer: null, hasSession: false, hasTicketId: true })).toEqual({ allow: false, status: 403 });
  });

  it('anonymous comment without any origin is rejected with 403 (curl enumeration)', () => {
    expect(checkCommentAccess({ origin: null, referer: null, hasSession: false, hasTicketId: true })).toEqual({ allow: false, status: 403 });
  });
});
