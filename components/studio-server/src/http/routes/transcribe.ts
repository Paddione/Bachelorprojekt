import { Router, raw } from 'express';
import { transcribe } from '../../llm/whisper';

export function makeTranscribeRouter(whisperUrl: string): Router {
  const r = Router();

  r.post('/transcribe', raw({ type: 'audio/*', limit: '25mb' }), async (req, res) => {
    const mime = req.headers['content-type'] || 'audio/webm';
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: 'audio body required' });
      return;
    }
    try {
      const text = await transcribe(whisperUrl, req.body, String(mime));
      res.json({ text });
    } catch (e: any) {
      res.status(502).json({ error: 'whisper_unavailable', detail: e.message });
    }
  });

  return r;
}
