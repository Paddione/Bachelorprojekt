import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wrapper for async Route Handler
 * Avoids try-catch in every handler
 */
export const asyncHandler = (fn: RequestHandler): RequestHandler => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

/**
 * Typed Error Classes
 */
export class AppError extends Error {
    constructor(
        public statusCode: number,
        message: string,
        public isOperational = true
    ) {
        super(message);
        Object.setPrototypeOf(this, AppError.prototype);
    }
}

export class ValidationError extends AppError {
    constructor(message: string, public fields?: Record<string, string>) {
        super(400, message);
    }
}

