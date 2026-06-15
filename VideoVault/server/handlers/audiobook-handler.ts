import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { logger } from '../lib/logger';
import type { JobContext } from '../lib/enhanced-job-queue';

// Supported audiobook file extensions
const AUDIOBOOK_EXTENSIONS = ['.mp3', '.m4a', '.m4b', '.aac', '.flac', '.ogg', '.wma'];

// Common audiobook folder structure indicators
const AUDIOBOOK_INDICATORS = ['audiobook', 'audio book', 'narrated'];

export interface AudiobookJobPayload {
  inputPath: string;
  audiobookId?: string;
  rootKey?: string;
  autoOrganize?: boolean;
}

export interface AudiobookChapter {
  index: number;
  title: string;
  path: string;
  duration: number;
  startTime: number;
  fileSize: number;
}

export interface AudiobookMetadata {
  title: string;
  author: string;
  narrator?: string;
  publisher?: string;
  publishDate?: string;
  series?: string;
  seriesIndex?: number;
  description?: string;
  language?: string;
  totalDuration: number;
  totalSize: number;
  sampleRate?: number;
  bitrate?: number;
}

interface FFprobeAudioResult {
  streams: Array<{
    codec_type: string;
    codec_name: string;
    sample_rate?: string;
    bit_rate?: string;
    channels?: number;
  }>;
  format: {
    duration: string;
    bit_rate: string;
    size: string;
    tags?: {
      title?: string;
      artist?: string;
      album?: string;
      album_artist?: string;
      composer?: string;
      comment?: string;
      date?: string;
      genre?: string;
      track?: string;
    };
  };
}

/**
 * Parse author and title from audiobook folder name
 * Common patterns:
 * - "Author Name - Book Title"
 * - "Book Title - Author Name"
 * - "Author Name/Book Title"
 */
function parseAudiobookFolder(folderName: string): { title: string; author: string } {
  // Try common separators
  const separators = [' - ', ' – ', ' — ', '/'];

  for (const sep of separators) {
    if (folderName.includes(sep)) {
      const parts = folderName.split(sep);
      if (parts.length === 2) {
        // Heuristic: if first part looks like a name (2-3 words), it's likely the author
        const firstWords = parts[0].trim().split(/\s+/).length;
        if (firstWords <= 4 && /^[A-Z]/.test(parts[0])) {
          return {
            author: parts[0].trim(),
            title: parts[1].trim(),
          };
        }
        // Otherwise assume title first
        return {
          title: parts[0].trim(),
          author: parts[1].trim(),
        };
      }
    }
  }

  // Fallback: use folder name as title, author unknown
  return {
    title: folderName.trim(),
    author: 'Unknown Author',
  };
}

/**
 * Generate organized folder path for an audiobook
 * Format: Author/Title/
 */
function generateOrganizedPath(author: string, title: string): string {
  const sanitize = (s: string) => s.replace(/[<>:"/\\|?*]/g, '').trim();
  return path.join(sanitize(author), sanitize(title));
}

/**
 * Extract metadata from an audio file using ffprobe
 */
async function extractAudioMetadata(
  filePath: string,
): Promise<{ duration: number; bitrate: number; sampleRate: number; tags: any }> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      '-select_streams', 'a:0',
      filePath,
    ];

    const proc = spawn('ffprobe', args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => (stdout += data.toString()));
    proc.stderr.on('data', (data) => (stderr += data.toString()));

    proc.on('close', async (code) => {
      if (code !== 0) {
        return reject(new Error(`ffprobe failed with code ${code}: ${stderr}`));
      }

      try {
        const data: FFprobeAudioResult = JSON.parse(stdout);
        const audioStream = data.streams.find((s) => s.codec_type === 'audio');

        resolve({
          duration: parseFloat(data.format.duration) || 0,
          bitrate: parseInt(data.format.bit_rate) || 0,
          sampleRate: audioStream ? parseInt(audioStream.sample_rate || '0') : 0,
          tags: data.format.tags || {},
        });
      } catch (error: any) {
        reject(new Error(`Failed to parse ffprobe output: ${error.message}`));
      }
    });

    proc.on('error', (error) => {
      reject(new Error(`Failed to spawn ffprobe: ${error.message}`));
    });
  });
}

