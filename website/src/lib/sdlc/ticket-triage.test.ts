import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: (...a: unknown[]) => mockCreate(...a) };
  },
}));

const addComment = vi.fn();
const getTicketDetail = vi.fn();
const getProviderConfig = vi.fn();
const setProviderCooldown = vi.fn();

vi.mock('./provider-config', () => ({
  getProviderConfig: (...a: unknown[]) => getProviderConfig(...a),
  setProviderCooldown: (...a: unknown[]) => setProviderCooldown(...a),
}));
vi.mock('./tickets/admin', () => ({
  getTicketDetail: (...a: unknown[]) => getTicketDetail(...a),
  addComment: (...a: unknown[]) => addComment(...a),
}));
vi.mock('./website-db', () => ({ pool: {} }));

import { runTriage, autoTriage } from './ticket-triage';

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockReset();
});

describe('ticket-triage', () => {
  it('returns null when the ticket does not exist', async () => {
    getTicketDetail.mockResolvedValueOnce(null);
    expect(await runTriage('uuid-1', 'mentolder')).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns null when both title and description are blank', async () => {
    getTicketDetail.mockResolvedValueOnce({
      id: 'uuid-1', title: '   ', description: '   ', type: 'bug',
    });
    expect(await runTriage('uuid-1', 'mentolder')).toBeNull();
  });

  it('returns null when the provider config has no apiKey', async () => {
    getTicketDetail.mockResolvedValueOnce({
      id: 'uuid-1', title: 'Crash', description: 'x', type: 'bug',
    });
    getProviderConfig.mockResolvedValueOnce({ provider: 'anthropic', modelId: 'haiku', apiKey: '' });
    expect(await runTriage('uuid-1', 'mentolder')).toBeNull();
  });

  it('maps the LLM JSON response, stores it as an internal comment, and returns the result', async () => {
    getTicketDetail.mockResolvedValueOnce({
      id: 'uuid-1', title: 'Login kaputt', description: 'Geht nicht', type: 'bug',
    });
    getProviderConfig.mockResolvedValueOnce({
      provider: 'anthropic', modelId: 'haiku', apiKey: 'k',
    });
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"priority":"high","severity":"major","component":"auth","reasoning":"blocking"}' }],
    });
    addComment.mockResolvedValueOnce({});

    const out = await runTriage('uuid-1', 'mentolder');
    expect(out).toEqual({
      priority: 'hoch', severity: 'major', component: 'auth', reasoning: 'blocking',
    });
    expect(addComment).toHaveBeenCalledTimes(1);
    const c = addComment.mock.calls[0][0] as { brand: string; ticketId: string; body: string; kind: string; visibility: string; actor: { label: string } };
    expect(c.brand).toBe('mentolder');
    expect(c.ticketId).toBe('uuid-1');
    expect(c.kind).toBe('system');
    expect(c.visibility).toBe('internal');
    expect(c.actor.label).toBe('Auto-Triage');
    expect(c.body).toMatch(/Priority: hoch/);
    expect(c.body).toMatch(/Severity: major/);
    expect(c.body).toMatch(/Component: auth/);
    expect(c.body).toMatch(/Begruendung: blocking/);
  });

  it('falls back to defaults for unknown priority / severity', async () => {
    getTicketDetail.mockResolvedValueOnce({
      id: 'uuid-1', title: 'X', description: 'Y', type: 'bug',
    });
    getProviderConfig.mockResolvedValueOnce({
      provider: 'anthropic', modelId: 'haiku', apiKey: 'k',
    });
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"priority":"weird","severity":"banana","component":"x","reasoning":""}' }],
    });
    addComment.mockResolvedValueOnce({});
    const out = await runTriage('uuid-1', 'mentolder');
    expect(out).toEqual({
      priority: 'mittel', severity: 'minor',
      component: 'x',
      reasoning: '',
    });
  });

  it('truncates component to 50 chars and reasoning to 200', async () => {
    getTicketDetail.mockResolvedValueOnce({
      id: 'uuid-1', title: 'X', description: 'Y', type: 'bug',
    });
    getProviderConfig.mockResolvedValueOnce({
      provider: 'anthropic', modelId: 'haiku', apiKey: 'k',
    });
    const longComp = 'a'.repeat(60);
    const longReason = 'b'.repeat(250);
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: `{"priority":"low","severity":"minor","component":"${longComp}","reasoning":"${longReason}"}` }],
    });
    addComment.mockResolvedValueOnce({});
    const out = await runTriage('uuid-1', 'mentolder');
    expect(out!.component).toHaveLength(50);
    expect(out!.reasoning).toHaveLength(200);
  });

  it('returns null when the LLM reply has no parseable JSON', async () => {
    getTicketDetail.mockResolvedValueOnce({
      id: 'uuid-1', title: 'X', description: 'Y', type: 'bug',
    });
    getProviderConfig.mockResolvedValueOnce({
      provider: 'anthropic', modelId: 'haiku', apiKey: 'k',
    });
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'no json at all, sorry' }],
    });
    expect(await runTriage('uuid-1', 'mentolder')).toBeNull();
    expect(addComment).not.toHaveBeenCalled();
  });

  it('on repeated failure, sets a provider cooldown and returns null', async () => {
    getTicketDetail.mockResolvedValueOnce({
      id: 'uuid-1', title: 'X', description: 'Y', type: 'bug',
    });
    getProviderConfig.mockResolvedValueOnce({
      provider: 'anthropic', modelId: 'haiku', apiKey: 'k',
    });
    mockCreate.mockRejectedValueOnce(new Error('boom'));
    expect(await runTriage('uuid-1', 'mentolder')).toBeNull();
    expect(setProviderCooldown).toHaveBeenCalledTimes(1);
    const args = setProviderCooldown.mock.calls[0];
    expect(args[2]).toBe('anthropic');
    expect(args[3]).toBe(5);
  });

  it('autoTriage swallows errors and does not throw', async () => {
    getTicketDetail.mockRejectedValueOnce(new Error('db is dead'));
    await expect(autoTriage('uuid-1', 'mentolder')).resolves.toBeUndefined();
  });
});
