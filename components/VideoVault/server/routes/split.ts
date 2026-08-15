import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../middleware/async-error-handler';
import { splitVideoOnServer, type ServerSplitParams } from '../handlers/split-handler';
import { db } from '../db';

const router = Router();

const authServiceUrlRaw = process.env.AUTH_SERVICE_URL || 'http://localhost:5500';
const AUTH_SERVICE_API_URL = (() => {
  const u = authServiceUrlRaw.replace(/\/+$/, '');
  return u.endsWith('/api') ? u : `${u}/api`;
})();

function extractAccessToken(req: Request): string | null {
  const authHeader = (req.headers.authorization as string) || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  const cookies = (req as any).cookies as Record<string, string> | undefined;
  return (cookies?.accessToken as string | undefined) || null;
}

async function isAuthenticated(req: Request): Promise<boolean> {
  const token = extractAccessToken(req);
  if (!token) return false;
  try {
    const r = await fetch(`${AUTH_SERVICE_API_URL}/auth/verify`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return false;
    const data = await (r.json() as Promise<{ user: unknown } | null>).catch(() => null);
    return Boolean(data && (data as { user?: unknown }).user);
  } catch {
    return false;
  }
}

export async function splitRouteHandler(req: Request, res: Response): Promise<void> {
  if (!(await isAuthenticated(req))) {
    res.status(401).json({ success: false, message: 'Unauthorized', code: 'permission_denied' });
    return;
  }

  const { id } = req.params;
  const { sourcePath, rootKey, splitTimeSeconds, first, second } = req.body ?? {};

  if (!sourcePath || typeof splitTimeSeconds !== 'number' || !first || !second) {
    res.status(400).json({ success: false, message: 'Missing required fields', code: 'invalid_split' });
    return;
  }

  const params: ServerSplitParams = { sourceId: id, sourcePath, rootKey, splitTimeSeconds, first, second };
  const result = await splitVideoOnServer(params, db);
  res.status(result.success ? 200 : 422).json(result);
}

router.post('/:id/split', asyncHandler(splitRouteHandler));

export default router;
