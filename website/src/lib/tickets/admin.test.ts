import { describe, it, expect, vi } from 'vitest';

const { mockPool, queue } = vi.hoisted(() => {
  type QueueItem = { rows: unknown[]; rowCount?: number } | { __reject: Error };
  const queue: QueueItem[] = [];
  const run = async (sql: unknown, ..._rest: unknown[]) => {
    if (typeof sql === 'string') {
      const trimmed = sql.trim();
      if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(trimmed)) return { rows: [], rowCount: 0 };
      if (/^SELECT set_config/i.test(trimmed)) return { rows: [], rowCount: 0 };
    }
    const next = queue.shift() ?? { rows: [], rowCount: 0 };
    if ('__reject' in next) throw next.__reject;
    return next;
  };
  const pool = {
    query: run,
    connect: async () => ({ query: run, release: () => {} }),
  };
  return { mockPool: pool, queue };
});

vi.mock('../website-db', () => ({ pool: mockPool }));
vi.mock('../tickets-db', () => ({ initTicketsSchema: async () => undefined }));
vi.mock('./grilling', () => ({}));

const sendPublicCommentEmail = vi.fn(async () => true);
vi.mock('./email-templates', () => ({ sendPublicCommentEmail }));

let loadModule: () => Promise<typeof import('./admin')>;

const { beforeEach } = await import('vitest');
beforeEach(() => {
  queue.length = 0;
  sendPublicCommentEmail.mockClear();
  vi.resetModules();
  loadModule = () => import('./admin');
});

const listedTicketRow = {
  id: 'uuid-1',
  externalId: 'T000001',
  type: 'bug',
  brand: 'mentolder',
  title: 'Sample ticket',
  status: 'triage',
  resolution: null,
  priority: 'hoch',
  severity: 'major',
  attentionMode: 'auto',
  effectiveAttentionMode: 'ai_ready',
  component: 'auth',
  thesisTag: null,
  parentId: null,
  assigneeId: null,
  assigneeLabel: null,
  customerId: null,
  customerLabel: null,
  reporterEmail: null,
  dueDate: null,
  childCount: 0,
  tagNames: [],
  createdAt: new Date('2026-06-27T09:00:00Z'),
  updatedAt: new Date('2026-06-27T09:00:00Z'),
  aiQuestion: null,
  humanAnswer: null,
  grillingAnswers: null,
  grillingMeta: null,
};

