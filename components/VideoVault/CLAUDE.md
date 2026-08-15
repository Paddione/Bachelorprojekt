# CLAUDE.md

Guidance for Claude Code when working in the VideoVault codebase.

## Overview

VideoVault is a client-first video management app. The browser is the primary data store (localStorage + File System Access API), with optional PostgreSQL persistence. Built with React, TypeScript, Vite, Express, Tailwind CSS, and Drizzle ORM.

**Key constraint**: Chromium-based browsers only for File System Access API. File handles are session-based and lost on reload.

**Documentation references:**
- [README.md](README.md) -- Quick start, environment setup, testing guide, architecture, API reference
- [docs/services/videovault.md](../docs/services/videovault.md) -- Deep dive: client-first architecture, core services
- [docs/guides/testing.md](../docs/guides/testing.md) -- Shared testing patterns and CI
- [docs/guides/deployment.md](../docs/guides/deployment.md) -- Deployment to k3s
- [docs/architecture/database.md](../docs/architecture/database.md) -- Shared PostgreSQL setup

## Commands

### Development

```bash
npm run dev                    # Local dev server (port 5100)
npm run docker:dev             # Docker dev with hot reload (port 5000)
npm run docker:dev:detached    # Docker dev in background
npm run docker:down            # Stop Docker environment
npm run docker:restart         # Restart Docker environment
npm run docker:logs            # View Docker logs
npm run docker:shell           # Shell into container
npm run docker:clean           # Remove containers and volumes
```

### Testing

```bash
# Full 6-stage pipeline (pre-deploy)
npm run test:all               # types -> unit -> integration -> e2e -> build -> health
npm run test:pre-deploy        # Alias for test:all
npm run test:quick             # Types + unit only (~40-70s)

# Individual stages
npm run test:1:types           # TypeScript type checking (~5-10s)
npm run test:2:unit            # Unit tests with FAST_TESTS=1 (~30-60s)
npm run test:3:integration     # Server integration tests (~10-20s)
npm run test:4:e2e             # Playwright E2E in Docker (~2-5m)
npm run test:5:build           # Production build verification (~30-60s)
npm run test:6:health          # Final health check (instant)

# Subsets
npm run test:client            # Client tests only
npm run test:server            # Server tests only
npm run test:e2e               # Server integration tests (Vitest)
npm run test:watch             # Watch mode
npm run test:coverage:full     # Coverage report with thresholds

# Single file
npx vitest run client/src/services/VideoDatabase.test.ts
FAST_TESTS=1 npx vitest run client/src/services/filter-engine.test.ts

# Playwright
npm run docker:pw:all          # Full Playwright suite in Docker
npm run docker:pw:up           # Start Playwright environment
npm run docker:pw:run          # Run tests against running environment
npm run docker:pw:ui           # Interactive UI (http://localhost:9323)
npm run test:pw                # Local Playwright
npm run test:pw:ui             # Local Playwright UI
npm run test:pw:report         # Open HTML report
```

### Build and Production

```bash
npm run check                  # TypeScript type checking
npm run build                  # Production build
npm run start                  # Start production server
npm run verify                 # Typecheck + unit + server e2e + build
npm run db:push                # Apply Drizzle schema to Postgres
```

### Deployment

**Local development** uses Docker Compose (see Development commands above).

**Production** runs on **k3s** (lightweight Kubernetes). Do not use Docker Compose for production.

**Deploy with shell scripts** (build + push + restart):
```bash
../../k8s/scripts/deploy/deploy-videovault.sh                # Build, push, deploy
../../k8s/scripts/deploy/deploy-videovault.sh --manifests-only  # Manifest-only (config changes)
```

**Or use Skaffold** (alternative, requires defaultRepo — not usable from WSL2):
```bash
cd ../../k8s && skaffold run -p videovault   # Build + deploy VideoVault
```

K8s manifests: `k8s/services/videovault/`. Skaffold config: `k8s/skaffold.yaml`. Full deployment guide: `k8s/README.md`.

## Directory Structure

