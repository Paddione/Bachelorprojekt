import express, { type Express } from 'express';
import session from 'express-session';
import { registerRoutes } from '../../server/routes';
import { globalErrorHandler } from '../../server/middleware/errorHandler';

export function createTestServer(setupRoutes?: (app: Express) => void) {
  const app = express();
  app.set('env', 'test');
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // minimal session setup (memory store in tests)
  const SESSION_SECRET = 'testsecret';
  // Do not supply a store (so express-session will use MemoryStore) during tests
  app.use(
    session({
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 1000 * 60 * 60 },
    }),
  );

  // Add request ID middleware mock (must be before routes)
  app.use((req, _res, next) => {
    req.headers['x-request-id'] = req.headers['x-request-id'] || 'test-req-id';
    next();
  });

  // In tests, return the Express app directly to Supertest to avoid binding to a port
  const httpServer = registerRoutes(app);

  if (setupRoutes) {
    setupRoutes(app);
  }

  app.use(globalErrorHandler);

  return { app, httpServer };
}
