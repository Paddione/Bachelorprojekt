#!/usr/bin/env node
/**
 * Inbox Video Processing Script
 *
 * Processes videos from Bibliothek/Inbox/ directory:
 * 1. Extracts 10 frames at 10%, 20%...100% of video duration
 * 2. Stitches frames into horizontal strip image (sprite)
 * 3. Creates a single thumbnail from the middle frame
 * 4. Analyzes with Ollama LLaVA for categorization and renaming
 * 5. Renames the video file based on AI suggestion
 * 6. Moves the renamed video to Processed/ and saves sprite + thumbnail to Thumbnails/
 *
 * Usage:
 *   npm run process-inbox
 *   MOCK_AI=true npm run process-inbox
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from 'canvas';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  OLLAMA_URL: process.env.OLLAMA_URL || 'http://localhost:11434',
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'llava',
  MOCK_AI: process.env.MOCK_AI === 'true',
  CONCURRENCY: parseInt(process.env.PROCESS_CONCURRENCY || '1', 10), // Default to 1 for safety
  FRAME_COUNT: 10,
  FRAME_WIDTH: 160,
  STRIP_QUALITY: 0.9,

  // Directories
  INBOX_DIR: process.env.INBOX_DIR || path.join(process.cwd(), 'Inbox'),
  PROCESSED_DIR:
    process.env.PROCESSED_DIR ||
    process.env.CATEGORIZED_DIR ||
    path.join(process.cwd(), 'Processed'),
  THUMBNAILS_DIR:
    process.env.THUMBNAILS_DIR ||
    process.env.CATEGORIZED_DIR ||
    path.join(process.cwd(), 'Processed', 'Thumbnails'),
};

// Category schema (reused from ai-video-processor.mjs)
const CATEGORY_PATTERNS = {
  age: ['teen', '18yo', '19yo', 'young', 'mature', 'milf', 'cougar', 'older'],
  physical: [
    'blonde',
    'brunette',
    'redhead',
    'petite',
    'busty',
    'big_tits',
    'small_tits',
    'skinny',
    'curvy',
    'thick',
    'slim',
    'tall',
    'short',
    'athletic',
    'chubby',
  ],
  ethnicity: [
    'asian',
    'russian',
    'italian',
    'british',
    'japanese',
    'chinese',
    'korean',
    'indian',
    'latina',
    'ebony',
    'white',
    'european',
    'american',
  ],
  relationship: [
    'step',
    'stepsis',
    'stepmom',
    'stepdad',
    'stepson',
    'stepdaughter',
    'mom',
    'dad',
    'sister',
    'brother',
    'gf',
    'girlfriend',
    'wife',
    'husband',
  ],
  acts: [
    'anal',
    'oral',
    'creampie',
    'facial',
    'dp',
    'gangbang',
    'threesome',
    'solo',
    'masturbation',
    'fingering',
    'squirting',
    'orgasm',
  ],
  setting: [
    'hotel',
    'bedroom',
    'bathroom',
    'kitchen',
    'office',
    'outdoor',
    'car',
    'public',
    'beach',
    'pool',
    'shower',
    'amateur',
    'homemade',
  ],
  quality: ['4k', 'hd', '1080p', '720p', '480p', 'uhd', 'fhd'],
  performer: [],
};

// ============================================================================
// Logging
// ============================================================================

const logger = {
  info: (msg, data = {}) => console.log(`[INFO] ${msg}`, JSON.stringify(data, null, 2)),
  warn: (msg, data = {}) => console.warn(`[WARN] ${msg}`, JSON.stringify(data, null, 2)),
  error: (msg, err) => console.error(`[ERROR] ${msg}`, err?.stack || err?.message || err),
};

// ============================================================================
// Utilities
// ============================================================================

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve({ code, stdout: out.trim(), stderr: err.trim() });
      else
        reject(
          Object.assign(new Error(`${cmd} exited with code ${code}: ${err || out}`), {
            code,
            stdout: out,
            stderr: err,
          }),
        );
    });
  });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function sanitizeFilename(name) {
  return name
    .replace(/[^a-z0-9_\-]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

function extractBaseFilename(filepath) {
  return path.basename(filepath, path.extname(filepath));
}

// ============================================================================
// FFmpeg Operations
// ============================================================================

async function getDurationSeconds(filePath) {
  const args = [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ];
  const { stdout } = await run('ffprobe', args);
  const sec = parseFloat(stdout);
  if (!Number.isFinite(sec) || sec <= 0) {
    throw new Error(`Invalid duration from ffprobe: ${stdout}`);
  }
  return sec;
}

async function extractFrames(videoPath, outputDir) {
  const duration = await getDurationSeconds(videoPath);
  const framePaths = [];

  logger.info('Extracting frames', { videoPath, duration, frameCount: CONFIG.FRAME_COUNT });

  for (let i = 1; i <= CONFIG.FRAME_COUNT; i++) {
    // Sample from the middle of each interval to avoid end-of-file issues
    const timestamp = (duration * (i - 0.5)) / CONFIG.FRAME_COUNT;
    const framePath = path.join(outputDir, `frame_${i}.jpg`);

    const args = [
      '-ss',
      timestamp.toFixed(2),
      '-i',
      videoPath,
      '-vframes',
      '1',
      '-vf',
      `scale=${CONFIG.FRAME_WIDTH}:-1`,
      '-q:v',
      '2',
      framePath,
    ];

    await run('ffmpeg', args);
    framePaths.push(framePath);
  }

  logger.info('Frames extracted successfully', { count: framePaths.length });
  return framePaths;
}

// ============================================================================
// Image Processing
// ============================================================================

async function stitchFrames(framePaths) {
  logger.info('Stitching frames into strip', { frameCount: framePaths.length });

  const images = await Promise.all(framePaths.map((p) => loadImage(p)));

  const frameHeight = images[0].height;
  const totalWidth = CONFIG.FRAME_WIDTH * images.length;

  const canvas = createCanvas(totalWidth, frameHeight);
  const ctx = canvas.getContext('2d');

  images.forEach((img, i) => {
    ctx.drawImage(img, i * CONFIG.FRAME_WIDTH, 0, CONFIG.FRAME_WIDTH, frameHeight);
  });

  const buffer = canvas.toBuffer('image/jpeg', { quality: CONFIG.STRIP_QUALITY });
  return buffer;
}

async function createSingleThumbnail(framePaths) {
  // Use the middle frame (approx index 5 for 10 frames)
  const middleIndex = Math.floor(framePaths.length / 2);
  const middleFramePath = framePaths[middleIndex];

  logger.info('Creating single thumbnail', { source: middleFramePath });

  const image = await loadImage(middleFramePath);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);

  return canvas.toBuffer('image/jpeg', { quality: CONFIG.STRIP_QUALITY });
}

// ============================================================================
// AI Analysis
// ============================================================================

function buildPrompt(originalFilename) {
  const categoryList = Object.entries(CATEGORY_PATTERNS)
    .map(([type, values]) => `- ${type}: ${values.join(', ')}`)
    .join('\n');

  return `Analyze these 10 video frames and suggest metadata.

CATEGORIES (select all that apply):
${categoryList}

RESPOND IN STRICT JSON FORMAT (no markdown, no explanation):
{
  "suggestedFilename": "descriptive_name_here",
  "categories": {
    "age": ["value1"],
    "physical": ["value1", "value2"],
    "ethnicity": [],
    "relationship": [],
    "acts": ["value1"],
    "setting": ["value1"],
    "quality": ["value1"],
    "performer": []
  }
}

Original filename for reference: ${originalFilename}`;
}

async function analyzeWithLLaVA(framePaths, originalFilename) {
  if (CONFIG.MOCK_AI) {
    logger.info('Using mock AI response');
    return {
      suggestedFilename: 'mock_test_video',
      categories: {
        age: ['young'],
        physical: ['blonde'],
        ethnicity: [],
        relationship: [],
        acts: ['solo'],
        setting: ['bedroom'],
        quality: ['hd'],
        performer: [],
      },
    };
  }

  logger.info('Analyzing with Ollama LLaVA', { frameCount: framePaths.length });

  // Load frames as base64
  const images = await Promise.all(
    framePaths.map(async (p) => {
      const buf = await fs.readFile(p);
      return buf.toString('base64');
    }),
  );

  const prompt = buildPrompt(originalFilename);

  const response = await fetch(`${CONFIG.OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CONFIG.OLLAMA_MODEL,
      prompt: prompt,
      images: images,
      stream: false,
      options: {
        temperature: 0.2,
        num_predict: 500,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  return parseAIResponse(result.response, originalFilename);
}

function parseAIResponse(text, originalFilename) {
  let jsonText = text.trim();
  const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) jsonText = codeBlockMatch[1];
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (jsonMatch) jsonText = jsonMatch[0];

  try {
    const parsed = JSON.parse(jsonText);

    // Basic validation
    if (!parsed.suggestedFilename) throw new Error('Missing suggestedFilename');

    return {
      suggestedFilename: parsed.suggestedFilename,
      categories: parsed.categories || {},
    };
  } catch (err) {
    logger.warn('Failed to parse AI response, using fallback', { error: err.message });
    return {
      suggestedFilename: extractBaseFilename(originalFilename),
      categories: {},
    };
  }
}

// ============================================================================
// File Operations
// ============================================================================

async function moveFiles(videoPath, spriteBuffer, thumbBuffer, suggestedName) {
  await ensureDir(CONFIG.PROCESSED_DIR);
  await ensureDir(CONFIG.THUMBNAILS_DIR);

  const ext = path.extname(videoPath);
  const baseName = sanitizeFilename(suggestedName);

  let targetBase = path.join(CONFIG.PROCESSED_DIR, baseName);
  let counter = 0;

  // Ensure unique filename
  while (
    (await fileExists(`${targetBase}${ext}`)) ||
    (await fileExists(path.join(CONFIG.THUMBNAILS_DIR, `${path.basename(targetBase)}_sprite.jpg`))) ||
    (await fileExists(path.join(CONFIG.THUMBNAILS_DIR, `${path.basename(targetBase)}_thumb.jpg`)))
  ) {
    counter++;
    targetBase = path.join(CONFIG.PROCESSED_DIR, `${baseName}_${counter}`);
  }

  const finalBaseName = path.basename(targetBase);
  const newVideoPath = `${targetBase}${ext}`;
  const spritePath = path.join(CONFIG.THUMBNAILS_DIR, `${finalBaseName}_sprite.jpg`);
  const thumbPath = path.join(CONFIG.THUMBNAILS_DIR, `${finalBaseName}_thumb.jpg`);

  // Write images
  await fs.writeFile(spritePath, spriteBuffer);
  await fs.writeFile(thumbPath, thumbBuffer);

  // Move video
  await fs.rename(videoPath, newVideoPath);

  logger.info('Files moved to Processed/Thumbnails', {
    video: newVideoPath,
    sprite: spritePath,
    thumb: thumbPath,
  });

  return { newVideoPath, spritePath, thumbPath };
}

async function cleanupFrames(framePaths) {
  await Promise.all(
    framePaths.map(async (framePath) => {
      try {
        await fs.unlink(framePath);
      } catch (err) {
        logger.warn('Failed to cleanup frame', { framePath, error: err.message });
      }
    }),
  );
}

// ============================================================================
// Main Processing Pipeline
// ============================================================================

async function processVideo(videoPath) {
  const videoName = path.basename(videoPath);
  logger.info('='.repeat(60));
  logger.info(`Processing video: ${videoName}`);
  logger.info('='.repeat(60));

  const tempDir = path.join(CONFIG.INBOX_DIR, `.temp_${Date.now()}`);
  await ensureDir(tempDir);

  let framePaths = [];

  try {
    // Step 1: Extract frames
    framePaths = await extractFrames(videoPath, tempDir);

    // Step 2: Generate assets
    const spriteBuffer = await stitchFrames(framePaths);
    const thumbBuffer = await createSingleThumbnail(framePaths);

    // Step 3: AI analysis
    const analysis = await analyzeWithLLaVA(framePaths, videoName);
    logger.info('AI Analysis Result', analysis);

    // Step 4: Move and rename files
    await moveFiles(videoPath, spriteBuffer, thumbBuffer, analysis.suggestedFilename);

    return { success: true };
  } catch (err) {
    logger.error('Video processing failed', err);
    return { success: false, error: err.message };
  } finally {
    // Cleanup temp files
    if (framePaths.length > 0) {
      await cleanupFrames(framePaths);
    }
    try {
      await fs.rmdir(tempDir);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  logger.info('Inbox Video Processor starting', {
    config: CONFIG,
    nodeVersion: process.version,
  });

  if (!(await fileExists(CONFIG.INBOX_DIR))) {
    logger.error('Inbox directory not found', { path: CONFIG.INBOX_DIR });
    process.exit(1);
  }

  const entries = await fs.readdir(CONFIG.INBOX_DIR, { withFileTypes: true });
  const videos = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.mp4'))
    .map((e) => path.join(CONFIG.INBOX_DIR, e.name));

  if (videos.length === 0) {
    logger.info('No videos found in Inbox');
    return;
  }

  logger.info(`Found ${videos.length} video(s) to process`);

  for (const videoPath of videos) {
    await processVideo(videoPath);
  }

  logger.info('Processing complete');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    logger.error('Unexpected error', err);
    process.exit(1);
  });
}
