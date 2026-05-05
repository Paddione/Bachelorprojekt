#!/usr/bin/env node
// Regenerates website/src/lib/srgb-icc.ts from website/src/assets/sRGB.icc.
// Run after replacing the canonical .icc binary.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ICC = 'website/src/assets/sRGB.icc';
const OUT = 'website/src/lib/srgb-icc.ts';

const bytes = readFileSync(ICC);
const b64 = bytes.toString('base64');
const sha = createHash('sha256').update(bytes).digest('hex');
const wrapped = b64.match(/.{1,76}/g).map((l) => `  "${l}"`).join(',\n');

const out = `// AUTO-GENERATED from src/assets/sRGB.icc. Do not edit by hand.
// To regenerate: node scripts/build-srgb-icc.mjs
// Source SHA-256: ${sha}
//
// Inlined as base64 because Vite/Astro does not track readFileSync()-based
// asset reads, so importing from disk at runtime fails in the SSR bundle.

const SRGB_ICC_BASE64 = [
${wrapped},
].join("");

export const SRGB_ICC: Uint8Array = Uint8Array.from(Buffer.from(SRGB_ICC_BASE64, "base64"));
`;

writeFileSync(OUT, out);
console.log(`wrote ${OUT} (${bytes.length} bytes / ${b64.length} b64 chars, sha256=${sha.slice(0, 12)}…)`);
