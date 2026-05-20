---
ticket_id: T000055
title: Central Asset Management System Implementation Plan
domains: [website, db, infra]
status: active
pr_number: null
---

# Central Asset Management System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a unified root `/assets` directory, PostgreSQL registry, and Astro Admin Gallery.

**Architecture:** A root storage layer synced to service `public/` folders at build time, with metadata stored in the `shared-db` for discovery and management.

**Tech Stack:** Bash, PostgreSQL, Taskfile, Astro, Svelte, Drizzle ORM.

---

### Task 1: Database Schema & Migration

**Files:**
- Create: `website/src/db/migrations/20260520_create_assets_schema.sql`

- [ ] **Step 1: Write the migration SQL**
```sql
CREATE SCHEMA IF NOT EXISTS assets;

DO $$ BEGIN
    CREATE TYPE assets.asset_type AS ENUM ('image', 'audio', 'video', 'document');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS assets.registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type assets.asset_type NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Grant permissions to the website role
GRANT USAGE ON SCHEMA assets TO website;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA assets TO website;
```

- [ ] **Step 2: Apply migration to dev cluster**
Run: `task workspace:psql -- website < website/src/db/migrations/20260520_create_assets_schema.sql`

- [ ] **Step 3: Commit migration**
```bash
git add website/src/db/migrations/20260520_create_assets_schema.sql
git commit -m "feat(assets): add assets schema and registry table"
```

---

### Task 2: Root Asset Consolidation

**Files:**
- Create: `/assets/` (and subdirectories)
- Modify: `brett/public/assets/`, `website/public/brand/`

- [ ] **Step 1: Create the new directory structure**
```bash
mkdir -p assets/{branding,game,characters,audio,UI}
```

- [ ] **Step 2: Move existing assets**
```bash
mv brett/public/assets/sfx/* assets/audio/
mv website/public/brand/* assets/branding/
# (Continue for other discovered assets)
```

- [ ] **Step 3: Commit the move**
```bash
git add assets/
git commit -m "chore(assets): consolidate assets to root /assets directory"
```

---

### Task 3: Synchronization Automation

**Files:**
- Create: `Taskfile.assets.yml`
- Create: `scripts/assets-sync.sh`
- Modify: `Taskfile.yml`

- [ ] **Step 1: Create the sync script**
```bash
#!/usr/bin/env bash
# scripts/assets-sync.sh
set -euo pipefail
SOURCE="assets/"
TARGETS=("website/public/shared-assets/" "brett/public/shared-assets/")

for TARGET in "${TARGETS[@]}"; do
  mkdir -p "$TARGET"
  rsync -av --delete "$SOURCE" "$TARGET"
done
```

- [ ] **Step 2: Define tasks in Taskfile.assets.yml**
```yaml
version: '3'
tasks:
  sync:
    desc: Sync root assets to service public folders
    cmds:
      - bash scripts/assets-sync.sh
  index:
    desc: Index root assets into the database
    cmds:
      - bash scripts/assets-index.sh
```

- [ ] **Step 3: Include in main Taskfile.yml**
```yaml
includes:
  assets: ./Taskfile.assets.yml
```

- [ ] **Step 4: Commit automation**
```bash
git add scripts/assets-sync.sh Taskfile.assets.yml Taskfile.yml
git commit -m "feat(assets): add sync automation"
```

---

### Task 4: Admin Gallery UI

**Files:**
- Create: `website/src/pages/admin/assets.astro`
- Create: `website/src/components/admin/AssetGallery.svelte`

- [ ] **Step 1: Implement the Asset Gallery Page**
Create the Astro page that fetches assets from the DB and renders the Svelte component.

- [ ] **Step 2: Build the Svelte Gallery Component**
Implement the grid view, audio preview, and snippet copy functionality.

- [ ] **Step 3: Commit UI changes**
```bash
git add website/src/pages/admin/assets.astro website/src/components/admin/AssetGallery.svelte
git commit -m "feat(assets): add admin asset gallery UI"
```

---

### Task 5: Verification & Cleanup

- [ ] **Step 1: Run full sync**
Run: `task assets:sync`

- [ ] **Step 2: Verify paths in Website and Brett**
Ensure that the assets are correctly served at `/shared-assets/...`

- [ ] **Step 3: Final Commit & Push**
```bash
git push origin feature/central-asset-management
```
