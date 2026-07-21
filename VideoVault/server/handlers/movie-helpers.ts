import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import crypto from 'crypto';
import type { MovieMetadata } from './movie-types';

export const MOVIE_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.m4v'];

const TITLE_YEAR_PATTERNS = [
  /^(.+?)[\.\s]*(19\d{2}|20\d{2})[\.\s]/i,
  /^(.+?)[\s\[]*\((19\d{2}|20\d{2})\)[\]\s]*/i,
  /^(.+?)[\s]*\[(19\d{2}|20\d{2})\][\s]*/i,
  /^(.+?)\s*-\s*(19\d{2}|20\d{2})\s*-/i,
];

interface FFprobeResult {
  streams: Array<{
    codec_type: string;
    codec_name: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
    avg_frame_rate?: string;
  }>;
  format: {
    duration: string;
    bit_rate: string;
    size: string;
  };
}

export function parseMovieFilename(filename: string): { title: string; year?: number } {
  const baseName = path.basename(filename, path.extname(filename));

  for (const pattern of TITLE_YEAR_PATTERNS) {
    const match = baseName.match(pattern);
    if (match) {
      const rawTitle = match[1]
        .replace(/[\._]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const year = parseInt(match[2], 10);

      return {
        title: rawTitle,
        year: year >= 1900 && year <= new Date().getFullYear() + 1 ? year : undefined,
      };
    }
  }

  const cleanTitle = baseName
    .replace(/[\._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { title: cleanTitle };
}

const MAX_DIR_NAME_LENGTH = 60;

export function generateOrganizedPath(title: string, year?: number): string {
  const sanitizedTitle = title.replace(/[<>:"/\\|?*]/g, '').trim();
  const suffix = year ? ` (${year})` : '';
  const maxTitleLen = MAX_DIR_NAME_LENGTH - suffix.length;

  let truncated = sanitizedTitle;
  if (truncated.length > maxTitleLen) {
    truncated = truncated.slice(0, maxTitleLen);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxTitleLen * 0.5) {
      truncated = truncated.slice(0, lastSpace);
    }
    truncated = truncated.replace(/[\s\-_.,]+$/, '');
  }

  return `${truncated}${suffix}`;
}

export async function extractMovieMetadata(filePath: string): Promise<Omit<MovieMetadata, 'title' | 'year'>> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      '-select_streams', 'v:0',
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
        const data: FFprobeResult = JSON.parse(stdout);
        const videoStream = data.streams.find((s) => s.codec_type === 'video');

        if (!videoStream) {
          return reject(new Error('No video stream found'));
        }

        const fpsRatio = videoStream.r_frame_rate || videoStream.avg_frame_rate || '30/1';
        const [num, den] = fpsRatio.split('/').map(Number);
        const fps = den ? num / den : num;

        const stats = await fs.stat(filePath);

        const width = videoStream.width || 0;
        const height = videoStream.height || 0;
        const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
        const divisor = gcd(width, height) || 1;
        const aspectRatio = `${width / divisor}:${height / divisor}`;

        resolve({
          duration: parseFloat(data.format.duration) || 0,
          width,
          height,
          bitrate: parseInt(data.format.bit_rate) || 0,
          codec: videoStream.codec_name || 'unknown',
          fps: Math.round(fps * 100) / 100,
          aspectRatio,
          fileSize: stats.size,
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

export function detectQualityCategories(metadata: { width: number; height: number; fps: number }): string[] {
  const qualities: string[] = [];
  const { width, height, fps } = metadata;
  const maxDim = Math.max(width, height);

  if (maxDim >= 7680) qualities.push('8k');
  else if (maxDim >= 3840) qualities.push('4k');
  else if (maxDim >= 2560) qualities.push('2k');
  else if (maxDim >= 1920) qualities.push('1080p');
  else if (maxDim >= 1280) qualities.push('720p');
  else if (maxDim > 0) qualities.push('480p');

  if (fps >= 50) qualities.push('60fps');

  return qualities;
}

export async function calculateFileHash(filePath: string): Promise<string> {
  const stats = await fs.stat(filePath);
  const handle = await fs.open(filePath, 'r');
  const buffer = Buffer.alloc(Math.min(65536, stats.size));
  await handle.read(buffer, 0, buffer.length, 0);
  await handle.close();

  const hash = crypto.createHash('sha256');
  hash.update(buffer);
  hash.update(stats.size.toString());
  return hash.digest('hex');
}

export async function generateMovieThumbnail(
  inputPath: string,
  outputDir: string,
): Promise<{ thumb: string; sprite: string }> {
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const thumbOut = path.join(outputDir, `${baseName}_thumb.jpg`);
  const spriteOut = path.join(outputDir, `${baseName}_sprite.jpg`);

  const durationResult = await new Promise<number>((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputPath,
    ];
    const proc = spawn('ffprobe', args);
    let stdout = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.on('close', (code) => {
      if (code === 0) {
        const sec = parseFloat(stdout);
        resolve(Number.isFinite(sec) && sec > 0 ? sec : 0);
      } else {
        reject(new Error('Failed to get duration'));
      }
    });
    proc.on('error', reject);
  });

  if (durationResult === 0) {
    throw new Error('Invalid video duration');
  }

  await new Promise<void>((resolve, reject) => {
    const thumbArgs = [
      '-hide_banner', '-loglevel', 'error',
      '-y',
      '-ss', (durationResult * 0.5).toFixed(2),
      '-i', inputPath,
      '-frames:v', '1',
      '-q:v', '2',
      thumbOut,
    ];

    const proc = spawn('ffmpeg', thumbArgs);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg thumbnail failed with code ${code}`));
    });
    proc.on('error', reject);
  });

  const fps = 25 / durationResult;
  await new Promise<void>((resolve, reject) => {
    const spriteArgs = [
      '-hide_banner', '-loglevel', 'error',
      '-y',
      '-i', inputPath,
      '-vf', `fps=${fps},scale=160:-1,tile=25x1`,
      '-frames:v', '1',
      '-q:v', '2',
      spriteOut,
    ];

    const proc = spawn('ffmpeg', spriteArgs);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg sprite failed with code ${code}`));
    });
    proc.on('error', reject);
  });

  return { thumb: thumbOut, sprite: spriteOut };
}
