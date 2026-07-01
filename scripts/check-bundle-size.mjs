#!/usr/bin/env node
/**
 * Bundle size checker for the website client JS.
 * Measures gzipped bundle size and compares against baseline.
 *
 * Usage:
 *   node scripts/check-bundle-size.mjs --update-baseline
 *   node scripts/check-bundle-size.mjs --check --fail
 *   node scripts/check-bundle-size.mjs --check --threshold=10
 */

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// Parse CLI arguments
const args = process.argv.slice(2);
const opts = {
  check: args.includes("--check"),
  updateBaseline: args.includes("--update-baseline"),
  fail: args.includes("--fail"),
  threshold: 5, // default 5%
  dir: path.join(ROOT, "website", "dist", "client"),
  baseline: path.join(ROOT, "website", "bundle-baseline.json"),
};

// Parse --threshold=N and --dir= and --baseline=
for (const arg of args) {
  if (arg.startsWith("--threshold=")) {
    opts.threshold = parseInt(arg.split("=")[1], 10);
  }
  if (arg.startsWith("--dir=")) {
    opts.dir = arg.split("=")[1];
  }
  if (arg.startsWith("--baseline=")) {
    opts.baseline = arg.split("=")[1];
  }
}

/**
 * Recursively collect all .js files in a directory
 */
function collectJsFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) {
    return files;
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Measure total gzipped size of JS files
 */
function measure(dir) {
  const jsFiles = collectJsFiles(dir);
  let totalGzipBytes = 0;
  for (const file of jsFiles) {
    const content = fs.readFileSync(file);
    const gzipped = zlib.gzipSync(content);
    totalGzipBytes += gzipped.length;
  }
  return {
    totalGzipBytes,
    fileCount: jsFiles.length,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Load baseline from file
 */
function loadBaseline() {
  if (!fs.existsSync(opts.baseline)) {
    return null;
  }
  try {
    const content = fs.readFileSync(opts.baseline, "utf8");
    return JSON.parse(content);
  } catch (e) {
    console.error(`Failed to load baseline from ${opts.baseline}:`, e.message);
    return null;
  }
}

/**
 * Main logic
 */
async function main() {
  if (opts.updateBaseline) {
    const measurement = measure(opts.dir);
    fs.writeFileSync(
      opts.baseline,
      JSON.stringify(measurement, null, 2) + "\n"
    );
    console.log(`✓ Baseline updated: ${opts.baseline}`);
    console.log(`  Total gzipped: ${measurement.totalGzipBytes} bytes`);
    console.log(`  File count: ${measurement.fileCount}`);
    process.exit(0);
  }

  if (opts.check) {
    const current = measure(opts.dir);
    const baseline = loadBaseline();

    if (!baseline) {
      console.error(
        `✗ No baseline found at ${opts.baseline}. Run with --update-baseline first.`
      );
      if (opts.fail) {
        process.exit(1);
      }
      process.exit(0);
    }

    const delta = current.totalGzipBytes - baseline.totalGzipBytes;
    const deltaPercent = (delta / baseline.totalGzipBytes) * 100;

    console.log(`Bundle size check:`);
    console.log(`  Baseline:   ${baseline.totalGzipBytes} bytes`);
    console.log(`  Current:    ${current.totalGzipBytes} bytes`);
    console.log(
      `  Delta:      ${delta} bytes (${deltaPercent.toFixed(2)}%)`
    );
    console.log(`  Threshold:  ${opts.threshold}%`);

    if (deltaPercent > opts.threshold) {
      console.error(
        `✗ Bundle size increased by ${deltaPercent.toFixed(2)}% (threshold: ${opts.threshold}%)`
      );
      if (opts.fail) {
        process.exit(1);
      }
      process.exit(0);
    }

    console.log(`✓ Bundle size OK`);
    process.exit(0);
  }

  // Default: just measure
  const measurement = measure(opts.dir);
  console.log(measurement);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
