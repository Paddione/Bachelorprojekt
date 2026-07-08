import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockCreate = vi.fn();
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: mockCreate } };
  },
}));
vi.mock('../../../lib/website-db', () => ({ pool: {} }));
vi.mock('../../../lib/coaching-ki-config-db', () => ({
  getActiveProvider: vi.fn(),
}));
import { getActiveProvider } from '../../../lib/coaching-ki-config-db';
import { POST } from './coaching-sim';

type RouteContext = Parameters<typeof POST>[0];
let ipCounter = 0;
const call = (body: unknown, headers: Record<string, string> = {}) => {
  const request = new Request('http://x/api/demo/coaching-sim', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  // eigene IP pro Aufruf, damit das In-Memory-Rate-Limit die Tests nicht koppelt
  return POST({ request, clientAddress: `10.0.0.${++ipCounter}` } as unknown as RouteContext);
};
const validBody = {
  mode: 'client',
  stepNumber: 1,
  stepName: 'Anliegen',
  coachInputs: {},
  previousSteps: [],
};

describe('POST /api/demo/coaching-sim', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    delete process.env.COACHING_SIM_ENABLED;
  });

  it('returns 503 when COACHING_SIM_ENABLED=false (kill-switch)', async () => {
    process.env.COACHING_SIM_ENABLED = 'false';
    const res = await call(validBody);
    expect(res.status).toBe(503);
  });

  it('returns 413 when content-length exceeds the body cap', async () => {
    const res = await call(validBody, { 'content-length': String(1024 * 1024) });
    expect(res.status).toBe(413);
    expect(getActiveProvider).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid mode', async () => {
    const res = await call({ ...validBody, mode: 'evil' });
    expect(res.status).toBe(400);
    expect(getActiveProvider).not.toHaveBeenCalled();
  });

  it('returns 400 for an out-of-range stepNumber', async () => {
    const res = await call({ ...validBody, stepNumber: 11 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for oversized coachInputs values', async () => {
    const res = await call({ ...validBody, mode: 'coach', coachInputs: { a: 'x'.repeat(5000) } });
    expect(res.status).toBe(400);
  });

  it('returns 400 when previousSteps exceeds the cap', async () => {
    const steps = Array.from({ length: 11 }, () => ({ stepName: 's', inputs: {}, coachResponse: 'r' }));
    const res = await call({ ...validBody, previousSteps: steps });
    expect(res.status).toBe(400);
  });

  it('answers a valid client request via the active provider', async () => {
    vi.mocked(getActiveProvider).mockResolvedValue({
      provider: 'local-lmstudio',
      apiKey: null,
      apiEndpoint: 'http://localhost:1234/v1',
      modelName: 'hermes-3',
      temperature: 0.7,
      maxTokens: null,
      systemPrompt: null,
    } as unknown as Awaited<ReturnType<typeof getActiveProvider>>);
    mockCreate.mockResolvedValue({ choices: [{ message: { content: '{"feld":"ok"}' } }] });

    const res = await call(validBody);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result: string };
    expect(json.result).toBe('{"feld":"ok"}');
    expect(mockCreate).toHaveBeenCalledOnce();
  });
});
