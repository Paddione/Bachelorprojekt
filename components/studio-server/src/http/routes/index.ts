import { Router } from 'express';
import type { Repo } from '../../db/repo';
import type { AuthMiddleware } from '../middleware';
import { makeClientsRouter } from './clients';
import { makeSessionsRouter } from './sessions';
import { makeLevelsRouter } from './levels';
import { makeAdminRouter } from './admin';
import { makeLlmRouter } from './llm';
import { makeTranscribeRouter } from './transcribe';
import { makeExportRouter } from './export';

export interface ApiDeps {
  repo: Repo;
  auth: AuthMiddleware;
  llmRouterUrl: string;
  whisperUrl: string;
}

export function makeApiRouter(deps: ApiDeps): Router {
  const r = Router();
  r.use(deps.auth.requireUser);
  r.use(makeClientsRouter(deps.repo));
  r.use(makeSessionsRouter(deps.repo));
  r.use(makeLevelsRouter(deps.repo));
  r.use(makeAdminRouter(deps.repo));
  r.use(makeLlmRouter(deps.repo, deps.llmRouterUrl));
  r.use(makeTranscribeRouter(deps.whisperUrl));
  r.use(makeExportRouter(deps.repo));
  return r;
}
