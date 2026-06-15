#!/usr/bin/env node
/**
 * AI-Powered Video Processing Script
 *
 * Processes videos from Needs_Thumbnail/ directory:
 * 1. Extracts 10 frames at 10%, 20%...100% of video duration
 * 2. Stitches frames into horizontal strip image
 * 3. Analyzes with Ollama LLaVA for categorization
 * 4. Renames and moves to Processed/
 * 5. Saves strip to Thumbnails/
 * 6. Registers in database
 *
 * Usage:
 *   npm run process-videos
 *   MOCK_AI=true npm run process-videos
 *   PROCESS_CONCURRENCY=4 npm run process-videos
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
  CONCURRENCY: parseInt(process.env.PROCESS_CONCURRENCY || '2', 10),
  FRAME_COUNT: 10,
  FRAME_WIDTH: 160,
  STRIP_QUALITY: 0.9,

  // Directories
  NEEDS_THUMBNAIL_DIR:
    process.env.NEEDS_THUMBNAIL_DIR || '/home/patrick/VideoVault/Bibliothek/Needs_Thumbnail',
  PROCESSED_DIR: process.env.PROCESSED_DIR || '/home/patrick/VideoVault/Bibliothek/Processed',
  THUMBNAILS_DIR: process.env.THUMBNAILS_DIR || '/home/patrick/VideoVault/Bibliothek/Thumbnails',
};

// Category schema from CategoryExtractor
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

function generateVideoId(videoPath) {
  return crypto.createHash('sha256').update(videoPath).digest('hex').substring(0, 16);
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
    const timestamp = (duration * i) / CONFIG.FRAME_COUNT;
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

async function extractVideoMetadata(videoPath) {
  const duration = await getDurationSeconds(videoPath);
  const stats = await fs.stat(videoPath);

  // Get video dimensions
  const probeArgs = [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height,codec_name',
    '-of',
    'json',
    videoPath,
  ];

  const { stdout } = await run('ffprobe', probeArgs);
  const probeData = JSON.parse(stdout);
  const stream = probeData.streams?.[0] || {};

  const width = stream.width || 1920;
  const height = stream.height || 1080;
  const codec = stream.codec_name || 'h264';

  // Calculate aspect ratio
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  const aspectRatio = `${width / divisor}:${height / divisor}`;

  // Estimate bitrate
  const bitrate = Math.round((stats.size * 8) / duration / 1000); // kbps

  return {
    duration,
    width,
    height,
    bitrate,
    codec,
    fps: 30, // default, can't easily extract from all formats
    aspectRatio,
  };
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

  logger.info('Strip created successfully', {
    width: totalWidth,
    height: frameHeight,
    size: buffer.length,
  });

  return buffer;
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
      suggestedFilename: `mock_${Date.now()}`,
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
  // Try to extract JSON from various formats
  let jsonText = text.trim();

  // Remove markdown code blocks
  const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) jsonText = codeBlockMatch[1];

  // Find JSON object
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (jsonMatch) jsonText = jsonMatch[0];

  try {
    const parsed = JSON.parse(jsonText);

    // Validate structure
    if (!parsed.categories || typeof parsed.categories !== 'object') {
      throw new Error('Invalid categories structure');
    }

    // Sanitize categories
    const validCategories = {};
    const categoryTypes = [
      'age',
      'physical',
      'ethnicity',
      'relationship',
      'acts',
      'setting',
      'quality',
      'performer',
    ];

    for (const type of categoryTypes) {
      const values = parsed.categories[type];
      validCategories[type] = Array.isArray(values)
        ? values.filter((v) => typeof v === 'string' && v.length > 0).map((v) => v.toLowerCase())
        : [];
    }

    logger.info('AI analysis successful', {
      suggestedFilename: parsed.suggestedFilename,
      categoryCount: Object.values(validCategories).flat().length,
    });

    return {
      suggestedFilename: parsed.suggestedFilename || extractBaseFilename(originalFilename),
      categories: validCategories,
    };
  } catch (err) {
    logger.warn('Failed to parse AI response, using fallback', { error: err.message });

    // Fallback: extract from filename
    return fallbackAnalysis(originalFilename);
  }
}

function fallbackAnalysis(originalFilename) {
  const categories = {
    age: [],
    physical: [],
    ethnicity: [],
    relationship: [],
    acts: [],
    setting: [],
    quality: [],
    performer: [],
  };

  const normalized = originalFilename.toLowerCase();

  // Extract categories using pattern matching
  Object.entries(CATEGORY_PATTERNS).forEach(([type, patterns]) => {
    patterns.forEach((pattern) => {
      if (normalized.includes(pattern)) {
        if (!categories[type].includes(pattern)) {
          categories[type].push(pattern);
        }
      }
    });
  });

  return {
    suggestedFilename: extractBaseFilename(originalFilename),
    categories,
  };
}

// ============================================================================
// File Operations
// ============================================================================

async function moveVideo(oldPath, suggestedName) {
  const ext = path.extname(oldPath);
  const baseName = sanitizeFilename(suggestedName);

  await ensureDir(CONFIG.PROCESSED_DIR);

  let newPath = path.join(CONFIG.PROCESSED_DIR, `${baseName}${ext}`);

  // Handle filename conflicts
  let counter = 1;
  while (await fileExists(newPath)) {
    newPath = path.join(CONFIG.PROCESSED_DIR, `${baseName}_${counter}${ext}`);
    counter++;
  }

  await fs.rename(oldPath, newPath);
  logger.info('Video moved', { from: oldPath, to: newPath });

  return newPath;
}

async function saveStrip(stripBuffer, videoBaseName) {
  await ensureDir(CONFIG.THUMBNAILS_DIR);

  const stripFilename = `${sanitizeFilename(videoBaseName)}.jpg`;
  const stripPath = path.join(CONFIG.THUMBNAILS_DIR, stripFilename);

  await fs.writeFile(stripPath, stripBuffer);
  logger.info('Strip saved', { path: stripPath, size: stripBuffer.length });

  return stripPath;
}

async function quarantineVideo(videoPath) {
  const failedDir = path.join(CONFIG.NEEDS_THUMBNAIL_DIR, 'Failed');
  await ensureDir(failedDir);

  const filename = path.basename(videoPath);
  const quarantinePath = path.join(failedDir, filename);

  try {
    await fs.rename(videoPath, quarantinePath);
    logger.warn('Video quarantined', { from: videoPath, to: quarantinePath });
  } catch (err) {
    logger.error('Failed to quarantine video', err);
  }
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
// Database Integration
// ============================================================================

async function registerInDatabase(videoData) {
  // TODO: Import db from server/db.ts and implement upsert
  // For now, just log what would be inserted
  logger.info('Would register in database', {
    id: videoData.id,
    filename: videoData.filename,
    displayName: videoData.displayName,
    categoriesCount: Object.values(videoData.categories).flat().length,
  });

  // This will be implemented in Phase 3
  return Promise.resolve();
}

// ============================================================================
// Main Processing Pipeline
// ============================================================================

async function processVideo(videoPath) {
  const videoName = path.basename(videoPath);
  logger.info('='.repeat(60));
  logger.info(`Processing video: ${videoName}`);
  logger.info('='.repeat(60));

  const tempDir = path.join(CONFIG.NEEDS_THUMBNAIL_DIR, `.temp_${Date.now()}`);
  await ensureDir(tempDir);

  let framePaths = [];

  try {
    // Step 1: Extract video metadata
    const metadata = await extractVideoMetadata(videoPath);
    logger.info('Metadata extracted', metadata);

    // Step 2: Extract frames
    framePaths = await extractFrames(videoPath, tempDir);

    // Step 3: Stitch frames into strip
    const stripBuffer = await stitchFrames(framePaths);

    // Step 4: AI analysis
    const analysis = await analyzeWithLLaVA(framePaths, videoName);

    // Step 5: Save strip
    const stripPath = await saveStrip(stripBuffer, analysis.suggestedFilename);

    // Step 6: Move video
    const newVideoPath = await moveVideo(videoPath, analysis.suggestedFilename);

    // Step 7: Register in database
    const videoData = {
      id: generateVideoId(newVideoPath),
      filename: path.basename(newVideoPath),
      displayName: analysis.suggestedFilename,
      path: newVideoPath,
      size: (await fs.stat(newVideoPath)).size,
      lastModified: (await fs.stat(newVideoPath)).mtime.toISOString(),
      metadata,
      categories: analysis.categories,
      customCategories: {},
      thumbnail: {
        dataUrl: '',
        stripPath: path.relative(CONFIG.THUMBNAILS_DIR, stripPath),
        stripFrameCount: CONFIG.FRAME_COUNT,
        stripFrameWidth: CONFIG.FRAME_WIDTH,
        generated: true,
        timestamp: new Date().toISOString(),
      },
      rootKey: 'bibliothek',
    };

    await registerInDatabase(videoData);

    logger.info('Video processing completed successfully', {
      originalName: videoName,
      newName: path.basename(newVideoPath),
    });

    return { success: true, videoData };
  } catch (err) {
    logger.error('Video processing failed', err);
    await quarantineVideo(videoPath);
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
  logger.info('AI Video Processor starting', {
    config: CONFIG,
    nodeVersion: process.version,
  });

  // Check if Needs_Thumbnail directory exists
  if (!(await fileExists(CONFIG.NEEDS_THUMBNAIL_DIR))) {
    logger.error('Needs_Thumbnail directory not found', { path: CONFIG.NEEDS_THUMBNAIL_DIR });
    process.exit(1);
  }

  // List all MP4 files
  const entries = await fs.readdir(CONFIG.NEEDS_THUMBNAIL_DIR, { withFileTypes: true });
  const videos = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.mp4'))
    .map((e) => path.join(CONFIG.NEEDS_THUMBNAIL_DIR, e.name));

  if (videos.length === 0) {
    logger.info('No videos found to process');
    return;
  }

  logger.info(`Found ${videos.length} video(s) to process`, {
    concurrency: CONFIG.CONCURRENCY,
  });

  // Process with concurrency control
  let index = 0;
  let successCount = 0;
  let failureCount = 0;

  const processNext = async () => {
    while (index < videos.length) {
      const i = index++;
      const videoPath = videos[i];

      const result = await processVideo(videoPath);
      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }
    }
  };

  const workers = Array.from({ length: CONFIG.CONCURRENCY }, () => processNext());
  await Promise.all(workers);

  logger.info('='.repeat(60));
  logger.info('Processing complete', {
    total: videos.length,
    success: successCount,
    failures: failureCount,
  });
  logger.info('='.repeat(60));
}

// Run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    logger.error('Unexpected error', err);
    process.exit(1);
  });
}

export { processVideo, analyzeWithLLaVA, extractFrames, stitchFrames };
