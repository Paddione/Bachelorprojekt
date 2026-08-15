# VideoVault Toolkit Rework Design

**Date:** 2026-03-01
**Status:** Approved

## Goals

1. **Decoupled editing** — Edit tags on one video while freely browsing others via split-pane layout
2. **Universal sidecars** — `metadata.json` for ALL videos via a roots registry, not just hdd-ext
3. **Apply to visible** — Bulk-apply a category to all currently filtered/visible videos
4. **Richer filter choices** — Smart category suggestions from filename, directory, and ffprobe metadata

## Non-Goals

- Replacing FocusMode (coexists with split pane)
- Changing the core filter engine logic (AND semantics stay)
- Multi-user support or real-time sync

---

## 1. Split-Pane Editor

### Architecture

New component `SplitPaneEditor` renders as a persistent right panel on the home page when a video is "pinned."

**State model:**
- `pinnedVideoId: string | null` added to `VideoManagerState`
- `actions.pinVideo(id)` / `actions.unpinVideo()` in `useVideoManager`
- Reuses `useFocusMode`-style pending-edit pattern: local copy of categories/displayName, dirty flag, save/discard

**Layout:**
- `home.tsx`: When `pinnedVideoId` is set, `MainContent` shrinks and `SplitPaneEditor` renders beside it
- Panel width ~350px, resizable via drag handle
- Panel shows: thumbnail, display name, all 8 standard category types with tag inputs, custom categories, save/discard buttons

**Interaction model:**
- Grid clicks continue to play/preview (open `VideoPlayerModal`) — they do NOT change the pinned video
- Explicit pin action: "Pin" button on VideoCard, or keyboard `P` on focused card
- `Escape` closes the panel, `Ctrl+S` saves
- `VideoPlayerModal`, bulk operations, and filtering all work independently of the pinned panel

**Files touched:**
- `client/src/types/video.ts` — add `pinnedVideoId` to state
- `client/src/hooks/use-video-manager.ts` — add pin/unpin actions
- `client/src/components/video/split-pane-editor.tsx` — **new** component
- `client/src/pages/home.tsx` — integrate split pane into layout
- `client/src/components/video/video-card.tsx` — add pin button

---

## 2. Universal Sidecars via Roots Registry

### Architecture

A server-side roots registry maps `rootKey → absolutePath`, enabling sidecar writes for any video with a resolvable root.

