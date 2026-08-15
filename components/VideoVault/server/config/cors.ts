import cors, { CorsOptions } from 'cors';

export function createCorsMiddleware() {
    const devOrigins = [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:5000',
        'http://127.0.0.1:5000',
        'http://localhost:5100',
        'http://127.0.0.1:5100',
        'http://localhost:5101',
        'http://127.0.0.1:5101',
    ];

    const envOrigins = (process.env.CORS_ORIGINS || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

    const allowedOrigins =
        envOrigins.length > 0
            ? envOrigins
            : process.env.NODE_ENV === 'development'
                ? devOrigins
                : [];

    const originCheck: CorsOptions['origin'] = (origin, callback) => {
        // Allow requests without Origin (e.g., curl)
        if (!origin) return callback(null, true);

        // Always allow localhost/127.0.0.1 in development, regardless of port
        if (
            process.env.NODE_ENV === 'development' &&
            /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
        ) {
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) return callback(null, true);

        // Deny without throwing to avoid 500s
        return callback(null, false);
    };

    return cors({
        origin: originCheck,
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Requested-With', 'Authorization'],
        maxAge: 600,
    });
}
