# VideoCard component

Rich interactive card component displaying video metadata with thumbnail, duration, categories, and action buttons for quick operations.

## Purpose

- Display comprehensive video information in compact grid layout  
- Support hover states for preview playback
- Quick actions: play, favorite, delete, rename
- Thumbnail lazy-loading with blurhash placeholders

## Architecture

```typescript
// Core modules:
video-card.tsx      → 838 lines (component tree, state hooks)
  ├─ ThumbnailViewer    → Progressive image loading
  ├─ CategoryTags       → Dynamic tag rendering  
  ├─ ActionMenu         → Context-sensitive actions dropdown
  └─ MetadataPreview    → Hover state details

// Related:
VideoList           → Container for VideoCard grid
VideoPlayerModal    → Full-screen playback overlay
```

## Usage

```typescript
const card = <VideoCard video={videoData} onAction={handleAction} />;
```

---

**File:** `VideoVault/client/src/components/video/video-card.tsx` (838 LOC) → SKILL documentation  
**Related:** [thumbnail-generator](file:///home/patrick/Bachelorprojekt/VideoVault/client/src/services/thumbnail-generator.SKILL.md), [enhanced-filter-engine](file:///home/patrick/Bachelorprojekt/VideoVault/client/src/services/enhanced-filter-engine.SKILL.md)
