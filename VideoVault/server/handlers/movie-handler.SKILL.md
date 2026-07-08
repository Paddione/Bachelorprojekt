# Movie handler route

Server-side video processing endpoint handling upload, transcription, scene detection, and metadata extraction for uploaded movie/video files. Manages async job queues and model inference coordination.

## Purpose

- Handle video uploads with progress tracking  
- Trigger AI-powered processing pipeline (transcription, analysis)  
- Generate thumbnails automatically based on content
- Manage duplicate detection and deduplication jobs

## Architecture

```typescript
// Core modules:
movie-handler.ts    → 775 lines (route handler, job orchestration)
  ├─ UploadProcessor   → Chunked uploads with resumability  
  ├─ ProcessingQueue   → Redis-backed async job manager  
  └─ MetadataExtractor → NLP-based scene/tag generation

// Dependencies:
ai-video-processor.mjs    → Model inference layer
job-queue                  → Distributed task coordination
```

## Usage

```typescript
const client = http.createClient({ url: 'https://processing.mentolder.de' });
await client.uploadVideo(fileBuffer, { title: 'My Movie', language: 'de' });
```

---

**File:** `VideoVault/server/handlers/movie-handler.ts` (775 LOC) → SKILL documentation  
**Related:** [ai-video-processor](file:///home/patrick/Bachelorprojekt/VideoVault/scripts/ai-video-processor.mjs.SKILL.md), [job-queue](file:///home/patrick/Bachelorprojekt/VideoVault/server/lib/job-queue.SKILL.md)