**Roots resolution (priority order):**
1. `MEDIA_ROOTS` env var: `movies:/mnt/media/movies,hdd-ext:/mnt/hdd-ext`
2. `HDD_EXT_DIR` env var (backwards compat, maps to rootKey `hdd-ext`)
3. `MEDIA_ROOT` env var (backwards compat, fallback base path)
4. DB `roots` table entries (rootKey → first directory in the root's directories array)

**Core function:**
```typescript
// server/lib/roots-registry.ts
function resolveVideoDir(video: { rootKey?: string; path: string }): string | null
```

**Sidecar write triggers (all existing + new):**
1. `POST /api/videos/bulk_upsert` — for ALL videos with resolvable roots
2. `PATCH /api/videos/:id` — single update
3. `POST /api/processing/hdd-ext/index` — during indexing (existing)
4. `POST /api/processing/hdd-ext/process` — during processing (existing)
5. Bulk "apply to visible" operation (new)
6. Rename operations (new)

**Sidecar reads:**
- On indexing new roots, read existing sidecars to preserve categories
- On `GET /api/videos`, no extra reads (DB is source of truth at runtime)

**Graceful degradation:** `syncVideoSidecar` silently skips videos whose root is unresolvable (logs a debug message, never throws).

**Files touched:**
- `server/lib/roots-registry.ts` — **new** module
- `server/lib/sidecar.ts` — refactor `syncVideoSidecar` to use roots registry
- `server/routes/persistence.ts` — extend sidecar writes to all roots
- `server/routes/processing.ts` — use registry instead of hardcoded `HDD_EXT_DIR` for sidecar calls

---

## 3. "Apply to Visible" Bulk Action

### Architecture

A toolbar button that applies (or removes) a category to/from all videos currently matching active filters.

**UI:**
- New "Apply to Visible" button in header toolbar
- Opens a popover with:
  - Mode toggle: Add / Remove
  - Category type selector (dropdown)
  - Value input (combobox with autocomplete from existing values)
  - Count badge: "Will apply to **N videos**"
  - Confirm button
- If count > 50, secondary confirmation dialog

**Data flow:**
1. Read `state.filteredVideos` for the target set
2. For each video: add/remove category (dedup + normalize)
3. Batch `VideoDatabase.updateVideoCategories()` → `syncBulkUpsert()`
4. Server: DB upsert + sidecar write for all resolvable roots
5. Filter counts refresh automatically

**Files touched:**
- `client/src/components/bulk/apply-to-visible.tsx` — **new** component (popover)
- `client/src/hooks/use-video-manager.ts` — add `actions.applyToVisible(type, value, mode)`
- `client/src/pages/home.tsx` — integrate button into header
- `server/routes/persistence.ts` — bulk_upsert already handles the server side

---

## 4. Smart Category Suggestions & Enriched Filters

### Architecture

Three extraction sources feed into a unified suggestion pipeline.

### A. Enriched CategoryExtractor patterns

Expand `CATEGORY_PATTERNS` in `client/src/services/category-extractor.ts`:

| Type | Additions |
|------|-----------|
| `age` | granny, college, barely legal, middle-aged |
| `physical` | natural, fake, pierced, tattooed, hairy, shaved, bald, muscular, fit, big ass, small ass, long hair, short hair |
| `ethnicity` | thai, vietnamese, filipina, brazilian, colombian, mexican, german, french, spanish, czech, hungarian, african, middle eastern, mixed |
| `relationship` | stranger, neighbor, boss, teacher, student, babysitter, roommate, ex, friend, coworker, landlord |
| `acts` | blowjob, handjob, footjob, deepthroat, rimming, bdsm, bondage, roleplay, pov, missionary, doggy, cowgirl, reverse cowgirl, rough, gentle, romantic, massage, casting, interview |
| `setting` | studio, gym, garden, balcony, sauna, jacuzzi, classroom, hospital, dungeon, yacht, camping, van, dressing room |
| `quality` | 8k, 2k, 60fps, vr, hdr |

### B. Directory-name extraction (new)

Parse video's directory path for category matches using the same pattern set. E.g., `/Performers/Jane Doe/scene.mp4` → performer: "jane doe".

Added to `CategoryExtractor.extractFromPath(path: string)`.

### C. ffprobe → quality auto-detection (server-side)

During indexing/processing, map ffprobe data to quality categories:
- Resolution: >=7680→"8k", >=3840→"4k", >=2560→"2k", >=1920→"1080p", >=1280→"720p", else "480p"
- FPS: >=50→"60fps"
- Write to categories in DB + sidecar

Added to `server/handlers/movie-handler.ts` after ffprobe extraction.

### UI: Auto-suggestions in tag editor

Both `SplitPaneEditor` and `EditTagsModal` show suggested categories based on filename + directory + metadata. Suggestions render as ghost chips labeled "Suggested" — click to accept, ignore to dismiss.

**Files touched:**
- `client/src/services/category-extractor.ts` — enrich patterns, add `extractFromPath()`
- `server/handlers/movie-handler.ts` — add quality auto-detection from ffprobe
- `client/src/components/video/split-pane-editor.tsx` — show suggestions
- `client/src/components/video/edit-tags-modal.tsx` — show suggestions

---

## Testing Strategy

- Unit tests for `roots-registry.ts` (path resolution, graceful degradation)
- Unit tests for enriched `CategoryExtractor` patterns
- Unit tests for `FilterEngine` with the "apply to visible" operation
- Integration test for sidecar writes on bulk_upsert with roots registry
- E2E: split pane open/close, pin/unpin, save/discard
- E2E: "apply to visible" with filter + confirm + verify

## Migration

- Fully backwards compatible — `MEDIA_ROOTS` env var is optional
- Existing `HDD_EXT_DIR` and `MEDIA_ROOT` continue to work
- No DB migrations needed (using existing columns)
- Sidecars for non-hdd-ext videos only written when roots are configured