/**
 * Extract cover image from audio file using ffmpeg
 */
async function extractCoverImage(audioPath: string, outputPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const args = [
      '-i', audioPath,
      '-an', // No audio
      '-vcodec', 'mjpeg',
      '-y',
      outputPath,
    ];

    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'ignore'] });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

/**
 * Find cover image in audiobook folder
 */
async function findCoverImage(folderPath: string): Promise<string | null> {
  const coverNames = ['cover.jpg', 'cover.jpeg', 'cover.png', 'folder.jpg', 'folder.jpeg', 'folder.png'];

  for (const coverName of coverNames) {
    const coverPath = path.join(folderPath, coverName);
    try {
      await fs.access(coverPath);
      return coverPath;
    } catch {
      // Continue searching
    }
  }

  return null;
}

/**
 * Calculate folder hash
 */
async function calculateFolderHash(folderPath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  const entries = await fs.readdir(folderPath, { withFileTypes: true });

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (AUDIOBOOK_EXTENSIONS.includes(ext)) {
        hash.update(entry.name);
        const stats = await fs.stat(path.join(folderPath, entry.name));
        hash.update(stats.size.toString());
      }
    }
  }

  return hash.digest('hex');
}

/**
 * Natural sort for chapter ordering
 */
function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Main Audiobook Processing Handler
 */
