import './env';
import express, { type Request, Response, NextFunction } from 'express';
import { registerRoutes } from './routes';
import { setupVite, serveStatic, log } from './vite';
import { logger } from './lib/logger';
import { ensureDbReady, db as dbInstance, pool } from './db';
import { runMigrations } from './migrate';
import cookieParser from 'cookie-parser';
import { globalErrorHandler } from './middleware/errorHandler';
import { requestId, requestLogger, metricsMiddleware } from './middleware/observability';
import { setupSecurityHeaders } from './middleware/security';
import { setupRateLimiting } from './middleware/rate-limit';
import { createSessionMiddleware } from './config/session';
import { createCorsMiddleware } from './config/cors';
import { attachCsrfToken, csrfProtection } from './middleware/csrf';
import compression from 'compression';

import path from 'path';
import fs from 'fs';
import { RootsRegistry } from './lib/roots-registry';

const app = express();

// When behind a proxy/load balancer (e.g., Docker/NGINX), trust X-Forwarded-* for secure cookies
if (process.env.TRUST_PROXY === '1' || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Default request size limits (increased for large bulk operations)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Compression for better performance
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6, // Good balance between speed and compression
}));

// Serve media files from MEDIA_ROOT or default to Bibliothek
const mediaRoot = process.env.MEDIA_ROOT || path.join(process.cwd(), 'Bibliothek');
const processedEnvPath = process.env.PROCESSED_MEDIA_PATH;
const processedPath =
  processedEnvPath ||
  (fs.existsSync(path.join(mediaRoot, 'processed'))
    ? path.join(mediaRoot, 'processed')
    : path.join(mediaRoot, 'Processed'));

// Only mount processed media if path exists
if (fs.existsSync(processedPath)) {
  app.use('/media/processed', express.static(processedPath));
  logger.info('Processed media mounted', { path: processedPath });
} else {
  logger.warn('Processed media path not found', { path: processedPath });
}

app.use('/media', express.static(mediaRoot));

// Serve fixtures directory for test data (development only)
if (process.env.NODE_ENV !== 'production') {
  const fixturesPath = path.join(process.cwd(), 'fixtures');
  if (fs.existsSync(fixturesPath)) {
    app.use('/fixtures', express.static(fixturesPath));
    logger.info('Fixtures directory mounted', { path: fixturesPath });
  }
}

// Session configuration (Postgres-backed if DB configured)
app.use(createSessionMiddleware());

// CORS: apply only to /api and allow local origins in development
app.use('/api', createCorsMiddleware());

// Security Headers (Helmet.js)
setupSecurityHeaders(app);

// Rate Limiting (production only)
if (process.env.NODE_ENV === 'production') {
  setupRateLimiting(app);
}

// Cookies for CSRF protection and other features
app.use(cookieParser());

// CSRF protection for mutating routes under /api except in tests and development
const enableCsrf = process.env.NODE_ENV === 'production' && process.env.FAST_TESTS !== '1';
app.locals.csrfEnabled = enableCsrf;
if (enableCsrf) {
  app.use('/api', attachCsrfToken);
  app.use('/api', csrfProtection);
}

app.use(requestId);
app.use(metricsMiddleware);
app.use(requestLogger);

// Initialize roots registry from environment variables
RootsRegistry.init();

