import { Request, Response } from 'express';
import { db } from '../db';
import { appSettings } from '@shared/schema';
import { apiErrorSchema, ErrorCodes } from '@shared/errors';
import { setSettingRequestSchema, getSettingResponseSchema, setSettingResponseSchema } from '@shared/api';
import { eq } from 'drizzle-orm';

// In-memory fallback store when DB is unavailable or tables are missing
const MEM_STORE = new Map<string, string>();

export async function getSetting(req: Request, res: Response) {
  const key = req.params.key;
  try {
    if (!db) {
      const payload = { key, value: MEM_STORE.get(key) ?? null };
      return res.json(getSettingResponseSchema.parse(payload));
    }
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
    const payload = { key, value: row ? row.value : null };
    return res.json(getSettingResponseSchema.parse(payload));
  } catch (_e) {
    // If DB errors (e.g., table missing), fall back gracefully
    const payload = { key, value: MEM_STORE.get(key) ?? null };
    return res.json(getSettingResponseSchema.parse(payload));
  }
}

export async function setSetting(req: Request, res: Response) {
  const key = req.params.key;
  let value: unknown;
  try {
    ({ value } = setSettingRequestSchema.parse(req.body ?? {}));
  } catch (e) {
    return res.status(400).json(apiErrorSchema.parse({
      code: ErrorCodes.VALIDATION_ERROR,
      message: 'Invalid settings payload',
      details: e instanceof Error ? e.message : e,
    }));
  }
  const stored = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  try {
    if (!db) {
      MEM_STORE.set(key, stored);
      return res.json(setSettingResponseSchema.parse({ key, value: stored }));
    }
    const now = new Date();
    const [row] = await db
      .insert(appSettings)
      .values({ key, value: stored, updatedAt: now } as any)
      .onConflictDoUpdate({ target: appSettings.key, set: { value: stored, updatedAt: now } as any })
      .returning();
    return res.json(setSettingResponseSchema.parse({ key, value: row.value }));
  } catch (_e) {
    MEM_STORE.set(key, stored);
    return res.json(setSettingResponseSchema.parse({ key, value: stored }));
  }
}

export async function deleteSetting(req: Request, res: Response) {
  const key = req.params.key;
  try {
    if (!db) {
      MEM_STORE.delete(key);
      return res.json({ key, deleted: true });
    }
    await db.delete(appSettings).where(eq(appSettings.key, key));
    return res.json({ key, deleted: true });
  } catch (_e) {
    MEM_STORE.delete(key);
    return res.json({ key, deleted: true });
  }
}