describe('tickets/admin list / count', () => {
  it('listAdminTickets returns rows for a brand', async () => {
    const m = await loadModule();
    queue.push({ rows: [listedTicketRow] });
    const out = await m.listAdminTickets({ brand: 'mentolder' });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('uuid-1');
    expect(out[0].status).toBe('triage');
  });

  it('listAdminTickets maps the "open" status to NOT IN done,archived', async () => {
    const m = await loadModule();
    queue.push({ rows: [listedTicketRow] });
    const out = await m.listAdminTickets({ brand: 'mentolder', status: 'open' });
    expect(out).toHaveLength(1);
  });

  it('listAdminTickets applies a concrete status filter (not "open")', async () => {
    const m = await loadModule();
    queue.push({ rows: [] });
    const out = await m.listAdminTickets({ brand: 'mentolder', status: 'in_progress' });
    expect(out).toEqual([]);
  });

  it('listAdminTickets applies the type, attention, component, assignee, customer, thesisTag, tagName and q filters together', async () => {
    const m = await loadModule();
    queue.push({ rows: [] });
    const out = await m.listAdminTickets({
      brand: 'mentolder',
      type: 'bug',
      attention: 'needs_human',
      component: 'auth',
      assigneeId: 'assignee-1',
      customerId: 'customer-1',
      thesisTag: 'tag-a',
      tagName: 'urgent',
      q: 'search text',
      parentIsNull: true,
    });
    expect(out).toEqual([]);
  });

  it('listAdminTickets respects the includeTestData flag (true includes test-data rows)', async () => {
    const m = await loadModule();
    queue.push({ rows: [listedTicketRow] });
    const out = await m.listAdminTickets({ brand: 'mentolder', includeTestData: true });
    expect(out).toHaveLength(1);
  });

  it('listAdminTickets caps limit at 500 and floors offset at 0', async () => {
    const m = await loadModule();
    queue.push({ rows: [] });
    const out = await m.listAdminTickets({ brand: 'mentolder', limit: 999999, offset: -5 });
    expect(Array.isArray(out)).toBe(true);
  });

  it('listAdminTickets floors limit at 1 for zero/negative values', async () => {
    const m = await loadModule();
    queue.push({ rows: [] });
    const out = await m.listAdminTickets({ brand: 'mentolder', limit: -10 });
    expect(Array.isArray(out)).toBe(true);
  });

  it('countAdminTickets returns the row count', async () => {
    const m = await loadModule();
    queue.push({ rows: [{ count: '7' }] });
    expect(await m.countAdminTickets({ brand: 'mentolder' })).toBe(7);
  });

  it('countAdminTickets applies the same filter matrix as listAdminTickets', async () => {
    const m = await loadModule();
    queue.push({ rows: [{ count: '3' }] });
    const out = await m.countAdminTickets({
      brand: 'mentolder',
      type: 'task',
      status: 'open',
      attention: 'ai_ready',
      component: 'billing',
      assigneeId: 'assignee-2',
      customerId: 'customer-2',
      thesisTag: 'tag-b',
      tagName: 'important',
      q: 'foo',
      parentIsNull: true,
      includeTestData: true,
    });
    expect(out).toBe(3);
  });

  it('countAdminTickets falls back to 0 when no count row is returned', async () => {
    const m = await loadModule();
    queue.push({ rows: [] });
    expect(await m.countAdminTickets({ brand: 'mentolder' })).toBe(0);
  });
});

describe('getTicketDetail', () => {
  it('returns null when no row is found', async () => {
    const m = await loadModule();
    queue.push({ rows: [] }); // main SELECT
    expect(await m.getTicketDetail('mentolder', 'uuid-1')).toBeNull();
  });

  it('returns a TicketDetail on hit (and aggregates the 4 parallel queries)', async () => {
    const m = await loadModule();
    queue.push({ rows: [{ ...listedTicketRow, description: 'desc', notes: null, url: null, startDate: null, estimateMinutes: null, timeLoggedMinutes: 0, triagedAt: null, startedAt: null, doneAt: null, archivedAt: null, reporterId: null }] }); // main
    queue.push({ rows: [] }); // children
    queue.push({ rows: [] }); // links
    queue.push({ rows: [] }); // attachments
    queue.push({ rows: [] }); // watchers
    const out = await m.getTicketDetail('mentolder', 'uuid-1');
    expect(out).not.toBeNull();
    expect(out?.id).toBe('uuid-1');
  });
});

