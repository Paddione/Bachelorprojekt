import { defineConfig } from 'vitest/config';
import path from 'path';

const TEST_DB_URL =
    process.env.TEST_DATABASE_URL ||
    'postgresql://videovault_user:videovault_test_pass@localhost:5433/videovault_test';

export default defineConfig({
    root: path.resolve(__dirname, 'server'),
    resolve: {
        alias: {
            'zod': path.resolve(__dirname, 'node_modules', 'zod'),
            '@shared': path.resolve(__dirname, 'shared', 'videovault'),
        },
    },
    test: {
        environment: 'node',
        globals: true,
        globalSetup: [path.resolve(__dirname, 'server', 'test', 'globalSetup.ts')],
        setupFiles: [path.resolve(__dirname, 'server', 'test', 'setup.ts')],
        env: {
            DATABASE_URL: TEST_DB_URL,
        },
    },
});
