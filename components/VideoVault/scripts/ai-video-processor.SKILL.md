# AI video processor script

Local AI model inference engine for video transcription, scene detection, and metadata extraction. Manages model loading, inference workers, and result caching with fallback mechanisms.

## Purpose

- Load Whisper-large-v3 or custom models locally  
- Process videos in parallel using hardware concurrency  
- Cache results to avoid redundant processing
- Graceful degradation if external services unavailable

## Architecture

```typescript
// Core modules:
ai-video-processor.mjs  → 732 lines (model loader, inference worker)
  ├─ ModelManager      → Dynamic model loading/unloading  
  ├─ InferenceWorker   → Worker thread execution  
  └─ ResultCache        → LocalStorage-based caching

// Dependencies:
ffmpeg             → Frame extraction & encoding
whisper-python     → Transcription engine (fallback)
```

## Usage

```bash
# Process a single video
node scripts/ai-video-processor.mjs --input /path/to/video.mp4 \
  --output /output/path/ --model whisper-tiny
```

---

**File:** `VideoVault/scripts/ai-video-processor.mjs` (732 LOC) → SKILL documentation  
**Related:** [movie-handler](file:///home/patrick/Bachelorprojekt/VideoVault/server/handlers/movie-handler.SKILL.md), [scene-detection](file:///home/patrick/Bachelorprojekt/VideoVault/client/src/services/scene-detection.SKILL.md)
