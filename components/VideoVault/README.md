# VideoVault

A client-first video management application with advanced filtering, bulk operations, and professional-grade organization features. Built with privacy-first local storage and modern web APIs.

> **See also:** [Deep dive](../docs/services/videovault.md) | [Architecture](../docs/architecture/overview.md) | [Deployment](../docs/guides/deployment.md) | [Testing](../docs/guides/testing.md) | [Environment Variables](../docs/guides/environment-variables.md) | [Root README](../README.md)

## Features

- **Directory Scanning** with progress tracking, cancellation, and drag-and-drop import
- **Advanced Filtering** by category, search text, date range, file size, duration, with saveable presets
- **Bulk Operations** for batch category assignment, rename, move, and delete with undo support
- **Video Player** with buffered progress, scrubbing, thumbnail preview, PiP, and media session integration
- **Category Management** with standard and custom types, lowercase normalization, and quick-assign UI
- **Thumbnail Generation** off-main-thread via worker/OffscreenCanvas with fallback
- **Virtualized Rendering** for libraries with 1000+ videos using react-window
- **File Operations** including create/delete folders, move/delete files with conflict handling
- **Keyboard Accessibility** with full navigation and WCAG 2.1 AA compliance
- **Optional PostgreSQL Persistence** via Drizzle ORM for shared libraries

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Radix UI / shadcn |
| Backend | Node.js, Express, Vite middleware (dev) / static serving (prod) |
| Data | localStorage (primary), optional Drizzle ORM + PostgreSQL |
| Testing | Vitest (jsdom), Playwright |
| Infrastructure | k3s (production), Docker Compose (local dev), Traefik ingress |

## Quick Start

### Prerequisites

- Node.js 20+ and npm
- Chromium-based browser (Chrome, Edge, Opera) for File System Access API
- Docker (optional, for containerized development)

### Installation

```bash
npm ci
```

### Local Development

```bash
npm run dev
# Open http://localhost:5100
```

### Docker Development (recommended)

```bash
npm run docker:dev           # Start with hot reload (port 5000)
npm run docker:dev:detached  # Start in background
npm run docker:logs          # View logs
npm run docker:shell         # Shell into container
npm run docker:down          # Stop environment
npm run docker:clean         # Remove containers and volumes
```

## Postgres Setup (Optional)

VideoVault works without Postgres (in-memory fallback). To enable persistent shared storage:

1. Create env files with alphanumeric-only passwords (no special characters):
   - `env/.env-postgres` with `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
   - `env/.env-app` with `DATABASE_URL` and `SESSION_SECRET`
   - See `env/.env.example` for guidance

2. Start the stack:
   ```bash
   npm run docker:dev
   ```

3. Apply schema:
   ```bash
   docker exec videovault-dev npm run db:push
   ```

When `DATABASE_URL` is set, the server uses Postgres. Otherwise it falls back to in-memory storage.

**Password requirement**: Use alphanumeric-only passwords to avoid Docker/Postgres escaping issues.
```bash
openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 32
```

## Environment Configuration

### File Structure

```
.env.example              # Template
.env-dev                  # Development (gitignored)
.env-prod                 # Production (gitignored)
env/.env-postgres         # Postgres credentials
env/.env-app.local        # Local development overrides
env/.env-playwright       # E2E test configuration
```

### Required Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `development` |
| `PORT` | Server port | `5100` (local), `5000` (Docker) |
| `SESSION_SECRET` | 32-char hex session secret | -- |
| `ADMIN_USER` | Admin username | `admin` |
| `ADMIN_PASS` | Admin password | -- |
| `MEDIA_ROOT` | Path to media library | -- |
| `DATABASE_URL` | Postgres connection (optional) | -- |
| `CORS_ORIGINS` | Allowed origins | `http://localhost:5100,http://localhost:5000` |
| `TRUST_PROXY` | Set `true` behind Nginx/Traefik | `false` |
| `PROCESSED_MEDIA_PATH` | Processed media path (optional) | -- |
| `THUMBNAILS_DIR` | Thumbnail storage path (optional) | -- |
| `MOVIES_DIR` | Movies directory for server-side processing (optional) | -- |
| `ENABLE_MOVIE_WATCHER` | Enable automatic movie processing | `1` |
| `MOVIE_WATCHER_INTERVAL_MS` | Polling interval for new movies | `15000` |
| `MOVIE_WATCHER_STABILITY_MS` | File stability window before processing | `30000` |
| `MOVIE_WATCHER_AUTO_ORGANIZE` | Auto-organize movies into folders | `1` |
| `MOVIE_WATCHER_BACKFILL` | Backfill missing thumbnails on startup | `0` |

