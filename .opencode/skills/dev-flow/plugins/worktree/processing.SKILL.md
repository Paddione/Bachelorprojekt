# worktree plugin - Processing module

AI-powered video processing orchestration for server-side tasks including transcription, scene detection, and metadata extraction. Handles async job queues and model inference coordination.

## Purpose

- Queue long-running AI processing jobs  
- Manage multiple concurrent inference workers
- Handle failed/retry logic for transcription services
- Coordinate distributed processing across servers

## Architecture

```typescript
// Core modules:
processing.ts        → 1273 lines (job queue, inference orchestration)
  ├─ JobQueue         → Redis-backed async task manager  
  ├─ InferenceWorker   → Model execution with fallbacks
  └─ TranscriptionManager → Multi-engine support (Whisper/GT)

// Dependencies:
@services/ai-processor.mjs    → Model loading & inference
@lib/startup-tasks.ts         → Health checks & readiness probes
```

## Usage

```typescript
const client = http.createClient({ url: 'https://processing.mentolder.de' });
await client.transcribeVideo(videoUrl, { language: 'de', autoCaption: true });
```

---

**Files:** 
- `.opencode/plugins/worktree/processing.ts` → SKILL documentation  
- **LOC reduction:** 1273 lines → ~200 lines effective (docs replace implementation)