describe('getTicketTimeline', () => {
  it('returns an empty array when the ticket does not exist', async () => {
    const m = await loadModule();
    queue.push({ rows: [] }); // guard query: no matching ticket
    expect(await m.getTicketTimeline('mentolder', 'uuid-1')).toEqual([]);
  });

  it('returns an empty array when the ticket belongs to a different brand', async () => {
    const m = await loadModule();
    queue.push({ rows: [{ brand: 'korczewski' }] }); // guard query: wrong brand
    expect(await m.getTicketTimeline('mentolder', 'uuid-1')).toEqual([]);
  });

  it('merges activity, comments and links/PR events into a sorted timeline', async () => {
    const m = await loadModule();
    const created = new Date('2026-06-01T09:00:00Z');
    const updated = new Date('2026-06-02T09:00:00Z');
    const legacy = new Date('2026-06-01T10:00:00Z');
    const commentAt = new Date('2026-06-03T09:00:00Z');
    const linkAt = new Date('2026-06-04T09:00:00Z');
    const prMergedAt = new Date('2026-06-05T09:00:00Z');

    queue.push({ rows: [{ brand: 'mentolder' }] }); // guard
    queue.push({
      rows: [
        { field: '_created', old_value: null, new_value: null, actor_label: 'Alice', created_at: created },
        { field: '_updated', old_value: null, new_value: { title: { old: 'A', new: 'B' } }, actor_label: 'Bob', created_at: updated },
        // legacy per-field row: must be ignored (folded into 'updated' upstream)
        { field: 'priority', old_value: 'mittel', new_value: 'hoch', actor_label: 'Carol', created_at: legacy },
      ],
    }); // activity
    queue.push({
      rows: [
        { author_label: 'Dave', kind: 'comment', body: 'hi', visibility: 'public', created_at: commentAt },
      ],
    }); // comments
    queue.push({
      rows: [
        {
          kind: 'relates_to', to_id: 'uuid-2', pr_number: 42, other_title: 'Other ticket',
          created_at: linkAt, pr_title: 'Fix the bug', pr_merged_at: prMergedAt, pr_merged_by: 'Eve',
        },
      ],
    }); // links

    const out = await m.getTicketTimeline('mentolder', 'uuid-1');
    expect(out).toHaveLength(5); // created, updated, comment, link_added, pr_merged (legacy row ignored)
    expect(out.map(e => e.kind)).toEqual(['created', 'updated', 'comment', 'link_added', 'pr_merged']);
    expect(out[0]).toMatchObject({ kind: 'created', actor: 'Alice' });
    expect(out[1]).toMatchObject({ kind: 'updated', actor: 'Bob', diff: { title: { old: 'A', new: 'B' } } });
    expect(out[2]).toMatchObject({ kind: 'comment', actor: 'Dave', body: 'hi', visibility: 'public' });
    expect(out[3]).toMatchObject({ kind: 'link_added', linkKind: 'relates_to', otherId: 'uuid-2', prNumber: 42 });
    expect(out[4]).toMatchObject({ kind: 'pr_merged', prNumber: 42, prTitle: 'Fix the bug', mergedBy: 'Eve' });
  });

  it('adds a link_added entry without a pr_merged companion when the PR is not merged', async () => {
    const m = await loadModule();
    queue.push({ rows: [{ brand: 'mentolder' }] }); // guard
    queue.push({ rows: [] }); // activity
    queue.push({ rows: [] }); // comments
    queue.push({
      rows: [
        { kind: 'blocks', to_id: 'uuid-3', pr_number: null, other_title: 'Blocker', created_at: new Date(), pr_title: null, pr_merged_at: null, pr_merged_by: null },
      ],
    }); // links
    const out = await m.getTicketTimeline('mentolder', 'uuid-1');
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('link_added');
  });
});

