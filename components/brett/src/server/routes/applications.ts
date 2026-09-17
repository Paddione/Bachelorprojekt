// brett/src/server/routes/applications.ts
// Applications Kanban proxy (T900233, Phase 4): Brett has no direct access
// to the website DB (Prior-Art T002829 — cross-service calls use an
// INTERNAL_API_TOKEN-gated internal endpoint instead of a second DB
// connection). This router proxies to the website's
// /api/internal/applications/* endpoints created in Phase 4 Tasks 1+2.

import { Router } from 'express';
import * as auth from '../auth';

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

// Application data and interview notes are operator data, not board-session data.
// Keep both endpoints admin-only; otherwise any authenticated Brett user could read
// the entire pipeline or append arbitrary notes.
applicationsRouter.get('/api/applications', auth.requireAdmin, asyncHandler(async (_req: any, res: any) => {
  const data = await fetchApplicationsList();
  res.json(data);
}));

applicationsRouter.post('/api/applications/:id/timeline', auth.requireAdmin, asyncHandler(async (req: any, res: any) => {
  const jobId = Number(req.params.id);
  const { event_type, notes } = req.body || {};
  if (!Number.isSafeInteger(jobId) || jobId < 1 || typeof event_type !== 'string' || !event_type.trim() || event_type.length > 100
    || (notes !== undefined && (typeof notes !== 'string' || notes.length > 10_000))) {
    return res.status(400).json({ error: 'invalid job id, event_type or notes' });
  }
  const result = await postTimelineEvent(jobId, event_type, notes);
  res.json(result);
}));
