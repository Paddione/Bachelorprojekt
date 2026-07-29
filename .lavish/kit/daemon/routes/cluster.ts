// routes/cluster.ts — STUB handlers for /api/admin/cluster/*
// Real data sources in p2 (kubectl)
import type { Context } from 'hono';
import { getCached, setCache } from '../lib/cache';

export async function podsListHandler(c: Context) {
  try {
    // STUB: In p2 durch kubectl get pods ersetzen
    const data = {
      pods: [
        { name: 'stub-pod-1', namespace: 'workspace', status: 'Running', restarts: 0, age: '2026-07-28T12:00:00Z' },
      ],
    };
    const entry = setCache('pods-all', data, 30_000);
    return c.json({ ...data, fetchedAt: entry.fetchedAt });
  } catch (e: any) {
    return c.json({ error: e.message, fetchedAt: new Date().toISOString() });
  }
}

export async function warningsHandler(c: Context) {
  try {
    // STUB: In p2 durch echte Cluster-Warnings ersetzen
    return c.json({
      warnings: [],
      fetchedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return c.json({ error: e.message, fetchedAt: new Date().toISOString() });
  }
}