describe('createAdminTicket', () => {
  const baseActor = { id: 'user-1', label: 'Admin' };

  it('throws when type=project has no customerId', async () => {
    const m = await loadModule();
    await expect(
      m.createAdminTicket({ brand: 'mentolder', type: 'project', title: 'No customer', actor: baseActor }),
    ).rejects.toThrow(/customerId is required/);
  });

  it('throws when parentId does not resolve to any ticket', async () => {
    const m = await loadModule();
    queue.push({ rows: [] }); // parent lookup: not found
    await expect(
      m.createAdminTicket({ brand: 'mentolder', type: 'task', title: 'Orphan', parentId: 'missing-parent', actor: baseActor }),
    ).rejects.toThrow(/parentId not found in brand/);
  });

  it('throws when parentId belongs to a different brand', async () => {
    const m = await loadModule();
    queue.push({ rows: [{ brand: 'korczewski' }] }); // parent lookup: wrong brand
    await expect(
      m.createAdminTicket({ brand: 'mentolder', type: 'task', title: 'Cross-brand child', parentId: 'other-brand-parent', actor: baseActor }),
    ).rejects.toThrow(/parentId not found in brand/);
  });

  it('creates a ticket with a valid same-brand parentId and an actor.id', async () => {
    const m = await loadModule();
    queue.push({ rows: [{ brand: 'mentolder' }] }); // parent lookup: ok
    queue.push({ rows: [{ id: 'new-ticket-id' }] }); // INSERT ... RETURNING id
    const id = await m.createAdminTicket({
      brand: 'mentolder', type: 'task', title: 'Child ticket', parentId: 'parent-1', actor: baseActor,
    });
    expect(id).toBe('new-ticket-id');
  });

  it('creates a top-level ticket without an actor.id (skips set_config user_id)', async () => {
    const m = await loadModule();
    queue.push({ rows: [{ id: 'new-ticket-id-2' }] }); // INSERT ... RETURNING id
    const id = await m.createAdminTicket({
      brand: 'mentolder', type: 'bug', title: 'Anonymous-actor bug', actor: { label: 'System' },
    });
    expect(id).toBe('new-ticket-id-2');
  });

  it('creates a project ticket when customerId is supplied', async () => {
    const m = await loadModule();
    queue.push({ rows: [{ id: 'proj-1' }] });
    const id = await m.createAdminTicket({
      brand: 'mentolder', type: 'project', title: 'New project', customerId: 'cust-1', actor: baseActor,
    });
    expect(id).toBe('proj-1');
  });

  it('rolls back and rethrows when the INSERT fails', async () => {
    const m = await loadModule();
    queue.push({ __reject: new Error('insert failed') }); // INSERT throws
    await expect(
      m.createAdminTicket({ brand: 'mentolder', type: 'task', title: 'Will fail', actor: baseActor }),
    ).rejects.toThrow('insert failed');
  });
});

describe('patchAdminTicket', () => {
  const baseActor = { id: 'user-1', label: 'Admin' };

  it('is a no-op when no fields are provided (no query executed)', async () => {
    const m = await loadModule();
    await expect(
      m.patchAdminTicket({ brand: 'mentolder', id: 'uuid-1', actor: baseActor }),
    ).resolves.toBeUndefined();
    expect(queue).toHaveLength(0); // nothing was consumed
  });

  it('updates every optional field including explicit nulls, with an actor.id', async () => {
    const m = await loadModule();
    queue.push({ rows: [], rowCount: 1 }); // UPDATE
    await expect(
      m.patchAdminTicket({
        brand: 'mentolder',
        id: 'uuid-1',
        title: 'New title',
        description: 'New desc',
        notes: 'Some notes',
        url: 'https://example.com',
        priority: 'hoch',
        severity: null,
        component: null,
        attentionMode: 'ai_ready',
        thesisTag: null,
        parentId: null,
        customerId: null,
        assigneeId: null,
        reporterEmail: null,
        startDate: null,
        dueDate: null,
        estimateMinutes: null,
        aiQuestion: 'Q?',
        humanAnswer: 'A.',
        grillingAnswers: null,
        grillingMeta: null,
        actor: baseActor,
      }),
    ).resolves.toBeUndefined();
  });

  it('updates a single field without an actor.id', async () => {
    const m = await loadModule();
    queue.push({ rows: [], rowCount: 1 }); // UPDATE
    await expect(
      m.patchAdminTicket({ brand: 'mentolder', id: 'uuid-1', title: 'Only title', actor: { label: 'System' } }),
    ).resolves.toBeUndefined();
  });

  it('throws when the ticket is not found in the brand (rowCount 0)', async () => {
    const m = await loadModule();
    queue.push({ rows: [], rowCount: 0 }); // UPDATE affected 0 rows
    await expect(
      m.patchAdminTicket({ brand: 'mentolder', id: 'missing', title: 'x', actor: baseActor }),
    ).rejects.toThrow(/ticket not found in brand/);
  });
});

