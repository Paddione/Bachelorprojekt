# processing route handler

AI-powered video transcription, analysis, and metadata extraction endpoint for server-side processing tasks.

## Purpose

- Handle AI transcription requests (Whisper, custom models)
- Process video frames for scene detection
- Generate metadata tags from content analysis
- Manage async job queue for long-running tasks

## Architecture

```typescript
// Core modules:
processing.ts        → 1273 lines (route handler, job queue, AI integration)
  ├─ transcription.ts     → Whisper/Azure transcription logic
  ├─ scene-detection.ts   → Frame sampling & ML inference  
  ├─ metadata-extractor.ts → NLP-based tag generation

// Dependencies:
@services/ai-processor.mjs    → Model orchestration layer
@services/job-queue           → Redis-backed async queue
```

## Usage

```typescript
const client = http.createClient({ url: 'https://processing.mentolder.de' });
await client.transcribeVideo(videoUrl, { language: 'de', autoCaption: true });
```

---

**File:** `VideoVault/server/routes/processing.ts` (1273 LOC) → SKILL documentation  
**Related:** [ai-video-processor](file:///home/patrick/Bachelorprojekt/VideoVault/scripts/ai-video-processor.mjs.SKILL.md)
