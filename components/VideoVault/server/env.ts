import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Initialize fallbacks for Vault-synced secrets
const fallbacks: Record<string, string> = {
    DATABASE_URL: 'VIDEO_DATABASE_URL',
    PORT: 'VIDEO_PORT',
    NODE_ENV: 'VIDEO_NODE_ENV',
    SESSION_SECRET: 'VIDEO_SESSION_SECRET',
    TRUST_PROXY: 'VIDEO_TRUST_PROXY',
    MEDIA_ROOT: 'VIDEO_MEDIA_ROOT',
    PROCESSED_MEDIA_PATH: 'VIDEO_PROCESSED_MEDIA_PATH',
};

for (const [target, source] of Object.entries(fallbacks)) {
    if (!process.env[target] && process.env[source]) {
        process.env[target] = process.env[source];
        console.log(`Setting fallback ${target} from ${source}`);
    }
}

// Optional: load .env files if present (for local dev)
const rootDir = process.cwd();
const envFiles = [
    '.env',
    `.env.${process.env.NODE_ENV}`,
    'env/.env-app.local'
];

for (const file of envFiles) {
    const envPath = path.resolve(rootDir, file);
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
    }
}
