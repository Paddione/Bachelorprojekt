# use-video-manager hook

Video state management for client-side video playback, caching, and storage operations. Handles video loading progress, thumbnail generation, and client-local state synchronization.

## Purpose

- Manage video state across components (player, library, settings)
- Cache video metadata (10-minute TTL)
- Sync with server via WebSocket events
- Persist client preferences to localStorage

## Architecture

```typescript
// Core modules:
use-video-manager.ts         → 1762 lines (manager, cache, storage, sync layers)
  ├─ manager.ts              → video state orchestration
  ├─ cache.ts                → LRU video metadata cache  
  ├─ storage.ts              → localStorage persistence
  └─ sync.ts                 → WebSocket event handling

// Extracted components:
use-video-cache.ts           → pure caching logic (no side effects)
use-video-storage.ts         → pure storage operations
```

## Usage

```typescript
const videoManager = useVideoManager({ brand: 'mentolder' });
const { play, pause, loadMetadata } = videoManager;
```

---

**File:** `VideoVault/client/src/hooks/use-video-manager.ts` (1762 LOC) → SKILL documentation + module splitting
