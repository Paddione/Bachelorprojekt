import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { videos, directoryRoots } from '../shared/videovault/schema';
import { eq } from 'drizzle-orm';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../env/.env-app.local');
dotenv.config({ path: envPath });

const PROCESSED_DIR =
  process.env.PROCESSED_DIR || process.env.PROCESSED_MEDIA_PATH || '/mnt/e/Processed';
const THUMBNAILS_DIR = process.env.THUMBNAILS_DIR || path.join(PROCESSED_DIR, 'Thumbnails');
const ROOT_KEY = 'processed-root';
const DEFAULT_CATEGORIES = {
  age: [],
  physical: [],
  ethnicity: [],
  relationship: [],
  acts: [],
  setting: [],
  quality: [],
  performer: [],
};

async function getFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const res = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await getFiles(res)));
    } else {
      if (entry.name.toLowerCase().endsWith('.mp4')) {
        files.push(res);
      }
    }
  }
  return files;
}

function generateId(filePath: string) {
  return crypto.createHash('md5').update(filePath).digest('hex');
}

async function getVideoMetadata(filePath: string): Promise<any> {
  return new Promise((resolve) => {
    const args = [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height,bit_rate,codec_name,r_frame_rate:format=duration',
      '-of',
      'json',
      filePath,
    ];
    const p = spawn('ffprobe', args);
    let out = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.on('close', (code) => {
      if (code === 0) {
        try {
          const data = JSON.parse(out);
          const stream = data.streams?.[0];
          const format = data.format;
          if (stream) {
            const fpsParts = (stream.r_frame_rate || '0/1').split('/');
            const fps = fpsParts.length === 2 ? Number(fpsParts[0]) / Number(fpsParts[1]) : 0;
            const duration = parseFloat(format?.duration || stream.duration) || 0;
            resolve({
              duration,
              width: stream.width || 0,
              height: stream.height || 0,
              bitrate: parseInt(stream.bit_rate) || 0,
              codec: stream.codec_name || '',
              fps: Number.isFinite(fps) ? fps : 0,
              aspectRatio: stream.width && stream.height ? `${stream.width}:${stream.height}` : '',
            });
            return;
          }
        } catch (e) {
          console.error('Error parsing ffprobe output:', e);
        }
      }
      resolve({ duration: 0, width: 0, height: 0, bitrate: 0, codec: '', fps: 0, aspectRatio: '' });
    });
    p.on('error', (err) => {
      console.error('ffprobe error:', err);
      resolve({ duration: 0, width: 0, height: 0, bitrate: 0, codec: '', fps: 0, aspectRatio: '' });
    });
  });
}

async function sync() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const db = drizzle(client);

  console.log(`Scanning ${PROCESSED_DIR}...`);
  const files = await getFiles(PROCESSED_DIR);
  console.log(`Found ${files.length} MP4 files.`);

  const videoEntries = [];
  for (const filePath of files) {
    const id = generateId(filePath);
    const filename = path.basename(filePath);
    const rel = path.relative(PROCESSED_DIR, filePath);
    const relBase = rel.replace(/\.[^.]+$/, '');
    const thumbPath = path.join(THUMBNAILS_DIR, `${relBase}_thumb.jpg`);

    let hasThumb = false;
    try {
      await fs.access(thumbPath);
      hasThumb = true;
    } catch {}

    // Construct web path: /media/processed/Thumbnails/.../filename_thumb.jpg
    const relThumb = path.relative(PROCESSED_DIR, thumbPath);
    const webThumbPath = `/media/processed/${relThumb.split(path.sep).join('/')}`;

    const stat = await fs.stat(filePath);
    const metadata = await getVideoMetadata(filePath);

    videoEntries.push({
      id,
      filename,
      displayName: filename,
      path: filePath,
      size: stat.size,
      lastModified: new Date(stat.mtime),
      metadata,
      categories: { ...DEFAULT_CATEGORIES },
      customCategories: {},
      rootKey: ROOT_KEY, // Explicitly use our root key
      thumbnail: hasThumb ? { dataUrl: webThumbPath, generated: true, timestamp: '0' } : null,
    });
  }

  console.log(`Prepared ${videoEntries.length} entries.`);
  // Dedup check
  const pathSet = new Set(videoEntries.map((v) => v.path));
  if (pathSet.size !== videoEntries.length) {
    console.error('ERROR: Duplicates in scan results!');
    return;
  }

  // Cleanup Old Root Data
  console.log('Cleaning old data...');
  await db.delete(videos).where(eq(videos.rootKey, ROOT_KEY));

  // Ensure Root Exists
  await db
    .insert(directoryRoots)
    .values({
      rootKey: ROOT_KEY,
      name: 'Processed Library',
      directories: [PROCESSED_DIR],
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  console.log('Inserting...');
  const chunkSize = 100;
  for (let i = 0; i < videoEntries.length; i += chunkSize) {
    const chunk = videoEntries.slice(i, i + chunkSize);
    await db.insert(videos).values(chunk).onConflictDoNothing();
  }
  console.log('Done.');

  await client.end();
}

sync().catch(console.error);
