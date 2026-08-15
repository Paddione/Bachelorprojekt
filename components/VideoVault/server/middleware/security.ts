import helmet from 'helmet';
import { Express } from 'express';

export function setupSecurityHeaders(app: Express) {
    // Helmet for Security Headers
    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'"], // For Vite in Dev
                    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                    imgSrc: ["'self'", 'data:', 'blob:'],
                    mediaSrc: ["'self'", 'blob:'],
                    connectSrc: [
                        "'self'",
                        process.env.AUTH_SERVICE_URL || 'http://localhost:5500',
                        'https://*.korczewski.de'
                    ],
                    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                    objectSrc: ["'none'"],
                    upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
                },
            },
            crossOriginEmbedderPolicy: false, // For SharedArrayBuffer when needed
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true,
            },
        })
    );

    // Additional Security Headers
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        next();
    });
}
