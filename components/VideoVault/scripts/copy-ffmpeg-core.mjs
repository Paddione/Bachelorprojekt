import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcDir = path.resolve(root, 'node_modules', '@ffmpeg', 'core', 'dist', 'umd');
const destDir = path.resolve(root, 'client', 'public', 'ffmpeg');

if (!fs.existsSync(srcDir)) {
  console.error('ERROR: @ffmpeg/core/dist/umd not found at', srcDir);
  console.error('Run `npm install` to install @ffmpeg/core');
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });

const files = ['ffmpeg-core.js', 'ffmpeg-core.wasm'];
for (const file of files) {
  const src = path.resolve(srcDir, file);
  const dest = path.resolve(destDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${file} to client/public/ffmpeg/`);
  } else {
    console.warn(`WARNING: ${file} not found in ${srcDir}`);
  }
}

console.log('FFmpeg core files are ready in client/public/ffmpeg/');
