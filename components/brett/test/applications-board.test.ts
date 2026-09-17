import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchApplicationsList, postTimelineEvent } from '../src/server/routes/applications';
import { renderApplicationsBoard, type ApplicationsData } from '../src/client/ui/applications-board';

// ── Server route: fetchApplicationsList ─────────────────────────────────
// GET /api/applications proxies the website's internal list API via fetch
// with the INTERNAL_API_TOKEN header, and passes the grouped JSON through
// unchanged.

test('fetchApplicationsList: calls the website internal API with the token header and returns JSON unchanged', async () => {
  const prevUrl = process.env.WEBSITE_INTERNAL_URL;
  const prevToken = process.env.INTERNAL_API_TOKEN;
  process.env.WEBSITE_INTERNAL_URL = 'http://website.test.svc:4321';
  process.env.INTERNAL_API_TOKEN = 'shared-secret';

  const grouped = { found: [{ id: 1, company: 'Acme', role_title: 'Dev', dossier_count: 0 }], drafting: [], applied: [], interviewing: [], offered: [] };
  let calledUrl: string | undefined;
  let calledHeaders: Record<string, string> | undefined;
  const fakeFetch = async (url: string, init?: { headers?: Record<string, string> }) => {
    calledUrl = url;
    calledHeaders = init?.headers;
    return { ok: true, json: async () => grouped } as Response;
  };

  try {
    const result = await fetchApplicationsList(fakeFetch as unknown as typeof fetch);
    assert.equal(calledUrl, 'http://website.test.svc:4321/api/internal/applications/list');
    assert.equal(calledHeaders?.['x-internal-token'], 'shared-secret');
    assert.deepEqual(result, grouped);
  } finally {
    if (prevUrl === undefined) delete process.env.WEBSITE_INTERNAL_URL; else process.env.WEBSITE_INTERNAL_URL = prevUrl;
    if (prevToken === undefined) delete process.env.INTERNAL_API_TOKEN; else process.env.INTERNAL_API_TOKEN = prevToken;
  }
});

// ── Server route: postTimelineEvent ──────────────────────────────────────
// POST /api/applications/:id/timeline forwards to the website's internal
// timeline write API.

test('postTimelineEvent: forwards job_id/event_type/notes to the website internal API', async () => {
  const prevUrl = process.env.WEBSITE_INTERNAL_URL;
  const prevToken = process.env.INTERNAL_API_TOKEN;
  process.env.WEBSITE_INTERNAL_URL = 'http://website.test.svc:4321';
  process.env.INTERNAL_API_TOKEN = 'shared-secret';

  let calledUrl: string | undefined;
  let calledInit: { method?: string; headers?: Record<string, string>; body?: string } | undefined;
  const fakeFetch = async (url: string, init?: typeof calledInit) => {
    calledUrl = url;
    calledInit = init;
    return { ok: true, json: async () => ({ id: 7, created_at: '2026-09-17T12:00:00.000Z' }) } as Response;
  };

  try {
    const result = await postTimelineEvent(5, 'interview_feedback', 'went well', fakeFetch as unknown as typeof fetch);
    assert.equal(calledUrl, 'http://website.test.svc:4321/api/internal/applications/timeline');
    assert.equal(calledInit?.method, 'POST');
    assert.equal(calledInit?.headers?.['x-internal-token'], 'shared-secret');
    assert.deepEqual(JSON.parse(calledInit?.body ?? '{}'), { job_id: 5, event_type: 'interview_feedback', notes: 'went well' });
    assert.deepEqual(result, { id: 7, created_at: '2026-09-17T12:00:00.000Z' });
  } finally {
    if (prevUrl === undefined) delete process.env.WEBSITE_INTERNAL_URL; else process.env.WEBSITE_INTERNAL_URL = prevUrl;
    if (prevToken === undefined) delete process.env.INTERNAL_API_TOKEN; else process.env.INTERNAL_API_TOKEN = prevToken;
  }
});

// ── Client UI: renderApplicationsBoard ───────────────────────────────────
// Pure view-model builder (no DOM), node-testable — Vorbild: buildLobbyViewModel.

const emptyData: ApplicationsData = { found: [], drafting: [], applied: [], interviewing: [], offered: [] };

test('renderApplicationsBoard: builds one column per status, in the fixed Kanban order', () => {
  const vm = renderApplicationsBoard(emptyData);
  assert.deepEqual(vm.columns.map((c) => c.status), ['found', 'drafting', 'applied', 'interviewing', 'offered']);
});

test('renderApplicationsBoard: places jobs into their status column', () => {
  const data: ApplicationsData = {
    found: [{ id: 1, company: 'Acme', role_title: 'Dev', dossier_count: 0 }],
    drafting: [],
    applied: [
      { id: 2, company: 'Globex', role_title: 'QA', dossier_count: 2 },
      { id: 3, company: 'Initech', role_title: 'PM', dossier_count: 1 },
    ],
    interviewing: [],
    offered: [],
  };
  const vm = renderApplicationsBoard(data);
  const found = vm.columns.find((c) => c.status === 'found');
  const applied = vm.columns.find((c) => c.status === 'applied');
  assert.equal(found?.cards.length, 1);
  assert.equal(found?.cards[0].company, 'Acme');
  assert.equal(applied?.cards.length, 2);
  assert.equal(applied?.cards[1].company, 'Initech');
});

test('renderApplicationsBoard: an empty status still yields an empty (not missing) column', () => {
  const vm = renderApplicationsBoard(emptyData);
  const drafting = vm.columns.find((c) => c.status === 'drafting');
  assert.ok(drafting, 'drafting column must exist even with zero jobs');
  assert.deepEqual(drafting?.cards, []);
});
