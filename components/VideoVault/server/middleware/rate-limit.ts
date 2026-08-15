import rateLimit from 'express-rate-limit';
import { Express } from 'express';
import { logger } from '../lib/logger';

export function setupRateLimiting(app: Express) {
    // Fully disable rate limiting in test/dev environments for browser testing throughput
    const isRateLimitDisabled = (
        process.env.DISABLE_RATE_LIMITING === 'true' ||
        process.env.NODE_ENV === 'test' ||
        process.env.NODE_ENV === 'development'
    );

    if (isRateLimitDisabled) {
        return;
    }

    // Bypass key for production testing (e.g., OpenClaw browser tests)
    const rateLimitBypassKey = process.env.RATE_LIMIT_BYPASS_KEY || '';

    // General API Rate Limit
    const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 500, // max 500 requests per IP per window
        skip: (req) => {
            // Health endpoints are always exempt
            const healthPaths = ['/health', '/db/health'];
            if (healthPaths.includes(req.path)) return true;
            // Read-only GET requests are exempt — only rate-limit mutations
            if (req.method === 'GET') return true;
            if (rateLimitBypassKey && req.headers['x-rate-limit-bypass'] === rateLimitBypassKey) return true;
            return false;
        },
        message: {
            error: 'Too many requests from this IP. Please try again later.',
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            logger.warn('Rate limit exceeded', {
                ip: req.ip,
                path: req.path,
            });
            res.setHeader('Retry-After', String(Math.ceil(15 * 60)));
            res.status(429).json({
                error: 'Too many requests. Please try again later.',
                retryAfterSeconds: 15 * 60,
            });
        },
    });

    // Stricter limit for Auth endpoints
    const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 5, // only 5 login attempts
        skipSuccessfulRequests: true,
        handler: (_req, res) => {
            res.setHeader('Retry-After', String(Math.ceil(15 * 60)));
            res.status(429).json({
                error: 'Too many login attempts. Please wait 15 minutes.',
                retryAfterSeconds: 15 * 60,
            });
        },
    });

    // Upload-specific limit (larger payloads)
    const uploadLimiter = rateLimit({
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 20, // max 20 uploads per hour
        handler: (_req, res) => {
            res.setHeader('Retry-After', String(Math.ceil(60 * 60)));
            res.status(429).json({
                error: 'Upload limit reached. Please wait one hour.',
                retryAfterSeconds: 60 * 60,
            });
        },
    });

    // Apply middleware
    app.use('/api/', apiLimiter);
    app.use('/api/auth/', authLimiter);
    app.use('/api/upload/', uploadLimiter);
    app.use('/api/thumbnails/', uploadLimiter);

    // Rate limit warning: adds X-RateLimit-Warning header when remaining < 20%
    app.use((req, res, next) => {
        const originalWriteHead = res.writeHead;
        res.writeHead = function (this: typeof res, ...args: Parameters<typeof res.writeHead>) {
            const limit = parseInt(res.getHeader('RateLimit-Limit') as string, 10);
            const remaining = parseInt(res.getHeader('RateLimit-Remaining') as string, 10);
            if (!isNaN(limit) && !isNaN(remaining) && limit > 0) {
                const threshold = Math.ceil(limit * 0.2);
                if (remaining <= threshold && remaining > 0) {
                    res.setHeader('X-RateLimit-Warning', 'true');
                }
            }
            return originalWriteHead.apply(this, args);
        } as typeof res.writeHead;
        next();
    });
}
