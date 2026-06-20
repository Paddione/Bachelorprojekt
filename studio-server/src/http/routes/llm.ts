import { Router, raw } from 'express';
import type { Repo } from '../../db/repo';
import { makeLlmClient } from '../../llm/client';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RTL_LANGS = new Set(['fa', 'ar']);

export function makeLlmRouter(repo: Repo, llmRouterUrl: string): Router {
  const r = Router();
  const llm = makeLlmClient(llmRouterUrl);

  r.post('/llm/answer', async (req, res) => {
    const { sessionId, levelNo, prompt, input, profileFields } = req.body ?? {};
    if (!sessionId || !UUID_RE.test(sessionId)) { res.status(400).json({ error: 'sessionId required' }); return; }
    if (!Number.isInteger(levelNo) || levelNo < 1 || levelNo > 10) { res.status(400).json({ error: 'levelNo 1..10 required' }); return; }

    const stds = await repo.getStandardLevels();
    const std = stds.find(s => s.level_no === levelNo);
    const stdPrompt = std?.prompt ?? '';
    const sysPrompt = (prompt && String(prompt)) || stdPrompt;

    const activeFields = (profileFields ?? []).filter((f: any) => f && f.active);
    const profileCtx = activeFields.length
      ? `\n\nKlient:innen-Kontext (aktive Felder):\n` + activeFields.map((f: any) => `- ${f.label}: ${f.value}`).join('\n')
      : '';

    try {
      const userPrompt = `${input ?? ''}${profileCtx}`;
      const answer = await llm.chatAnswer(sysPrompt, userPrompt);
      await repo.upsertLevel(sessionId, levelNo, { answer });
      res.json({ answer });
    } catch (e: any) {
      res.status(502).json({ error: 'llm_unavailable', detail: e.message });
    }
  });

  r.post('/llm/translate', async (req, res) => {
    const { text, targetLang } = req.body ?? {};
    if (!text || !targetLang) { res.status(400).json({ error: 'text + targetLang required' }); return; }
    try {
      const translated = await llm.translate(String(text), String(targetLang));
      res.json({ translated, rtl: RTL_LANGS.has(String(targetLang)) });
    } catch (e: any) {
      res.status(502).json({ error: 'llm_unavailable', detail: e.message });
    }
  });

  return r;
}
