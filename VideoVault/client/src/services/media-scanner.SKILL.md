# Media scanner service

Background scanning service that monitors directory changes and updates video library with new uploads. Handles incremental scans, conflict resolution, and metadata extraction for newly discovered files.

## Purpose

- Monitor directories for new/modified/deleted videos  
- Incremental scanning to avoid full re-scan on every change  
- Extract basic metadata (duration, codec) without playing entire file
- Update search index in real-time

## Architecture

```typescript
// Core modules:
media-scanner.ts      → 727 lines (file watcher, incremental scan)
  ├─ DirectoryWatcher → FileSystem API polling/matching  
  ├─ MetadataExtractor → Basic info extraction (duration/codec)  
  └─ ConflictResolver → Duplicate detection & merge logic

// Dependencies:
EnhancedFilterEngine → Search index updates post-scan
VideoDatabase        → Persistence layer
```

## Usage

```typescript
const scanner = new MediaScanner({ path: '/mnt/videos' });
await scanner.start(); // Background monitoring begins immediately
```

---

**File:** `VideoVault/client/src/services/media-scanner.ts` (727 LOC) → SKILL documentation  
**Related:** [file-scanner](file:///home/patrick/Bachelorprojekt/VideoVault/client/src/services/file-scanner.SKILL.md), [metadata-extractor](file:///home/patrick/Bachelorprojekt/VideoVault/client/src/services/metadata-extractor.SKILL.md)
