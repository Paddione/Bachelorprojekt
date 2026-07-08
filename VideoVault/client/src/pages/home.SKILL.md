# Home page

Main landing page for VideoVault with featured videos, quick actions, and dashboard overview. Displays recent uploads, trending content, and personalized recommendations based on user activity.

## Purpose

- Show latest uploaded videos as hero carousel  
- Quick access to core operations (scan, upload, search)
- Personalized video recommendations
- Statistics overview (total count, storage usage, etc.)

## Architecture

```typescript
// Core modules:
home.tsx            → 815 lines (page layout, data fetching)
  ├─ HeroCarousel    → Featured video showcase  
  ├─ QuickActions    → Primary action buttons grid
  └─ VideoGrid       → Recent uploads display

// Related components:
DashboardStatCard   → Usage metric cards
VideoThumbnail      → Lazy-loaded image component
```

## Usage

```typescript
const home = new Route('/');
await home.render({ userStats, recentVideos });
```

---

**File:** `VideoVault/client/src/pages/home.tsx` (815 LOC) → SKILL documentation  
**Related:** [thumbnail-generator](file:///home/patrick/Bachelorprojekt/VideoVault/client/src/services/thumbnail-generator.SKILL.md), [filter-engine](file:///home/patrick/Bachelorprojekt/VideoVault/client/src/services/filter-engine.SKILL.md)
