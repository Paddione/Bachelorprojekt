# Enhanced thumbnail service

Advanced thumbnail generation with progressive loading, multi-resolution support, and auto-quality scaling based on video properties and network conditions.

## Purpose

- Generate thumbnails from any frame (auto-select best scene)  
- Multiple resolution variants for performance optimization
- Progressive loading with blurhash placeholders
- Auto-quality selection to balance size vs. fidelity

## Architecture

```typescript
// Core modules:
video-thumbnail.ts  → 799 lines (generation pipeline, cache management)
  ├─ FrameSelector    → Best scene detection algorithm  
  ├─ Encoder          → Worker-based encoding (OffscreenCanvas)  
  └─ QualityScaler     → Adaptive compression based on video stats

// Dependencies:
ThumbnailGenerator   → Base generation implementation
EnhancedFilterEngine  → Search index updates post-generation
```

## Usage

```typescript
const thumbnail = await generateThumbnail(videoUrl, { quality: 'auto' });
```

---

**File:** `VideoVault/client/src/services/video-thumbnail.ts` (799 LOC) → SKILL documentation  
**Related:** [thumbnail-generator](file:///home/patrick/Bachelorprojekt/VideoVault/client/src/services/thumbnail-generator.SKILL.md), [filter-engine](file:///home/patrick/Bachelorprojekt/VideoVault/client/src/services/filter-engine.SKILL.md)
