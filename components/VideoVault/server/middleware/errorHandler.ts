import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';
import { AppError, ValidationError } from './async-error-handler';
import { ZodError } from 'zod';

export function globalErrorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
    // Log Error with context
    logger.error('Request error', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userId: (req as any).user?.id,
    });

    // Zod Validation Errors
    if (err instanceof ZodError) {
        return res.status(400).json({
            error: 'Validation failed',
            details: err.errors.map(e => ({
                field: e.path.join('.'),
                message: e.message,
            })),
        });
    }

    // App Errors (expected)
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            error: err.message,
            ...(err instanceof ValidationError && err.fields ? { fields: err.fields } : {}),
        });
    }

    // CSRF Error (already handled, but for completeness)
    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({
            error: 'Invalid CSRF token',
        });
    }

    // Default 500 Internal Server Error
    const statusCode = err.statusCode || 500;
    const message =
        process.env.NODE_ENV === 'development'
            ? err.message
            : 'Internal server error';

    // Extract requestId from headers
    const requestId = req.headers['x-request-id'] as string | undefined;

    res.status(statusCode).json({
        message,
        ...(requestId ? { requestId } : {}),
        ...(err.code ? { code: err.code } : {}),
        ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
    });
}