(async () => {
  // Initialize DB connection if configured
  if (process.env.DATABASE_URL && dbInstance) {
    try {
      await ensureDbReady();
      await runMigrations();

      // Clear transient video data on startup so the UI starts fresh.
      // File handles are session-based (lost on reload), so stale DB records
      // would show inaccessible videos. Preserves user config (settings,
      // presets, tags, directory roots, media progress).
      // KEEP server-indexed videos (any registered rootKey) — they have real
      // file paths, not session-based handles, and survive restarts.
      try {
        const { directoryRoots } = await import('@shared/schema');
        const knownRoots = await dbInstance.select({ rootKey: directoryRoots.rootKey }).from(directoryRoots);
        const rootKeys = knownRoots.map(r => r.rootKey);

        if (rootKeys.length > 0) {
          // Parameterized query: preserve videos with any known rootKey
          const placeholders = rootKeys.map((_, i) => `$${i + 1}`).join(', ');
          await pool!.query(
            `DELETE FROM videos WHERE root_key IS NULL OR root_key NOT IN (${placeholders})`,
            rootKeys,
          );
        } else {
          // No roots configured — purge all videos (all are transient)
          await pool!.query(`DELETE FROM videos WHERE root_key IS NULL`);
        }
        await pool!.query(`TRUNCATE thumbnails, scan_state, processing_jobs CASCADE`);
        logger.info('Cleared transient video data on startup (preserved server-indexed videos)', { rootKeys });
      } catch (cleanupErr) {
        logger.warn('Failed to clear transient data', { error: (cleanupErr as Error).message });
      }

      app.locals.db = dbInstance;
      logger.info('Database connection verified');

      // Hydrate roots registry from DB directory_roots table
      try {
        const { directoryRoots } = await import('@shared/schema');
        const dbRoots = await dbInstance.select().from(directoryRoots);
        RootsRegistry.registerFromDb(dbRoots);
      } catch (registryErr) {
        logger.warn('Failed to hydrate RootsRegistry from DB', { error: (registryErr as Error).message });
      }
    } catch (err) {
      logger.error('Failed to connect to database', { error: (err as Error).message });
      // Continue to boot so app remains accessible (may use in-memory fallbacks)
    }
  }

  // Initialize and start job queue (if database available)
  if (dbInstance) {
    try {
      const { initializeJobQueue } = await import('./lib/enhanced-job-queue');
      const { handleThumbnailGeneration } = await import('./handlers/thumbnail-handler');
      const { handleMetadataExtraction } = await import('./handlers/metadata-handler');

      // Get concurrency from environment or default to 4
      const concurrency = parseInt(process.env.JOB_QUEUE_CONCURRENCY || '4', 10);
      const jobQueue = initializeJobQueue(dbInstance, concurrency);

      // Register job handlers
      jobQueue.registerHandler('thumbnail', (payload: any, context) =>
        handleThumbnailGeneration(payload, context, dbInstance)
      );
      jobQueue.registerHandler('metadata', (payload: any, context) =>
        handleMetadataExtraction(payload, context, dbInstance)
      );

      // Start the job queue
      await jobQueue.start();
      app.locals.jobQueue = jobQueue;

      logger.info('Job queue initialized and started', { concurrency });

      // Cleanup old completed jobs on startup
      await jobQueue.clearCompleted(7);
    } catch (err) {
      logger.error('Failed to initialize job queue', { error: (err as Error).message, stack: (err as Error).stack });
    }
  }

  // Cleanup old logs on startup
  await logger.cleanup();

  const server = registerRoutes(app);

  // Run startup tasks in the background so the server can start immediately
  // (avoids blocking the health endpoint and triggering K8s startup probe kills)
  // Runs with or without DB — filesystem-based index generation works either way.
  if (process.env.NODE_ENV !== 'test') {
    import('./lib/startup-tasks').then(({ runStartupTasks }) =>
      runStartupTasks(dbInstance || null).catch((err) =>
        logger.warn('Startup tasks failed (non-fatal)', { error: (err as Error).message })
      )
    );
  }

  if (process.env.ENABLE_MOVIE_WATCHER !== '0') {
    const { startMovieWatcher, setMovieWatcherInstance } = await import('./lib/movie-watcher');
    const watcher = startMovieWatcher();
    if (watcher) setMovieWatcherInstance(watcher);
  }

  // Handle CSRF errors with 403 instead of 500
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (err && err.code === 'EBADCSRFTOKEN') {
      logger.warn('CSRF token invalid or missing', { path: req.path, method: req.method });
      return res.status(403).json({ message: 'Invalid CSRF token' });
    }
    return next(err);
  });

  app.use(globalErrorHandler);

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get('env') === 'development') {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Serve the app on the configured PORT; keep it stable for local development.
  const port = parseInt(process.env.PORT || '5000', 10);

  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (err: any) => {
        reject(err);
      };

      server.once('error', onError);
      server.listen({ port, host: '0.0.0.0', reusePort: true }, () => {
        server.off('error', onError);
        log(`serving on port ${port}`);
        resolve();
      });
    });
  } catch (err) {
    logger.error('Failed to bind server port', { error: (err as Error).message, port });
    process.exit(1);
  }
})();
