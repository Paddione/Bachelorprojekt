#!/usr/bin/env node
/**
 * Bulk Thumbnail Generator with Live Monitoring
 *
 * Usage:
 *   node scripts/bulk-thumbnail-live.mjs <directory> [--concurrency=N] [--watch]
 *
 * Features:
 *   - Submits all video files in parallel batches
 *   - Live updating progress display
 *   - Real-time stats from server
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import readline from 'node:readline';

const API_BASE = process.env.API_BASE || 'https://videovault.korczewski.de';
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.wmv'];

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
};

// Parse arguments
const args = process.argv.slice(2);
let directory = null;
let concurrency = 16; // Higher default for maximum throughput
let watchOnly = false;

for (const arg of args) {
  if (arg.startsWith('--concurrency=')) {
    concurrency = parseInt(arg.split('=')[1], 10) || 16;
  } else if (arg === '--watch') {
    watchOnly = true;
  } else if (!arg.startsWith('--')) {
    directory = arg;
  }
}

async function findVideoFiles(dir) {
  const files = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (VIDEO_EXTENSIONS.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  await walk(dir);
  return files;
}

async function submitFile(absolutePath) {
  try {
    const res = await fetch(`${API_BASE}/api/thumbnails/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ absolutePath }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { success: false, path: absolutePath, error: err };
    }

    const data = await res.json();
    return { success: true, path: absolutePath, jobId: data.jobId, deduplicated: data.deduplicated };
  } catch (error) {
    return { success: false, path: absolutePath, error: error.message };
  }
}

async function getQueueStats() {
  try {
    const res = await fetch(`${API_BASE}/api/jobs/stats/summary`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function getRecentJobs(limit = 8) {
  try {
    const res = await fetch(`${API_BASE}/api/jobs?status=processing,completed,failed&limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.jobs || [];
  } catch {
    return [];
  }
}

function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[H');
}

function moveCursor(x, y) {
  process.stdout.write(`\x1b[${y};${x}H`);
}

function progressBar(current, total, width = 40) {
  if (total === 0) total = 1;
  const percent = Math.min(100, Math.round((current / total) * 100));
  const filled = Math.round((current / total) * width);
  const empty = width - filled;

  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percent}% (${current}/${total})`;
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len - 3) + '...' : str;
}

async function displayLiveStats(startTime, totalSubmitted) {
  const stats = await getQueueStats();
  const jobs = await getRecentJobs();

  if (!stats) {
    console.log(`${colors.red}Unable to connect to server${colors.reset}`);
    return { done: false };
  }

  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const completed = stats.completed || 0;
  const pending = stats.pending || 0;
  const processing = stats.processing || 0;
  const failed = stats.failed || 0;
  const active = stats.active || 0;

  const total = totalSubmitted > 0 ? totalSubmitted : (pending + processing + completed + failed);

  // Calculate rate and ETA
  const rate = elapsed > 0 ? (completed / elapsed).toFixed(2) : '0.00';
  const remaining = pending + processing;
  const eta = parseFloat(rate) > 0 ? Math.ceil(remaining / parseFloat(rate)) : 0;

  clearScreen();

  // Header
  console.log(`${colors.bold}${colors.cyan}╔═══════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}║       ${colors.bgBlue}${colors.white} VideoVault Live Thumbnail Generator ${colors.reset}${colors.bold}${colors.cyan}                ║${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}╚═══════════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log();

  // Stats
  console.log(`${colors.bold}Queue Statistics:${colors.reset}`);
  console.log(`  ${colors.yellow}⏳ Pending:${colors.reset}     ${pending}`);
  console.log(`  ${colors.blue}⚙️  Processing:${colors.reset}  ${processing} ${colors.dim}(workers: ${active})${colors.reset}`);
  console.log(`  ${colors.green}✅ Completed:${colors.reset}   ${completed}`);
  console.log(`  ${colors.red}❌ Failed:${colors.reset}      ${failed}`);
  console.log();

  // Progress bar
  console.log(`${colors.bold}Overall Progress:${colors.reset}`);
  console.log(`  ${progressBar(completed, total)}`);
  console.log();

  // Performance
  console.log(`${colors.bold}Performance:${colors.reset}`);
  console.log(`  ⏱️  Elapsed:     ${formatDuration(elapsed)}`);
  console.log(`  🚀 Rate:        ${rate}/sec`);
  console.log(`  ⏰ ETA:         ${eta > 0 ? formatDuration(eta) : '--'}`);
  console.log();

  // Recent activity
  console.log(`${colors.bold}Recent Activity:${colors.reset}`);
  if (jobs.length === 0) {
    console.log(`  ${colors.dim}(no recent activity)${colors.reset}`);
  } else {
    for (const job of jobs.slice(0, 6)) {
      const statusIcon =
        job.status === 'completed' ? `${colors.green}✅${colors.reset}` :
        job.status === 'failed' ? `${colors.red}❌${colors.reset}` :
        job.status === 'processing' ? `${colors.blue}⚙️${colors.reset}` : `${colors.yellow}⏳${colors.reset}`;

      const name = job.relativePath || job.payload?.inputPath || job.id;
      const displayName = truncate(path.basename(name), 50);

      console.log(`  ${statusIcon} ${displayName}`);
    }
  }
  console.log();

  // Instructions
  console.log(`${colors.cyan}Press Ctrl+C to exit${colors.reset}`);

  // Check if done
  const isDone = pending === 0 && processing === 0 && completed > 0;
  if (isDone) {
    console.log();
    console.log(`${colors.green}${colors.bold}✨ All jobs completed!${colors.reset}`);
    console.log(`   Total: ${completed} thumbnails generated in ${formatDuration(elapsed)}`);
    if (failed > 0) {
      console.log(`   ${colors.red}${failed} jobs failed${colors.reset}`);
    }
  }

  return { done: isDone, stats };
}

async function submitFilesParallel(files, batchSize = 16) {
  let submitted = 0;
  let failed = 0;
  let deduplicated = 0;

  console.log(`${colors.bold}Submitting ${files.length} files (batch size: ${batchSize})...${colors.reset}`);
  console.log();

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(f => submitFile(f)));

    for (const r of results) {
      if (r.success) {
        submitted++;
        if (r.deduplicated) deduplicated++;
      } else {
        failed++;
      }
    }

    const progress = Math.min(100, Math.round(((i + batch.length) / files.length) * 100));
    process.stdout.write(`\r  Progress: ${progressBar(i + batch.length, files.length)} `);
  }

  console.log();
  console.log();
  console.log(`${colors.green}✅ Submitted: ${submitted}${colors.reset}`);
  if (deduplicated > 0) {
    console.log(`${colors.yellow}🔄 Deduplicated: ${deduplicated} (already in queue)${colors.reset}`);
  }
  if (failed > 0) {
    console.log(`${colors.red}❌ Failed to submit: ${failed}${colors.reset}`);
  }
  console.log();

  return submitted;
}

async function main() {
  if (!directory && !watchOnly) {
    console.log('Usage: node scripts/bulk-thumbnail-live.mjs <directory> [--concurrency=N]');
    console.log('       node scripts/bulk-thumbnail-live.mjs --watch');
    console.log();
    console.log('Examples:');
    console.log('  node scripts/bulk-thumbnail-live.mjs /media/videos');
    console.log('  node scripts/bulk-thumbnail-live.mjs /media/videos --concurrency=32');
    console.log('  node scripts/bulk-thumbnail-live.mjs --watch');
    process.exit(1);
  }

  const startTime = Date.now();
  let totalSubmitted = 0;

  if (!watchOnly) {
    // Check directory exists
    try {
      const stat = await fs.stat(directory);
      if (!stat.isDirectory()) {
        console.error(`${colors.red}Error: Not a directory: ${directory}${colors.reset}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`${colors.red}Error: Directory not found: ${directory}${colors.reset}`);
      process.exit(1);
    }

    console.log(`${colors.bold}Scanning directory: ${colors.cyan}${directory}${colors.reset}`);
    console.log();

    const files = await findVideoFiles(directory);

    if (files.length === 0) {
      console.log(`${colors.yellow}No video files found in ${directory}${colors.reset}`);
      process.exit(0);
    }

    console.log(`${colors.bold}Found ${files.length} video files${colors.reset}`);
    console.log();

    totalSubmitted = await submitFilesParallel(files, concurrency);
  }

  // Live monitoring loop
  console.log(`${colors.bold}Starting live monitor...${colors.reset}`);

  const interval = setInterval(async () => {
    const { done } = await displayLiveStats(startTime, totalSubmitted);
    if (done) {
      clearInterval(interval);
      process.exit(0);
    }
  }, 1000);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log();
    console.log(`${colors.yellow}Interrupted. Jobs will continue processing on the server.${colors.reset}`);
    process.exit(0);
  });
}

main().catch(err => {
  console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
  process.exit(1);
});
