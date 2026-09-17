// brett/src/server/routes/applications.ts
// Applications Kanban proxy (T900233, Phase 4): Brett has no direct access
// to the website DB (Prior-Art T002829 — cross-service calls use an
// INTERNAL_API_TOKEN-gated internal endpoint instead of a second DB
// connection). This router proxies to the website's
// /api/internal/applications/* endpoints created in Phase 4 Tasks 1+2.

import { Router } from 'express';

function websiteBaseUrl(): string {
  return process.env.WEBSITE_INTERNAL_URL || 'http://website.website.svc.cluster.local:4321';
}

function internalToken(): string {
  return process.env.INTERNAL_API_TOKEN || '';
}

/** Fetches the grouped applications list from the website's internal API and returns it unchanged. */
export async function fetchApplicationsList(fetchImpl: typeof fetch = fetch): Promise<unknown> {
  const res = await fetchImpl(`${websiteBaseUrl()}/api/internal/applications/list`, {
    headers: { 'x-internal-token': internalToken() },
  });
  return res.json();
}

/** Forwards a timeline event to the website's internal write API. */
export async function postTimelineEvent(
  jobId: number,
  eventType: string,
  notes: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const res = await fetchImpl(`${websiteBaseUrl()}/api/internal/applications/timeline`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-token': internalToken(),
    },
    body: JSON.stringify({ job_id: jobId, event_type: eventType, notes }),
  });
  return res.json();
}

function asyncHandler(fn: any) {
  return (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next);
}

export const applicationsRouter = Router();

applicationsRouter.get('/api/applications', asyncHandler(async (_req: any, res: any) => {
  const data = await fetchApplicationsList();
  res.json(data);
}));

applicationsRouter.post('/api/applications/:id/timeline', asyncHandler(async (req: any, res: any) => {
  const jobId = Number(req.params.id);
  const { event_type, notes } = req.body || {};
  if (!Number.isFinite(jobId) || typeof event_type !== 'string' || !event_type) {
    return res.status(400).json({ error: 'job id and event_type required' });
  }
  const result = await postTimelineEvent(jobId, event_type, notes);
  res.json(result);
}));