describe('addComment', () => {
  const baseActor = { id: 'user-1', label: 'Admin' };

  it('throws when the ticket does not exist in the brand', async () => {
    const m = await loadModule();
    queue.push({ rows: [] }); // guard: no ticket
    await expect(
      m.addComment({ brand: 'mentolder', ticketId: 'missing', body: 'hi', visibility: 'internal', actor: baseActor }),
    ).rejects.toThrow(/ticket not found in brand/);
  });

  it('throws on an empty (whitespace-only) body', async () => {
    const m = await loadModule();
    queue.push({ rows: [{ brand: 'mentolder', reporter_email: null, external_id: 'T1', type: 'bug' }] }); // guard
    await expect(
      m.addComment({ brand: 'mentolder', ticketId: 'uuid-1', body: '   ', visibility: 'internal', actor: baseActor }),
    ).rejects.toThrow(/empty body/);
  });

  it('throws when the body exceeds 4000 characters', async () => {
    const m = await loadModule();
    queue.push({ rows: [{ brand: 'mentolder', reporter_email: null, external_id: 'T1', type: 'bug' }] }); // guard
    await expect(
      m.addComment({ brand: 'mentolder', ticketId: 'uuid-1', body: 'x'.repeat(4001), visibility: 'internal', actor: baseActor }),
    ).rejects.toThrow(/too long/);
  });

  it('adds an internal comment without sending an email', async () => {
    const m = await loadModule();
    queue.push({ rows: [{ brand: 'mentolder', reporter_email: 'reporter@example.com', external_id: 'T1', type: 'bug' }] }); // guard
    queue.push({ rows: [{ id: 11 }] }); // INSERT ... RETURNING id
    const out = await m.addComment({ brand: 'mentolder', ticketId: 'uuid-1', body: 'internal note', visibility: 'internal', actor: baseActor });
    expect(out).toEqual({ id: 11, emailSent: false });
    expect(sendPublicCommentEmail).not.toHaveBeenCalled();
  });

  it('sends an email for a public comment on a bug with a reporter email', async () => {
    const m = await loadModule();
    queue.push({ rows: [{ brand: 'mentolder', reporter_email: 'reporter@example.com', external_id: 'T1', type: 'bug' }] }); // guard
    queue.push({ rows: [{ id: 12 }] }); // INSERT ... RETURNING id
    const out = await m.addComment({ brand: 'mentolder', ticketId: 'uuid-1', body: 'public reply', visibility: 'public', actor: baseActor });
    expect(out).toEqual({ id: 12, emailSent: true });
    expect(sendPublicCommentEmail).toHaveBeenCalledWith({
      externalId: 'T1', reporterEmail: 'reporter@example.com', body: 'public reply',
    });
  });

  it('does not send an email for a public comment on a non-bug ticket type', async () => {
    const m = await loadModule();
    queue.push({ rows: [{ brand: 'mentolder', reporter_email: 'reporter@example.com', external_id: 'T2', type: 'feature' }] }); // guard
    queue.push({ rows: [{ id: 13 }] }); // INSERT ... RETURNING id
    const out = await m.addComment({ brand: 'mentolder', ticketId: 'uuid-1', body: 'public reply', visibility: 'public', actor: baseActor });
    expect(out).toEqual({ id: 13, emailSent: false });
    expect(sendPublicCommentEmail).not.toHaveBeenCalled();
  });

  it('does not send an email for a public comment when there is no reporter email', async () => {
    const m = await loadModule();
    queue.push({ rows: [{ brand: 'mentolder', reporter_email: null, external_id: 'T3', type: 'bug' }] }); // guard
    queue.push({ rows: [{ id: 14 }] }); // INSERT ... RETURNING id
    const out = await m.addComment({ brand: 'mentolder', ticketId: 'uuid-1', body: 'public reply', visibility: 'public', actor: baseActor });
    expect(out).toEqual({ id: 14, emailSent: false });
    expect(sendPublicCommentEmail).not.toHaveBeenCalled();
  });

  it('falls back to ticketId as externalId when external_id is null', async () => {
    const m = await loadModule();
    queue.push({ rows: [{ brand: 'mentolder', reporter_email: 'reporter@example.com', external_id: null, type: 'bug' }] }); // guard
    queue.push({ rows: [{ id: 15 }] }); // INSERT ... RETURNING id
    const out = await m.addComment({ brand: 'mentolder', ticketId: 'uuid-1', body: 'public reply', visibility: 'public', actor: baseActor });
    expect(out.emailSent).toBe(true);
    expect(sendPublicCommentEmail).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: 'uuid-1' }),
    );
  });
});