export async function handleAudiobookProcessing(
  data: AudiobookJobPayload,
  context: JobContext,
  db: any,
) {
  const { inputPath, audiobookId, rootKey, autoOrganize = true } = data;
  const AUDIOBOOKS_DIR = process.env.AUDIOBOOKS_DIR || path.join(process.cwd(), 'media', 'audiobooks');

  logger.info(`[AudiobookHandler] Processing audiobook: ${inputPath}`, { audiobookId, rootKey });

  try {
    // 1. Verify folder exists
    const stats = await fs.stat(inputPath);
    if (!stats.isDirectory()) {
      throw new Error('Input path must be a directory');
    }

    // 2. Parse author and title from folder name
    const folderName = path.basename(inputPath);
    let { author, title } = parseAudiobookFolder(folderName);

    // 3. Scan for audio files
    const entries = await fs.readdir(inputPath, { withFileTypes: true });
    const audioFiles = entries
      .filter((e) => e.isFile() && AUDIOBOOK_EXTENSIONS.includes(path.extname(e.name).toLowerCase()))
      .map((e) => e.name)
      .sort(naturalSort);

    if (audioFiles.length === 0) {
      throw new Error('No audio files found in directory');
    }

    logger.info(`[AudiobookHandler] Found ${audioFiles.length} audio files`, { title, author });

    // 4. Extract metadata from first file (for overall metadata and cover)
    const firstFilePath = path.join(inputPath, audioFiles[0]);
    const firstFileMeta = await extractAudioMetadata(firstFilePath);

    // Use metadata tags if available
    if (firstFileMeta.tags?.album) {
      title = firstFileMeta.tags.album;
    }
    if (firstFileMeta.tags?.artist || firstFileMeta.tags?.album_artist) {
      author = firstFileMeta.tags?.album_artist || firstFileMeta.tags?.artist || author;
    }

    // 5. Process each chapter
    const chapters: AudiobookChapter[] = [];
    let totalDuration = 0;
    let totalSize = 0;

    for (let i = 0; i < audioFiles.length; i++) {
      const fileName = audioFiles[i];
      const filePath = path.join(inputPath, fileName);
      const fileStats = await fs.stat(filePath);

      const meta = await extractAudioMetadata(filePath);

      chapters.push({
        index: i,
        title: meta.tags?.title || path.basename(fileName, path.extname(fileName)),
        path: fileName,
        duration: meta.duration,
        startTime: totalDuration,
        fileSize: fileStats.size,
      });

      totalDuration += meta.duration;
      totalSize += fileStats.size;
    }

    logger.info(`[AudiobookHandler] Total duration: ${totalDuration}s, ${chapters.length} chapters`, { title });

    // 6. Calculate folder hash
    const folderHash = await calculateFolderHash(inputPath);

    // 7. Organize file if autoOrganize is enabled
    let finalPath = inputPath;
    let relativePath = path.relative(AUDIOBOOKS_DIR, inputPath);

    if (autoOrganize) {
      const organizedFolder = generateOrganizedPath(author, title);
      const targetDir = path.join(AUDIOBOOKS_DIR, organizedFolder);

      if (inputPath !== targetDir && !inputPath.startsWith(targetDir)) {
        // Create target directory
        await fs.mkdir(path.dirname(targetDir), { recursive: true });

        // Move the folder
        try {
          await fs.rename(inputPath, targetDir);
          finalPath = targetDir;
          relativePath = path.relative(AUDIOBOOKS_DIR, targetDir);
          logger.info(`[AudiobookHandler] Organized: ${inputPath} -> ${targetDir}`);
        } catch (moveError: any) {
          // If rename fails, log and continue with original path
          logger.warn(`[AudiobookHandler] Could not move folder: ${moveError.message}`);
        }
      }
    }

    // 8. Extract or find cover image
    const thumbsDir = path.join(finalPath, 'Thumbnails');
    await fs.mkdir(thumbsDir, { recursive: true });

    let coverPath = await findCoverImage(finalPath);
    const coverOutput = path.join(thumbsDir, 'cover.jpg');

    if (!coverPath) {
      // Try to extract from first audio file
      const extracted = await extractCoverImage(path.join(finalPath, audioFiles[0]), coverOutput);
      if (extracted) {
        coverPath = coverOutput;
      }
    } else {
      // Copy existing cover to Thumbnails
      await fs.copyFile(coverPath, coverOutput);
      coverPath = coverOutput;
    }

    // 9. Build metadata
    const metadata: AudiobookMetadata = {
      title,
      author,
      narrator: firstFileMeta.tags?.composer,
      publisher: undefined,
      publishDate: firstFileMeta.tags?.date,
      series: undefined, // Could be parsed from folder structure
      seriesIndex: undefined,
      description: firstFileMeta.tags?.comment,
      language: undefined,
      totalDuration,
      totalSize,
      sampleRate: firstFileMeta.sampleRate,
      bitrate: firstFileMeta.bitrate,
    };

    // 10. Store in database (if available)
    const id = audiobookId || uuidv4();

    // Note: This would require an audiobooks table in the database
    // For now, we just return the result
    logger.info(`[AudiobookHandler] Successfully processed audiobook: ${title}`, {
      id,
      author,
      chapters: chapters.length,
      duration: totalDuration,
    });

    return {
      status: 'completed',
      audiobookId: id,
      title,
      author,
      path: finalPath,
      coverPath: coverPath ? path.relative(AUDIOBOOKS_DIR, coverPath) : null,
      chapters,
      metadata,
    };
  } catch (error: any) {
    logger.error(`[AudiobookHandler] Failed to process audiobook: ${inputPath}`, {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Scan audiobooks directory and return list of audiobook folders
 */
export async function scanAudiobooksDirectory(
  directory?: string,
): Promise<Array<{ path: string; name: string; fileCount: number }>> {
  const AUDIOBOOKS_DIR = directory || process.env.AUDIOBOOKS_DIR || path.join(process.cwd(), 'media', 'audiobooks');
  const audiobooks: Array<{ path: string; name: string; fileCount: number }> = [];

  async function scanDir(dir: string, depth = 0): Promise<void> {
    if (depth > 3) return; // Limit recursion depth

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      // Check if current directory contains audio files
      const audioFiles = entries.filter(
        (e) => e.isFile() && AUDIOBOOK_EXTENSIONS.includes(path.extname(e.name).toLowerCase()),
      );

      if (audioFiles.length > 0) {
        audiobooks.push({
          path: dir,
          name: path.basename(dir),
          fileCount: audioFiles.length,
        });
        return; // Don't recurse into audiobook folders
      }

      // Recurse into subdirectories
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== 'Thumbnails') {
          await scanDir(path.join(dir, entry.name), depth + 1);
        }
      }
    } catch (error: any) {
      logger.warn(`[AudiobookHandler] Failed to scan directory: ${dir}`, { error: error.message });
    }
  }

  await scanDir(AUDIOBOOKS_DIR);
  return audiobooks;
}
