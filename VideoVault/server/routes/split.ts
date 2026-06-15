import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../middleware/async-error-handler';
import { splitVideoOnServer, type ServerSplitParams } from '../handlers/split-handler';
import { db } from '../db';

const router = Router();

export async function splitRouteHandler(req: Request, res: Response): Promise<void> {
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