```
client/src/
  components/              # React components (PascalCase)
  hooks/                   # Custom hooks (useThing naming)
    use-video-manager.ts   # Central orchestration hook
  pages/                   # Route-level screens
  services/                # Core business logic
    video-database.ts      # localStorage persistence
    file-scanner.ts        # Directory scanning
    filter-engine.ts       # Standard filtering
    enhanced-filter-engine.ts  # Advanced filtering (FlexSearch; stubbed in tests)
    bulk-operations.ts     # Multi-select operations
    thumbnail-generator.ts # On-demand thumbnail generation
    filesystem-ops.ts      # File operations via FSAA
    rename-engine.ts       # Batch rename logic
    directory-database.ts  # Directory metadata
  test/                    # Test setup and mocks
  types/                   # TypeScript type definitions

server/
  routes/                  # Express route handlers
    persistence.ts         # Video/root/preset CRUD
    errors.ts              # Error tracking
    db.ts                  # Database health
    settings.ts            # App settings
    thumbnails.ts          # Thumbnail generation
    duplicates.ts          # Duplicate detection
    tag-ops.ts             # Tag management
  middleware/              # Express middleware
  lib/                     # Server utilities
  routes.ts                # Route registration

# Note: shared modules live in shared/videovault/

e2e/
  playwright/              # Playwright E2E specs
  server.*.e2e.test.ts     # Server E2E tests (Vitest)
```

## Core Services

| Service | File | Responsibility |
|---------|------|----------------|
| useVideoManager | `hooks/use-video-manager.ts` | Central state orchestration; components use this, not services directly |
| VideoDatabase | `services/video-database.ts` | localStorage CRUD for video metadata, categories, custom fields |
| FileScanner | `services/file-scanner.ts` | Directory scanning with `hardwareConcurrency`-based parallelism |
| FilterEngine | `services/filter-engine.ts` | Category, search, date, size, duration filtering |
| EnhancedFilterEngine | `services/enhanced-filter-engine.ts` | FlexSearch instant search; stubbed in tests |
| BulkOperationsService | `services/bulk-operations.ts` | Batch category, rename, move, delete with undo |
| ThumbnailGenerator | `services/thumbnail-generator.ts` | Worker-based encoding (OffscreenCanvas with fallback); not persisted |
| FilesystemOps | `services/filesystem-ops.ts` | File/folder CRUD via File System Access API |
| RenameEngine | `services/rename-engine.ts` | Batch rename patterns (prefix, suffix, numbering, case) |
| DirectoryDatabase | `services/directory-database.ts` | Directory metadata, scanned roots, hierarchies |

## Path Aliases

Always use aliases for imports:

```typescript
import { VideoDatabase } from '@/services/video-database';
import { ErrorCodes } from '@shared/errors';
```

Configured in `tsconfig.json` (paths), `vite.config.ts` (resolve.alias), and `vitest.config.ts` (resolve.alias + test stubs).

> **Note**: Shared modules are in `shared/videovault/`. The old `shared-infrastructure` symlink has been removed.

## Testing Strategy

### Vitest Configuration (`vitest.config.ts`)

- Enhanced services stubbed via aliases to avoid FlexSearch/WebCodecs deps
- Single-threaded execution (`singleThread: true`) to prevent race conditions
- `bail: 1` for fast failure
- jsdom environment
- Test setup: `client/src/test/setup.ts` (mocks localStorage, File System Access API)

### Coverage Thresholds (per-file)

| Service | Branches | Functions | Lines | Statements |
|---------|----------|-----------|-------|------------|
| filter-engine.ts | 90% | 95% | 95% | 95% |
| rename-engine.ts | 85% | 95% | 95% | 95% |
| directory-database.ts | 90% | 95% | 95% | 95% |
| video-database.ts | 85% | 95% | 95% | 95% |

Excluded from coverage: `components/ui/**`, `components/admin/**`, `components/layout/**`, `pages/**`, enhanced services, web workers.

### Playwright E2E

