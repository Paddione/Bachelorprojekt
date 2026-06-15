import session from 'express-session';
import connectPgSimpleInit from 'connect-pg-simple';
import { pool } from '../db';
import { logger } from '../lib/logger';

export function createSessionMiddleware() {
    const SESSION_SECRET = process.env.SESSION_SECRET;

    // Validation in Production
    if (process.env.NODE_ENV === 'production' && !SESSION_SECRET) {
        logger.error('SESSION_SECRET must be set in production!');
        process.exit(1);
    }

    // Warning for weak secret in Development
    if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
        logger.warn('Using weak or default session secret. Generate a strong secret for production!', {
            hint: 'Use: openssl rand -base64 32',
        });
    }

    const secret = SESSION_SECRET || 'dev-secret-DO-NOT-USE-IN-PRODUCTION';
    const PgStore = connectPgSimpleInit(session);
    const store = pool ? new PgStore({ pool, createTableIfMissing: true }) : undefined;

    return session({
        store,
        secret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
        },
    });
}
