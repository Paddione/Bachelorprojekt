import { defineConfig } from 'vitest/config';
import path from 'path';

const TEST_DB_URL =
    process.env.TEST_DATABASE_URL ||
    'postgresql://videovault_user:videovault_test_pass@localhost:5433/videovault_test';

const currentDir = import.meta.dirname ?? path.resolve();

export default defineConfig({
    root: path.resolve(currentDir, 'server'),
    resolve: {
        alias: {
            'zod': path.resolve(currentDir, 'node_modules', 'zod'),
            '@shared': path.resolve(currentDir, 'shared', 'videovault'),
        },
    },
    test: {
        environment: 'node',
        globals: true,
        globalSetup: [path.resolve(currentDir, 'server', 'test', 'globalSetup.ts')],
        setupFiles: [path.resolve(currentDir, 'server', 'test', 'setup.ts')],
        env: {
            DATABASE_URL: TEST_DB_URL,
        },
    },
});
