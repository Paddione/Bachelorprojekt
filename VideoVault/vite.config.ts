import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// Shared modules are now inlined in shared/
const sharedRoot = path.resolve(import.meta.dirname, "shared");

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
      process.env.REPL_ID !== undefined
      ? [
        await import("@replit/vite-plugin-cartographer").then((m) =>
          m.cartographer(),
        ),
      ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(sharedRoot, "videovault"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      "@design-system": path.resolve(sharedRoot, "design-system"),
      "@videovault-player": path.resolve(import.meta.dirname, "..", "packages", "videovault-player", "src"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks for better caching
          'react-vendor': ['react', 'react-dom'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select'],
          'utils-vendor': ['date-fns', 'clsx', 'tailwind-merge'],
          'lucide-vendor': ['lucide-react'],
        },
        chunkFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId ? chunkInfo.facadeModuleId.split('/').pop() : 'chunk';
          return `js/[name]-[hash].js`;
        },
        entryFileNames: 'js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (!assetInfo.name) return 'assets/[name]-[hash][extname]';

          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
            return `images/[name]-[hash][extname]`;
          }
          if (/woff2?|eot|ttf|otf/i.test(ext)) {
            return `fonts/[name]-[hash][extname]`;
          }
          return `assets/[name]-[hash][extname]`;
        },
      },
    },
    // Enable source maps for debugging
    sourcemap: process.env.NODE_ENV === 'development',
    // Optimize chunk size warnings
  chunkSizeWarningLimit: 1500,
    // Use esbuild minification (built-in)
    minify: 'esbuild',
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts']
  },
  // Performance optimizations
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'lucide-react',
      'date-fns',
      'clsx',
      'tailwind-merge'
    ],
    exclude: ['@replit/vite-plugin-cartographer', '@ffmpeg/ffmpeg', '@ffmpeg/core']
  }
});