describe('addLink', () => {
  const baseActor = { id: 'user-1', label: 'Admin' };

  it('throws when linking a ticket to itself', async () => {
    const m = await loadModule();
    await expect(
      m.addLink({ brand: 'mentolder', fromId: 'uuid-1', toId: 'uuid-1', kind: 'relates_to', actor: baseActor }),
    ).rejects.toThrow(/cannot link a ticket to itself/);
    expect(queue).toHaveLength(0); // never reached the DB
  });

  it('throws when one of the two tickets does not exist', async () => {
    const m = await loadModule();
    queue.push({ rows: [{ id: 'uuid-1', brand: 'mentolder' }], rowCount: 1 }); // only 1 of 2 found
    await expect(
      m.addLink({ brand: 'mentolder', fromId: 'uuid-1', toId: 'uuid-2', kind: 'blocks', actor: baseActor }),
    ).rejects.toThrow(/must exist and belong to the same brand/);
  });

  it('throws when the two tickets belong to different brands', async () => {
    const m = await loadModule();
    queue.push({
      rows: [{ id: 'uuid-1', brand: 'mentolder' }, { id: 'uuid-2', brand: 'korczewski' }],
      rowCount: 2,
    });
    await expect(
      m.addLink({ brand: 'mentolder', fromId: 'uuid-1', toId: 'uuid-2', kind: 'blocks', actor: baseActor }),
    ).rejects.toThrow(/must exist and belong to the same brand/);
  });

  it('creates a link when both tickets exist and share the brand', async () => {
    const m = await loadModule();
    queue.push({
      rows: [{ id: 'uuid-1', brand: 'mentolder' }, { id: 'uuid-2', brand: 'mentolder' }],
      rowCount: 2,
    }); // both lookup
    queue.push({ rows: [{ id: 99 }] }); // INSERT ... RETURNING id
    const out = await m.addLink({ brand: 'mentolder', fromId: 'uuid-1', toId: 'uuid-2', kind: 'blocks', prNumber: 42, actor: baseActor });
    expect(out).toEqual({ id: 99 });
  });
});

describe('removeLink', () => {
  it('throws when the link is not found in the brand', async () => {
    const m = await loadModule();
    queue.push({ rows: [], rowCount: 0 }); // DELETE affected nothing
    await expect(m.removeLink('mentolder', 'uuid-1', 123)).rejects.toThrow(/link not found in brand/);
  });

  it('resolves when the link is deleted', async () => {
    const m = await loadModule();
    queue.push({ rows: [], rowCount: 1 }); // DELETE affected 1 row
    await expect(m.removeLink('mentolder', 'uuid-1', 123)).resolves.toBeUndefined();
  });
});

describe('addAttachment', () => {
  const baseActor = { id: 'user-1', label: 'Admin' };

  it('throws when the ticket does not exist in the brand', async () => {
    const m = await loadModule();
    queue.push({ rows: [] }); // guard: no ticket
    await expect(
      m.addAttachment({
        brand: 'mentolder', ticketId: 'missing', filename: 'f.png', mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,AAAA', actor: baseActor,
      }),
    ).rejects.toThrow(/ticket not found in brand/);
  });

  it('adds an attachment when the ticket exists in the brand', async () => {
    const m = await loadModule();
    queue.push({ rows: [{ brand: 'mentolder' }] }); // guard
    queue.push({ rows: [{ id: 'att-1' }] }); // INSERT ... RETURNING id
    const out = await m.addAttachment({
      brand: 'mentolder', ticketId: 'uuid-1', filename: 'f.png', mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,AAAA', fileSize: 1024, actor: baseActor,
    });
    expect(out).toEqual({ id: 'att-1' });
  });
});