- Docker-based: Playwright container connects to `videovault-dev:5000` on `l2p-network`
- Pinned to `v1.55.0-jammy` (must match `@playwright/test` version)
- Artifacts stay inside container (no bind-mount) to avoid permission issues
- Optional MSW mocking: set `VITE_E2E_MSW=true` in `env/.env-playwright`

## Critical Constraints

1. **Browser compatibility**: Chromium only for File System Access API (Chrome, Edge, Opera)
2. **File handles**: Session-based, lost on reload. "Rescan last root" restores permissions
3. **Thumbnails**: Generated on demand, never persisted to localStorage (quota management). Uses OffscreenCanvas with canvas fallback, cached in memory only
4. **Category normalization**: All values normalized to lowercase, case-insensitive dedup, applied on save
5. **Virtualization**: Automatic for 100+ videos via `react-window`
6. **State management**: Use `useVideoManager` hook, not direct service calls from components
7. **Error handling**: Import from `@shared/errors` for consistent error codes and Zod schemas
8. **DB passwords**: Alphanumeric only (no special chars) to avoid Docker/Postgres escaping issues
9. **Path aliases**: Always use `@/` and `@shared/` imports; add stubs in `vitest.config.ts` for new enhanced services

## API Routes

### Videos
- `GET /api/videos` -- List all
- `POST /api/videos/bulk_upsert` -- Upsert array
- `PATCH /api/videos/:id` -- Update one
- `DELETE /api/videos/:id` -- Delete one
- `POST /api/videos/batch_delete` -- Batch delete by IDs

### Roots
- `GET /api/roots` -- List directory roots
- `POST /api/roots` -- Set root directories
- `POST /api/roots/add` -- Add directory to root
- `POST /api/roots/remove` -- Remove directory from root
- `DELETE /api/roots/:rootKey` -- Delete root
- `GET /api/roots/last` -- Get last active root
- `POST /api/roots/last` -- Set last active root

### Presets
- `GET /api/presets` -- List filter presets
- `POST /api/presets` -- Create/upsert preset
- `PATCH /api/presets/:id` -- Update preset
- `DELETE /api/presets/:id` -- Delete preset

### Tags
- `GET /api/tags` -- List all tags
- `PATCH /api/tags/:id` -- Update tag
- `POST /api/tags/rename` -- Rename tag
- `POST /api/tags/merge` -- Merge tags
- `POST /api/tags/synonyms` -- Add synonym
- `GET /api/tags/synonyms` -- List synonyms
- `DELETE /api/tags/synonyms/:id` -- Delete synonym

### System
- `GET /api/health` -- Server health
- `GET /api/db/health` -- Database health
- `POST /api/errors` -- Report client error
- `GET /api/thumbnails/:id` -- Generate thumbnail
- `POST /api/duplicates/compute` -- Compute duplicates
- `GET /api/duplicates` -- List duplicates

## Environment

```
.env.example              # Template
.env-dev                  # Development (gitignored)
.env-prod                 # Production (gitignored)
env/.env-postgres         # Postgres credentials
env/.env-app.local        # Local dev overrides
env/.env-playwright       # E2E test configuration
```

Required: `DATABASE_URL` (optional, enables Postgres), `SESSION_SECRET` (32-char hex), `ADMIN_USER`, `ADMIN_PASS`, `MEDIA_ROOT`, `PORT` (5100 local, 5000 Docker), `CORS_ORIGINS`.

## Common Pitfalls

1. **Test stubs**: Enhanced services are stubbed; add aliases in `vitest.config.ts` for new ones
2. **File handles**: Session-based; implement rescan for any new file-dependent feature
3. **Thumbnails**: Never persist to localStorage
4. **Postgres passwords**: Alphanumeric only
5. **Coverage thresholds**: Check `vitest.config.ts` before adding code to covered files
6. **Centralized state**: Route through `useVideoManager`, not direct service imports in components
7. **Shared modules**: Located in `shared/videovault/`; aliases configured in `tsconfig.json`, `vite.config.ts`, and `vitest.config.ts`
