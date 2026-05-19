# Central Asset Management System

A unified system for managing, previewing, and reusing art and audio assets across the Bachelorprojekt monorepo.

## 1. Goal
Consolidate ~200+ scattered assets into a single source of truth at the repository root, managed via a PostgreSQL registry and accessible through a visual Admin Gallery.

## 2. Architecture

### 2.1 Storage Strategy
- **Central Storage**: `/assets` (monorepo root).
- **Structure**:
  - `/assets/branding/`: Identity assets (Logos, SVGs).
  - `/assets/game/`: Game-specific graphics (Sprites, HUD).
  - `/assets/characters/`: Character SVGs.
  - `/assets/audio/`: SFX and Music.
  - `/assets/UI/`: Shared UI icons and patterns.

### 2.2 Synchronization
- **Build-time Sync**: Assets are mirrored to service-specific `public/` directories during the build process using a new `Taskfile.assets.yml`.
- **Target Directories**:
  - `website/public/shared-assets/`
  - `brett/public/shared-assets/`

### 2.3 Database Registry
A new schema `assets` in `shared-db` will track metadata:
- **Table**: `assets.registry`
- **Columns**: `id`, `name`, `type`, `file_path` (unique), `tags`, `metadata` (JSONB), `created_at`, `updated_at`.

## 3. Features

### 3.1 Admin Gallery (`/admin/assets`)
- **Visual Browser**: Filterable grid of images and audio.
- **Audio Previews**: Inline playback for SFX discovery.
- **Developer Snippets**: One-click "Copy Code" for Astro, CSS, and JS import paths.
- **Indexing Tool**: An automated scanner to sync the filesystem with the database.

### 3.2 Automation
- `task assets:index`: Scan `/assets` and reconcile with the DB.
- `task assets:sync`: Mirror `/assets` to all services.
- Integrated into `task feature:website` and `task feature:deploy`.

## 4. Verification Plan
- **Unit Tests**: Verify the sync script handles nested directories and over-writes correctly.
- **Database Tests**: Verify the indexing script handles additions, deletions, and name changes.
- **UI Tests**: Smoke test the Gallery page for asset loading and snippet generation.
