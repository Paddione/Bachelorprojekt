import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { resolveInputPath } from '../lib/path-resolver';
import { extractMovieMetadata } from './movie-handler';
import { generateVideoIdSync } from '@shared/video-id';
import { logger } from '../lib/logger';

const PROCESSED_MEDIA_PATH =
  process.env.PROCESSED_MEDIA_PATH || path.join(process.cwd(), 'processed');

function safeOutputPath(outDir: string, filename: string): string | null {
  const base = path.basename(filename);
  if (!base || base !== filename || base === '.' || base === '..' || base.includes('..')) {
    return null;
  }
  const resolvedDir = path.resolve(outDir);
  const candidate = path.resolve(resolvedDir, base);
  if (candidate !== path.join(resolvedDir, base) || !candidate.startsWith(resolvedDir + path.sep)) {
    return null;
  }
  return candidate;
}

export type SplitErrorCode =
  | 'missing_handle' | 'missing_directory' | 'invalid_split'
  | 'ffmpeg_failed' | 'permission_denied' | 'conflict' | 'not_server_resident';

export interface SplitSegmentInput {
  displayName: string;
  filename: string;
  categories: Record<string, string[]>;
  customCategories: Record<string, string[]>;
}

export interface ServerSplitParams {
  sourceId: string;
  sourcePath: string;
  rootKey?: string;
  splitTimeSeconds: number;
  first: SplitSegmentInput;
  second: SplitSegmentInput;
}

interface SegmentRecord {
  type: 'video';
  id: string;
  filename: string;
  displayName: string;
  path: string;
  size: number;
  lastModified: string;
  categories: Record<string, string[]>;
  customCategories: Record<string, string[]>;
  metadata: { duration: number; width: number; height: number; bitrate: number; codec: string; fps: number; aspectRatio: string };
  rootKey?: string;
}

export type ServerSplitResult =
  | { success: true; segments: [SegmentRecord, SegmentRecord] }
  | { success: false; message: string; code?: SplitErrorCode };

const STANDARD_KEYS = ['age', 'physical', 'ethnicity', 'relationship', 'acts', 'setting', 'quality', 'performer'];

function withStandardKeys(input: Record<string, string[]> | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = { ...(input ?? {}) };
  for (const k of STANDARD_KEYS) if (!Array.isArray(out[k])) out[k] = [];
  return out;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code: number) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(0, 500)}`)));
  });
}

async function buildSegment(outAbsPath: string, input: SplitSegmentInput, rootKey: string | undefined): Promise<SegmentRecord> {
  const meta = await extractMovieMetadata(outAbsPath);
  const stats = await fs.stat(outAbsPath);
  return {
    type: 'video',
    id: generateVideoIdSync(crypto, rootKey || 'splits', outAbsPath),
    filename: input.filename,
    displayName: input.displayName,
    path: outAbsPath,
    size: stats.size,
    lastModified: stats.mtime.toISOString(),
    categories: withStandardKeys(input.categories),
    customCategories: input.customCategories ?? {},
    metadata: {
      duration: meta.duration, width: meta.width, height: meta.height,
      bitrate: meta.bitrate, codec: meta.codec, fps: meta.fps, aspectRatio: meta.aspectRatio,
    },
    rootKey,
  };
}

export async function splitVideoOnServer(p: ServerSplitParams, db: unknown): Promise<ServerSplitResult> {
  const resolved = await resolveInputPath(p.sourcePath, p.rootKey, db);
  if (!resolved) {
    return { success: false, message: `Source not available on server: ${p.sourcePath}`, code: 'not_server_resident' };
  }

  const srcMeta = await extractMovieMetadata(resolved);
  if (!(p.splitTimeSeconds > 0.1 && p.splitTimeSeconds < srcMeta.duration - 0.1)) {
    return { success: false, message: `Split time ${p.splitTimeSeconds}s outside 0.1..${srcMeta.duration - 0.1}s`, code: 'invalid_split' };
  }

  const outDir = path.join(PROCESSED_MEDIA_PATH, 'splits', p.sourceId.slice(0, 2));
  await fs.mkdir(outDir, { recursive: true });
  const out1 = safeOutputPath(outDir, p.first.filename);
  const out2 = safeOutputPath(outDir, p.second.filename);
  if (!out1 || !out2) {
    return { success: false, message: 'Invalid output filename', code: 'invalid_split' };
  }

  for (const out of [out1, out2]) {
    try { await fs.access(out); return { success: false, message: `File already exists: ${out}`, code: 'conflict' }; }
    catch { /* not present → ok */ }
  }

  const t = p.splitTimeSeconds.toFixed(2);
  try {
    await runFfmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', resolved, '-t', t, '-c', 'copy', '-avoid_negative_ts', 'make_zero', out1]);
    await runFfmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-ss', t, '-i', resolved, '-c', 'copy', '-avoid_negative_ts', 'make_zero', out2]);
  } catch (err) {
    await fs.rm(out1, { force: true }).catch(() => {});
    await fs.rm(out2, { force: true }).catch(() => {});
    logger.error('[Split] ffmpeg failed', { error: err instanceof Error ? err.message : String(err) });
    return { success: false, message: err instanceof Error ? err.message : 'ffmpeg failed', code: 'ffmpeg_failed' };
  }

  const seg1 = await buildSegment(out1, p.first, p.rootKey);
  const seg2 = await buildSegment(out2, p.second, p.rootKey);
  return { success: true, segments: [seg1, seg2] };
}
