import { defineConfig } from 'vitest/config';
import path from 'path';

// Shared modules are now inlined in shared/
const sharedRoot = path.resolve(__dirname, 'shared');

export default defineConfig({
  root: path.resolve(__dirname, 'client'),
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'client', 'src') },
      { find: '@shared', replacement: path.resolve(sharedRoot, 'videovault') },
      { find: '@assets', replacement: path.resolve(__dirname, 'attached_assets') },
      // Stub heavy instant-search path during tests
      {
        find: '@/services/enhanced-filter-engine',
        replacement: path.resolve(
          __dirname,
          'client',
          'src',
          'test',
          'mocks',
          'enhanced-filter-engine.ts'
        ),
      },
      // Stub local relative imports to adaptive thumbnail manager
      {
        find: './adaptive-thumbnail-manager',
        replacement: path.resolve(
          __dirname,
          'client',
          'src',
          'test',
          'mocks',
          'adaptive-thumbnail-manager.ts'
        ),
      },
      {
        find: '@/services/adaptive-thumbnail-manager',
        replacement: path.resolve(
          __dirname,
          'client',
          'src',
          'test',
          'mocks',
          'adaptive-thumbnail-manager.ts'
        ),
      },
      {
        find: './webcodecs-thumbnail-service',
        replacement: path.resolve(
          __dirname,
          'client',
          'src',
          'test',
          'mocks',
          'webcodecs-thumbnail-service.ts'
        ),
      },
      {
        find: '@/services/webcodecs-thumbnail-service',
        replacement: path.resolve(
          __dirname,
          'client',
          'src',
          'test',
          'mocks',
          'webcodecs-thumbnail-service.ts'
        ),
      },
      {
        find: './enhanced-thumbnail-service',
        replacement: path.resolve(
          __dirname,
          'client',
          'src',
          'test',
          'mocks',
          'enhanced-thumbnail-service.ts'
        ),
      },
      {
        find: '@/services/enhanced-thumbnail-service',
        replacement: path.resolve(
          __dirname,
          'client',
          'src',
          'test',
          'mocks',
          'enhanced-thumbnail-service.ts'
        ),
      },
      {
        find: '@videovault-player',
        replacement: path.resolve(
          __dirname,
          '..',
          'packages',
          'videovault-player',
          'src'
        ),
      },
      {
        find: 'react',
        replacement: path.resolve(__dirname, 'node_modules', 'react'),
      },
      {
        find: 'react-dom',
        replacement: path.resolve(__dirname, 'node_modules', 'react-dom'),
      },
      {
        find: 'zod',
        replacement: path.resolve(__dirname, 'node_modules', 'zod'),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    pool: 'threads',
    maxWorkers: 1,
    isolate: true,
    bail: 1,
    testTimeout: 20000,
    hookTimeout: 10000,
    teardownTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: '../coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // tests and typings
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/test/**/*',
        'src/**/*.d.ts',
        'src/vite-env.d.ts',
        // auto-generated UI primitives and non-critical views
        'src/components/ui/**',
        'src/components/admin/**',
        'src/components/layout/**',
        'src/pages/**',
        // web workers and integration-heavy stubs
        'src/services/workers/**',
        // heavy thumbnail and codec services that are exercised via higher-level tests
        'src/services/video-thumbnail.ts',
        'src/services/enhanced-thumbnail-service.ts',
        'src/services/webcodecs-thumbnail-service.ts',
        // optional runtime caches and IndexedDB helpers
        'src/services/sprite-indexeddb.ts',
        'src/services/sprite-cache.ts',
      ],
      thresholds: {
        // Keep sane global minimums to catch regressions
        global: {
          branches: 55,
          functions: 40,
          lines: 50,
          statements: 50,
        },
        // Maintain quality bar on core data layers
        'src/services/filter-engine.ts': { branches: 90, functions: 95, lines: 95, statements: 95 },
        'src/services/sort-engine.ts': { branches: 60, functions: 60, lines: 90, statements: 90 },
        'src/services/rename-engine.ts': { branches: 85, functions: 95, lines: 95, statements: 95 },
        'src/services/directory-database.ts': { branches: 90, functions: 95, lines: 95, statements: 95 },
        'src/services/video-database.ts': { branches: 85, functions: 95, lines: 95, statements: 95 },
        // UIs that have targeted tests
        'src/components/ErrorBoundary.tsx': { branches: 80, functions: 70, lines: 80, statements: 80 },
      }
    },
  },
});