Generate secrets:
```bash
openssl rand -hex 32
```

## Development Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local dev server (port 5100) |
| `npm run docker:dev` | Docker dev with hot reload (port 5000) |
| `npm run check` | TypeScript type checking |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run verify` | Typecheck + unit + server e2e + build |
| `npm run db:push` | Apply Drizzle schema to Postgres |
| `npm test` | Run unit tests |
| `npm run test:watch` | Watch mode |
| `npm run test:all` | Full 6-stage test pipeline |
| `npm run test:quick` | Types + unit tests only |

## Testing

### 6-Stage Test Pipeline

Run before every deployment:

```bash
npm run test:all
```

| Stage | Command | What It Tests | Time |
|-------|---------|---------------|------|
| 1 | `npm run test:1:types` | TypeScript compilation | ~5-10s |
| 2 | `npm run test:2:unit` | Client + server unit tests (FAST_TESTS=1) | ~30-60s |
| 3 | `npm run test:3:integration` | Server API + DB integration | ~10-20s |
| 4 | `npm run test:4:e2e` | Playwright E2E in Docker | ~2-5m |
| 5 | `npm run test:5:build` | Production build verification | ~30-60s |
| 6 | `npm run test:6:health` | Final health check | instant |

Total pipeline time: ~4-8 minutes.

### Additional Test Commands

```bash
npm run test:quick           # Types + unit only (~40-70s)
npm run test:pre-deploy      # Alias for test:all
npm run test:client          # Client tests only
npm run test:server          # Server tests only
npm run test:e2e             # Server integration tests (Vitest)
npm run test:coverage:full   # Full coverage report with thresholds

