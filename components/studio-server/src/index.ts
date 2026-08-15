import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { join } from 'node:path';
import pinoHttp from 'pino-http';
import { loadConfig } from './config';
import { log } from './log';
import { makeDb } from './db/client';
import { runMigrations } from './db/migrate';
import { makeRepo } from './db/repo';
import { makeAuthMiddleware } from './http/middleware';
import { makeApiRouter } from './http/routes';
import { makeHealthRouter } from './http/routes/health';

async function main() {
  const cfg = loadConfig();
  log.info({ port: cfg.port }, 'studio-server starting');

  const { pool } = makeDb(cfg);
  try {
    await runMigrations(pool);
  } catch (e: any) {
    log.warn({ err: e.message }, 'migrations skipped (no DB)');
  }
  const repo = makeRepo(pool);

  const app = express();
  app.use(pinoHttp({ logger: log as any }));
  app.use(express.json({ limit: '25mb' }));

  app.use(makeHealthRouter());

  const auth = makeAuthMiddleware({ issuers: cfg.issuers });
  app.use('/api', makeApiRouter({ repo, auth, llmRouterUrl: cfg.llmRouterUrl, whisperUrl: cfg.whisperUrl }));

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = typeof err.code === 'number' && err.code >= 400 && err.code < 600 ? err.code : 500;
    res.status(status).json({ error: err.message ?? 'internal error' });
  });

  const publicDir = join(__dirname, '../public');
  app.use(express.static(publicDir));
  const indexHtml = join(publicDir, 'index.html');
  app.get(/^(?!\/api).*/, (_req, res, next) => {
    res.sendFile(indexHtml, (err) => { if (err) next(); });
  });

  const httpServer = createServer(app);
  httpServer.listen(cfg.port, () => log.info({ port: cfg.port }, 'studio-server listening'));

  const shutdown = async () => {
    log.info('shutdown begin');
    httpServer.close();
    await pool.end().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => { log.error({ err: e.message, stack: e.stack }, 'fatal'); process.exit(1); });
