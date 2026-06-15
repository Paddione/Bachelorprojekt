/* eslint-disable */
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import { CORRUPT_PERFORMERS } from '../shared/videovault/corrupt-performers.ts';

const CORRUPT_PERFORMERS_SET = new Set(CORRUPT_PERFORMERS.map((p: string) => p.toLowerCase()));

// Load environment variables
dotenv.config({ path: 'env/.env-app.local' });

const DRY_RUN = process.env.DRY_RUN !== 'false'; // Default to true for safety

console.log(`Running in ${DRY_RUN ? 'DRY RUN' : 'LIVE'} mode`);

// --- Types & Extractor Logic (Ported from client) ---

interface VideoCategories {
  age: string[];
  physical: string[];
  ethnicity: string[];
  relationship: string[];
  acts: string[];
  setting: string[];
  quality: string[];
  performer: string[];
}

class CategoryExtractor {
  static readonly CATEGORY_PATTERNS = {
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
    performer: [], // Will be populated dynamically
  };

  static extractCategories(filename: string): VideoCategories {
    const normalizedFilename = filename
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const categories: VideoCategories = {
      age: [],
      physical: [],
      ethnicity: [],
      relationship: [],
      acts: [],
      setting: [],
      quality: [],
      performer: [],
    };

    // Extract categories using pattern matching
    Object.entries(this.CATEGORY_PATTERNS).forEach(([type, patterns]) => {
      patterns.forEach((pattern) => {
        if (normalizedFilename.includes(pattern)) {
          const categoryArray = categories[type as keyof VideoCategories];
          if (categoryArray && !categoryArray.includes(pattern)) {
            categoryArray.push(pattern);
          }
        }
      });
    });

    // Extract potential performer names
    const words = filename.split(/[^a-zA-Z]/).filter((word) => word.length > 2);
    words.forEach((word) => {
      if (
        word[0] === word[0].toUpperCase() &&
        !this.isCommonWord(word.toLowerCase()) &&
        word.length >= 3
      ) {
        const performerName = word.toLowerCase();
        if (
          !categories.performer.includes(performerName) &&
          !CORRUPT_PERFORMERS_SET.has(performerName)
        ) {
          categories.performer.push(performerName);
        }
      }
    });

    return categories;
  }

  private static isCommonWord(word: string): boolean {
    const commonWords = [
      'the',
      'and',
      'for',
      'with',
      'her',
      'his',
      'she',
      'him',
      'best',
      'hot',
      'sex',
      'fuck',
      'porn',
      'xxx',
      'video',
      'clip',
      'scene',
      'new',
      'old',
      'mp4',
      'mkv',
      'avi',
      'mov',
      'wmv', // Added extensions to common words
    ];
    return commonWords.includes(word);
  }
}

// --- DB Setup ---

const { Pool } = pg;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  const db = drizzle(pool);

  const BIBLIOTHEK_DIR = path.resolve('Bibliothek');
  if (!fs.existsSync(BIBLIOTHEK_DIR)) {
    console.error(`Directory not found: ${BIBLIOTHEK_DIR}`);
    process.exit(1);
  }

  try {
    console.log('Fetching videos...');
    const result = await pool.query('SELECT id, categories FROM videos');
    const videos = result.rows;

    console.log(`Found ${videos.length} videos in DB.`);

    for (const video of videos) {
      if (video.id === 'test') continue; // Skip test entry

      // 1. Decode ID to get original filename
      let decoded: string;
      try {
        decoded = Buffer.from(video.id, 'base64').toString('utf-8');
      } catch (e) {
        console.warn(`Failed to decode ID ${video.id}, skipping.`);
        continue;
      }

      // Format: filename-size-timestamp
      // We split by '-' but filename might contain dashes.
      // The suffix is -size-timestamp.
      const lastDash = decoded.lastIndexOf('-');
      if (lastDash === -1) {
        console.warn(`Invalid decoded ID format: ${decoded}`);
        continue;
      }
      const secondLastDash = decoded.lastIndexOf('-', lastDash - 1);
      if (secondLastDash === -1) {
        console.warn(`Invalid decoded ID format: ${decoded}`);
        continue;
      }

      const originalFilename = decoded.substring(0, secondLastDash);
      // const size = decoded.substring(secondLastDash + 1, lastDash);
      // const timestamp = decoded.substring(lastDash + 1);

      // 2. Find file in Bibliothek
      // We look for the file with 'originalFilename'
      // OR we look for the file that is ALREADY renamed to [ID].mp4 (if script ran partially)

      let currentPath = path.join(BIBLIOTHEK_DIR, originalFilename);
      let fileExists = fs.existsSync(currentPath);

      // Check if already renamed
      const ext = path.extname(originalFilename);
      const newFilename = `${video.id}${ext}`; // Assuming ext is preserved from original
      const newPath = path.join(BIBLIOTHEK_DIR, newFilename);

      if (!fileExists && fs.existsSync(newPath)) {
        currentPath = newPath;
        fileExists = true;
      }

      if (!fileExists) {
        console.warn(
          `File not found for ID ${video.id}: looked for "${originalFilename}" or "${newFilename}" in ${BIBLIOTHEK_DIR}`,
        );
        continue;
      }

      // 3. Extract Categories (from the ORIGINAL filename, which is more descriptive)
      const newCategories = CategoryExtractor.extractCategories(originalFilename);

      const currentCategories = video.categories || {};
      const mergedCategories: any = { ...currentCategories };

      let categoriesChanged = false;
      for (const [key, values] of Object.entries(newCategories)) {
        if (!mergedCategories[key]) mergedCategories[key] = [];
        for (const val of values) {
          if (!mergedCategories[key].includes(val)) {
            mergedCategories[key].push(val);
            categoriesChanged = true;
          }
        }
      }

      // 4. Rename File (if not already renamed)
      const needsRename = path.basename(currentPath) !== newFilename;

      if (!needsRename && !categoriesChanged) {
        continue;
      }

      console.log(`Processing ${video.id}:`);
      console.log(`  Original Name: ${originalFilename}`);
      if (categoriesChanged) {
        console.log(`  - Updating categories: ${JSON.stringify(newCategories)}`);
      }
      if (needsRename) {
        console.log(`  - Renaming: "${path.basename(currentPath)}" -> "${newFilename}"`);
      }

      if (!DRY_RUN) {
        // Perform DB Update
        // We update filename, path, categories.
        // We also update size if we want to be correct (fs.statSync(currentPath).size)
        const stats = fs.statSync(currentPath);

        await pool.query(
          'UPDATE videos SET categories = $1, filename = $2, path = $3, size = $4 WHERE id = $5',
          [JSON.stringify(mergedCategories), newFilename, newPath, stats.size, video.id],
        );

        // Perform File Rename
        if (needsRename) {
          fs.renameSync(currentPath, newPath);
        }
      }
    }

    console.log('Done.');
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await pool.end();
  }
}

main();