# Run a single test file
npx vitest run client/src/services/filter-engine.test.ts
FAST_TESTS=1 npx vitest run client/src/services/filter-engine.test.ts
```

### Playwright E2E

Docker-based (recommended):
```bash
npm run docker:pw:all        # Full suite
npm run docker:pw:up         # Start environment only
npm run docker:pw:run        # Run against running environment
npm run docker:pw:ui         # Interactive UI (http://localhost:9323)
```

Local:
```bash
npm run test:pw              # Run locally
npm run test:pw:ui           # Local interactive UI
npm run test:pw:report       # Open HTML report
npm run test:pw:install      # Install Playwright browsers
```

Notes:
- Playwright container connects to `videovault-dev:5000` on the Docker network
- Pinned to `v1.55.0-jammy` (must match `@playwright/test` version)
- Docker artifacts stay inside the container to avoid permission issues
- Optional MSW mocking via `VITE_E2E_MSW=true` in `env/.env-playwright`
- The Playwright services use the `playwright` Docker Compose profile

### Coverage Thresholds

Core services have per-file coverage requirements enforced in `vitest.config.ts`:

| Service | Branches | Functions | Lines | Statements |
|---------|----------|-----------|-------|------------|
| filter-engine.ts | 90% | 95% | 95% | 95% |
| rename-engine.ts | 85% | 95% | 95% | 95% |
| directory-database.ts | 90% | 95% | 95% | 95% |
| video-database.ts | 85% | 95% | 95% | 95% |

Excluded from coverage: `components/ui/**` (shadcn), `components/admin/**`, `components/layout/**`, `pages/**`, enhanced services, web workers.

### Recommended Workflows

| Situation | Command |
|-----------|---------|
| During development | `npm run test:watch` |
| Before every commit | `npm run test:quick` |
| Before PR or deploy | `npm run test:all` |
| Debug failing tests | Run the individual stage that failed |
| Debug E2E | `npm run docker:pw:ui` |
| Check coverage | `npm run test:coverage:full` |

### Troubleshooting Tests

**Stage 1 (Types)**: Run `npm run check` for detailed type errors. Check for missing type definitions or tsconfig issues.

**Stage 2 (Unit)**: Run `npm run test:client` or `npm run test:server` separately. Run a single file with `npx vitest run path/to/test.ts`. Check test setup in `client/src/test/setup.ts`.

**Stage 3 (Integration)**: Verify `DATABASE_URL` in `.env-dev`. Run with verbose output: `npm run test:e2e -- --reporter=verbose`.

**Stage 4 (E2E)**: Ensure Docker is running. Check logs with `npm run docker:logs`. Use `npm run docker:pw:ui` for interactive debugging. Verify Playwright version match with `npm run predocker:pw:all`.

**Stage 5 (Build)**: Run `npm run build` directly for detailed error output.

**All tests failing**: Try `rm -rf node_modules package-lock.json && npm install`.

**E2E tests hanging**: Reset Docker with `npm run docker:down && npm run docker:clean && npm run docker:pw:all`.

## Keyboard Shortcuts

### Universal

| Shortcut | Action |
|----------|--------|
| `Tab` / `Shift+Tab` | Navigate forward / backward between elements |
| `Enter` | Activate button, open video, submit form |
| `Escape` | Close modal, cancel action, exit fullscreen |

### Video Grid

| Shortcut | Action |
|----------|--------|
| `Tab` | Navigate video cards in reading order |
| `Enter` | Open video player modal |
| `Home` / `End` | Jump to first / last video |
| `Ctrl+A` | Select all visible videos |
| `Ctrl+Space` | Toggle selection mode |
| `Escape` | Clear focus or selection |

### Video Player

| Shortcut | Action |
|----------|--------|
| `Space` | Play / pause |
| `Left` / `Right` arrow | Skip -5s / +5s |
| `Shift+Left` / `Shift+Right` | Skip -30s / +30s |
| `+10m` button | Jump forward 600s |
| `Up` / `Down` arrow | Volume +10% / -10% |
| `F` | Toggle fullscreen |
| `M` | Mute / unmute |
| `P` | Toggle Picture-in-Picture |
| Click progress bar | Seek to position |

### Bulk Operations

| Shortcut | Action |
|----------|--------|
| Click checkbox on video | Toggle selection |
| `Ctrl+A` | Select all |
| `Ctrl+Shift+A` | Deselect all |
| `Shift+Click` | Select range |
| `Escape` | Cancel selection, close bulk toolbar |

### Search and Filters

| Shortcut | Action |
|----------|--------|
| `Tab` to search field | Focus search input |
| Type in search | Real-time filtering |
| `Up` / `Down` in dropdown | Navigate options |
| `Enter` in dropdown | Select option |

### Accessibility

- Focus indicator: cyan 2px border on all interactive elements
- Reduced motion: respects system `prefers-reduced-motion` setting
- High contrast: enhanced borders and text contrast when system high contrast is enabled
- Screen reader: ARIA labels on all controls

## Architecture

### Client-First Design

The browser is the primary data store:
- **localStorage**: Video metadata persistence
- **File System Access API**: Direct file access (Chromium only)
- **Session-based handles**: File handles lost on reload, rescan required
- **Optional Postgres**: Server-side persistence for shared libraries via Drizzle ORM

### Key Components

| Component | Responsibility |
|-----------|---------------|
| `useVideoManager` | Central state hook; all components use this instead of services directly |
| `VideoDatabase` | localStorage CRUD for video metadata |
| `FileScanner` | Directory scanning with concurrency control |
| `FilterEngine` | Standard filtering (category, search, date, size, duration) |
| `EnhancedFilterEngine` | FlexSearch-based instant search |
| `BulkOperationsService` | Multi-select batch operations with undo |
| `ThumbnailGenerator` | Worker-based encoding, OffscreenCanvas with fallback |
| `FilesystemOps` | File/folder CRUD via File System Access API |
| `RenameEngine` | Batch rename with patterns |
| `DirectoryDatabase` | Directory metadata and scanned root tracking |

### Shared Types and Errors

Error codes and payload types use `@shared/errors` imports. Shared modules live in `shared/videovault/`.

### Tailwind CSS

Uses a single root config `tailwind.config.cjs` with PostCSS configured in `postcss.config.js`. `@tailwindcss/vite` is not used (Tailwind v3).

### Settings Service

`AppSettingsService` provides typed `get<T>(key, parser?)` and `set<T>(key, value, serializer?)` helpers. Legacy migrations normalize old values automatically.

## API Reference

### Videos
- `GET /api/videos` -- List all videos
- `POST /api/videos/bulk_upsert` -- Upsert array of videos
- `PATCH /api/videos/:id` -- Update single video
- `DELETE /api/videos/:id` -- Delete single video
- `POST /api/videos/batch_delete` -- Batch delete by IDs

### Roots
- `GET /api/roots` -- List directory roots
- `POST /api/roots` -- Set root directories (rootKey, directories, name?)
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

## Deployment

### Local Development (Docker Compose)

Docker Compose is used **only for local development**, not production.

```bash
npm run docker:dev
# Access at http://localhost:5000
```

Features: hot reload via bind mounts, preserved node_modules in container, Vite file watching, connection to centralized `shared-postgres`.

### Production (k3s)

Production runs on **k3s** (lightweight Kubernetes). Do not use Docker Compose or `docker build/run` for production.

```bash
# Deploy VideoVault to the k3s cluster
../../k8s/scripts/deploy/deploy-videovault.sh

# Or deploy the full stack
../../k8s/scripts/deploy/deploy-all.sh

# Verify
kubectl get pods -l app=videovault -n korczewski-services
```

K8s manifests: `k8s/services/videovault/` (deployment, service, PVCs, PVs, IngressRoute).
Full deployment guide: `k8s/README.md`.

Production URL: https://videovault.korczewski.de

### Docker Image (used by k3s)

The production Docker image is built via `Dockerfile.prod`. It connects to `shared-postgres:5432`, integrates with Traefik ingress, and exposes a health check at `/api/health`. The image is referenced in the k8s deployment manifest, not run directly via `docker run`.

### Networks

- `l2p-network` (external): Shared service network (local dev only)
- `traefik-public` (external): Production ingress (local dev only)
- In k3s, networking is handled by the cluster's CNI

### Important Files

- `docker-compose.yml` -- Local dev + E2E environment definitions
- `Dockerfile.prod` -- Production image (used by k3s deployment)
- `scripts/ensure-playwright-match.mjs` -- Playwright version validation

## Troubleshooting

| Problem | Solution |
|---------|----------|
| No videos after reload | Use "Rescan last root" to restore file access |
| Slow performance with large library | Enable filtering to reduce visible set; virtualization activates at 100+ videos |
| Missing thumbnails | Thumbnails regenerate automatically on demand |
| Playback issues | Verify file is accessible and in a supported format (MP4, AVI, MKV, MOV, WMV) |
| File System Access API not available | Use a Chromium-based browser (Chrome, Edge, Opera) |
| Docker E2E permission errors | Artifacts stay in container by design; use `npm run test:pw:report` to view |
| Database connection failures | Verify `DATABASE_URL` in env files; ensure `shared-postgres` is running |

## License

MIT License - see LICENSE file for details.
