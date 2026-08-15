# Enhanced thumbnail service

Advanced thumbnail generation with progressive loading, multi-resolution support, and auto-quality scaling based on video properties and network conditions. Supports multiple codecs, frame selection heuristics, and adaptive compression.

## Purpose

- Generate thumbnails from optimal frames (scene change detection)  
- Multi-resolution variants for performance optimization
- Progressive loading with blurhash placeholders
- Auto-quality selection to balance size vs. fidelity

## Architecture

```typescript
// Core modules:
enhanced-thumbnail-service.ts  → 617 lines (generation pipeline, cache)
  ├─ FrameSelector    → Best scene detection algorithm  
  ├─ Encoder          → Worker-based encoding (H.264/H.265)  
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

**File:** `VideoVault/client/src/services/enhanced-thumbnail-service.ts` (617 LOC) → SKILL documentation  
**Related:** [thumbnail-generator](file:///home/patrick/Bachelorprojekt/VideoVault/client/src/services/thumbnail-generator.SKILL.md), [filter-engine](file:///home/patrick/Bachelorprojekt/VideoVault/client/src/services/filter-engine.SKILL.md)
