#!/usr/bin/env node
// One-shot: parse Portfolio.html and write each asset to disk.
// Run with HANDOFF=/path/to/design_handoff_artlibrary node extract-from-handoff.mjs
//
// NOTE: Portfolio.html uses React JSX files to render SVGs at runtime — there are
// no inline SVGs in the HTML. This script reads the JSX source files directly and
// generates static SVGs by substituting palette values.

import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HANDOFF = process.env.HANDOFF ?? '/mnt/c/Users/PatrickKorczewski/Downloads/Assets_korczewski/design_handoff_artlibrary';

const here = dirname(fileURLToPath(import.meta.url));
const OUT  = resolve(here, '..', 'sets', 'korczewski');

function dump(outRel, svg) {
  const full = join(OUT, outRel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, svg + '\n', 'utf8');
  console.log('write', outRel);
}

// ============================================================
// CHARACTER PALETTES (from characters.jsx CHARACTERS array)
// ============================================================
const palettes = {
  elara: {
    skin: "#F2D2B8", skin2: "#D9A37E", hair: "#C0341D", hair2: "#7A1A0E",
    dress: "#3D8A4F", dress2: "#22542F", trim: "#C8F76A", eye: "#2A3A0C"
  },
  korrin: {
    skin: "#C8966E", skin2: "#9A6E4A", robe: "#3A3148", robe2: "#221932",
    trim: "#D8AE5A", inner: "#5BD4D0", eye: "#1A1326"
  },
  vex: {
    skin: "#E8C5A3", skin2: "#B98A65", hat: "#15101F", hat2: "#0A0710",
    coat: "#5C2E2A", coat2: "#341614", mask: "#0F0B18", trim: "#C8F76A", eye: "#C8F76A"
  },
  brann: {
    armor: "#6B7480", armor2: "#3C434C", armor3: "#A8B0BB",
    beard: "#C26A2A", beard2: "#7A3A14", horn: "#E8DCC0", horn2: "#9A8A66",
    inner: "#E26B6B", trim: "#C8F76A"
  }
};

// ============================================================
// PORTRAIT SVGs (240x300) — from characters.jsx
// ============================================================

function portraitElara(p) {
  return `<svg viewBox="0 0 240 300" xmlns="http://www.w3.org/2000/svg" class="ch-portrait">
  <defs>
    <radialGradient id="elara-bg" cx="50%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#22542F" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#0F0B18" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="elara-hair" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${p.hair}"/>
      <stop offset="100%" stop-color="${p.hair2}"/>
    </linearGradient>
    <linearGradient id="elara-dress" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${p.dress}"/>
      <stop offset="100%" stop-color="${p.dress2}"/>
    </linearGradient>
  </defs>
  <rect width="240" height="300" fill="url(#elara-bg)"/>
  <path d="M50,120 Q40,180 60,260 Q90,290 120,290 Q150,290 180,260 Q200,180 190,120 Q170,90 120,90 Q70,90 50,120 Z" fill="url(#elara-hair)" opacity="0.95"/>
  <path d="M40,300 Q40,230 80,210 L160,210 Q200,230 200,300 Z" fill="url(#elara-dress)"/>
  <path d="M80,212 Q120,205 160,212 L155,222 Q120,215 85,222 Z" fill="${p.trim}" opacity="0.55"/>
  <path d="M120,215 L120,260" stroke="${p.trim}" stroke-width="1" opacity="0.5"/>
  <path d="M114,222 L126,222" stroke="${p.trim}" stroke-width="0.8" opacity="0.5"/>
  <path d="M114,232 L126,232" stroke="${p.trim}" stroke-width="0.8" opacity="0.5"/>
  <path d="M114,242 L126,242" stroke="${p.trim}" stroke-width="0.8" opacity="0.5"/>
  <path d="M114,252 L126,252" stroke="${p.trim}" stroke-width="0.8" opacity="0.5"/>
  <rect x="108" y="170" width="24" height="50" fill="${p.skin}"/>
  <path d="M108,200 Q120,210 132,200 L132,220 L108,220 Z" fill="${p.skin2}" opacity="0.5"/>
  <ellipse cx="120" cy="150" rx="38" ry="46" fill="${p.skin}"/>
  <path d="M82,130 Q90,108 120,108 Q150,108 158,130 Q150,118 130,116 Q120,124 110,116 Q90,118 82,130 Z" fill="url(#elara-hair)"/>
  <path d="M82,130 Q78,160 84,200 Q70,180 70,150 Q72,135 82,130 Z" fill="url(#elara-hair)"/>
  <path d="M158,130 Q162,160 156,200 Q170,180 170,150 Q168,135 158,130 Z" fill="url(#elara-hair)"/>
  <path d="M88,140 Q92,200 102,235" stroke="${p.hair2}" stroke-width="3" fill="none" opacity="0.9" stroke-linecap="round"/>
  <path d="M152,140 Q148,200 138,235" stroke="${p.hair2}" stroke-width="3" fill="none" opacity="0.9" stroke-linecap="round"/>
  <ellipse cx="100" cy="165" rx="6" ry="3" fill="${p.skin2}" opacity="0.35"/>
  <ellipse cx="140" cy="165" rx="6" ry="3" fill="${p.skin2}" opacity="0.35"/>
  <ellipse cx="106" cy="152" rx="3.2" ry="2.2" fill="${p.eye}"/>
  <ellipse cx="134" cy="152" rx="3.2" ry="2.2" fill="${p.eye}"/>
  <circle cx="107" cy="151" r="0.8" fill="#fff"/>
  <circle cx="135" cy="151" r="0.8" fill="#fff"/>
  <path d="M100,144 Q106,142 112,145" stroke="${p.hair2}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  <path d="M128,145 Q134,142 140,144" stroke="${p.hair2}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  <path d="M120,158 Q118,170 122,176" stroke="${p.skin2}" stroke-width="1" fill="none" opacity="0.6"/>
  <path d="M114,184 Q120,186 126,184" stroke="#9A2A1E" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  <path d="M115,184 Q120,182 125,184" fill="#B83A2A" opacity="0.7"/>
  <g transform="translate(150,116)">
    <path d="M0,0 Q4,-6 10,-8" stroke="${p.trim}" stroke-width="1.2" fill="none"/>
    <circle cx="3" cy="-3" r="1.5" fill="${p.trim}"/>
    <circle cx="7" cy="-6" r="1.5" fill="${p.trim}"/>
  </g>
</svg>`;
}

function portraitKorrin(p) {
  return `<svg viewBox="0 0 240 300" xmlns="http://www.w3.org/2000/svg" class="ch-portrait">
  <defs>
    <radialGradient id="korrin-bg" cx="50%" cy="35%" r="70%">
      <stop offset="0%" stop-color="${p.inner}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#0F0B18" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="korrin-robe" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${p.robe}"/>
      <stop offset="100%" stop-color="${p.robe2}"/>
    </linearGradient>
  </defs>
  <rect width="240" height="300" fill="url(#korrin-bg)"/>
  <path d="M40,300 Q30,200 60,150 Q120,110 180,150 Q210,200 200,300 Z" fill="url(#korrin-robe)"/>
  <ellipse cx="120" cy="155" rx="62" ry="20" fill="${p.robe2}" opacity="0.7"/>
  <ellipse cx="120" cy="148" rx="44" ry="50" fill="${p.skin}"/>
  <ellipse cx="120" cy="120" rx="40" ry="16" fill="${p.skin2}" opacity="0.3"/>
  <path d="M68,140 Q120,118 172,140 Q172,128 120,108 Q68,128 68,140 Z" fill="${p.robe}" opacity="0.95"/>
  <path d="M68,138 Q120,120 172,138" stroke="${p.trim}" stroke-width="1" fill="none" opacity="0.7"/>
  <ellipse cx="78" cy="155" rx="5" ry="9" fill="${p.skin2}"/>
  <ellipse cx="162" cy="155" rx="5" ry="9" fill="${p.skin2}"/>
  <ellipse cx="96" cy="170" rx="8" ry="4" fill="${p.skin2}" opacity="0.4"/>
  <ellipse cx="144" cy="170" rx="8" ry="4" fill="${p.skin2}" opacity="0.4"/>
  <path d="M98,158 Q106,162 114,158" stroke="${p.eye}" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M126,158 Q134,162 142,158" stroke="${p.eye}" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M96,150 L114,148" stroke="${p.skin2}" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M126,148 L144,150" stroke="${p.skin2}" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M120,164 Q118,180 122,186" stroke="${p.skin2}" stroke-width="1" fill="none" opacity="0.6"/>
  <path d="M112,196 Q120,198 128,196" stroke="${p.skin2}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  <circle cx="120" cy="138" r="3" fill="${p.inner}" opacity="0.85"/>
  <g transform="translate(120,250)">
    <path d="M-8,-6 Q-8,-12 0,-12 Q8,-12 8,-6 L10,2 L-10,2 Z" fill="${p.trim}"/>
    <rect x="-2" y="2" width="4" height="3" fill="${p.trim}"/>
    <line x1="0" y1="-22" x2="0" y2="-12" stroke="${p.skin2}" stroke-width="0.8"/>
  </g>
  <path d="M120,230 L120,300" stroke="${p.robe2}" stroke-width="1.5" opacity="0.8"/>
</svg>`;
}

function portraitVex(p) {
  return `<svg viewBox="0 0 240 300" xmlns="http://www.w3.org/2000/svg" class="ch-portrait">
  <defs>
    <radialGradient id="vex-bg" cx="50%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#5C2E2A" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#0F0B18" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="vex-coat" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${p.coat}"/>
      <stop offset="100%" stop-color="${p.coat2}"/>
    </linearGradient>
    <linearGradient id="vex-hat" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${p.hat}"/>
      <stop offset="100%" stop-color="${p.hat2}"/>
    </linearGradient>
  </defs>
  <rect width="240" height="300" fill="url(#vex-bg)"/>
  <path d="M50,300 Q60,225 90,210 L150,210 Q180,225 190,300 Z" fill="url(#vex-coat)"/>
  <path d="M90,210 L120,250 L150,210 L142,210 L120,238 L98,210 Z" fill="${p.coat2}"/>
  <path d="M100,212 Q120,200 140,212 L140,220 Q120,210 100,220 Z" fill="${p.coat2}"/>
  <rect x="112" y="180" width="16" height="30" fill="${p.skin}"/>
  <ellipse cx="120" cy="160" rx="30" ry="40" fill="${p.skin}"/>
  <path d="M92,150 Q88,180 96,210 Q104,225 110,235" stroke="${p.hat}" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path d="M88,142 Q120,134 152,142 L154,162 Q140,168 120,168 Q100,168 86,162 Z" fill="${p.mask}"/>
  <ellipse cx="106" cy="154" rx="5" ry="3" fill="${p.skin}"/>
  <ellipse cx="134" cy="154" rx="5" ry="3" fill="${p.skin}"/>
  <circle cx="106" cy="154" r="2" fill="${p.eye}"/>
  <circle cx="134" cy="154" r="2" fill="${p.eye}"/>
  <path d="M88,142 Q120,134 152,142" stroke="${p.trim}" stroke-width="0.7" fill="none" opacity="0.5"/>
  <path d="M40,118 Q50,80 120,72 Q190,80 200,118 Q170,108 120,108 Q70,108 40,118 Z" fill="url(#vex-hat)"/>
  <path d="M40,118 L46,100 L60,118 Z" fill="${p.hat2}"/>
  <path d="M200,118 L194,100 L180,118 Z" fill="${p.hat2}"/>
  <path d="M120,72 L114,86 L126,86 Z" fill="${p.hat2}"/>
  <path d="M62,118 Q120,108 178,118 L178,124 Q120,114 62,124 Z" fill="${p.hat2}"/>
  <path d="M168,108 Q190,80 200,82" stroke="${p.trim}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  <path d="M170,104 Q185,90 195,86" stroke="${p.trim}" stroke-width="1" fill="none" stroke-linecap="round"/>
  <path d="M114,188 Q120,192 128,186" stroke="${p.coat2}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  <ellipse cx="120" cy="196" rx="14" ry="4" fill="${p.skin2}" opacity="0.3"/>
</svg>`;
}

function portraitBrann(p) {
  // beard texture lines
  const beardLines = Array.from({length: 8}).map((_, i) => {
    const bx = 92 + i * 7;
    const by = 198 + (i % 3) * 4;
    return `<path d="M${bx},${by} Q${bx},220 ${bx + 2},240" stroke="${p.beard2}" stroke-width="0.6" fill="none" opacity="0.5"/>`;
  }).join('\n  ');
  // pauldron rivets
  const rivetsL = [0,1,2,3].map(i => `<circle cx="${28+i*8}" cy="${232+i*2}" r="1.5" fill="${p.armor2}"/>`).join('\n  ');
  const rivetsR = [0,1,2,3].map(i => `<circle cx="${184+i*8}" cy="${232-i*2}" r="1.5" fill="${p.armor2}"/>`).join('\n  ');
  return `<svg viewBox="0 0 240 300" xmlns="http://www.w3.org/2000/svg" class="ch-portrait">
  <defs>
    <radialGradient id="brann-bg" cx="50%" cy="35%" r="70%">
      <stop offset="0%" stop-color="${p.inner}" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#0F0B18" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="brann-armor" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${p.armor3}"/>
      <stop offset="50%" stop-color="${p.armor}"/>
      <stop offset="100%" stop-color="${p.armor2}"/>
    </linearGradient>
    <linearGradient id="brann-beard" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${p.beard}"/>
      <stop offset="100%" stop-color="${p.beard2}"/>
    </linearGradient>
    <linearGradient id="brann-horn" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${p.horn}"/>
      <stop offset="100%" stop-color="${p.horn2}"/>
    </linearGradient>
  </defs>
  <rect width="240" height="300" fill="url(#brann-bg)"/>
  <ellipse cx="50" cy="240" rx="40" ry="38" fill="url(#brann-armor)"/>
  <ellipse cx="190" cy="240" rx="40" ry="38" fill="url(#brann-armor)"/>
  ${rivetsL}
  ${rivetsR}
  <path d="M70,260 Q70,220 120,210 Q170,220 170,260 L170,300 L70,300 Z" fill="url(#brann-armor)"/>
  <path d="M120,240 L114,254 L106,254 L114,262 L110,276 L120,268 L130,276 L126,262 L134,254 L126,254 Z" fill="${p.inner}"/>
  <path d="M76,160 Q80,120 120,108 Q160,120 164,160 L164,180 L76,180 Z" fill="url(#brann-armor)"/>
  <path d="M120,108 L120,180" stroke="${p.armor2}" stroke-width="2" opacity="0.7"/>
  <rect x="86" y="146" width="68" height="8" rx="2" fill="${p.armor2}"/>
  <circle cx="104" cy="150" r="2" fill="${p.inner}"/>
  <circle cx="136" cy="150" r="2" fill="${p.inner}"/>
  <path d="M76,156 Q40,130 30,90 Q40,110 50,128 Q60,140 76,148 Z" fill="url(#brann-horn)"/>
  <path d="M164,156 Q200,130 210,90 Q200,110 190,128 Q180,140 164,148 Z" fill="url(#brann-horn)"/>
  <path d="M68,148 Q50,130 40,108" stroke="${p.horn2}" stroke-width="0.8" fill="none" opacity="0.7"/>
  <path d="M172,148 Q190,130 200,108" stroke="${p.horn2}" stroke-width="0.8" fill="none" opacity="0.7"/>
  <path d="M86,180 Q100,200 96,250 Q108,240 110,260 Q120,250 130,260 Q132,240 144,250 Q140,200 154,180 Z" fill="url(#brann-beard)"/>
  <ellipse cx="105" cy="232" rx="6" ry="2" fill="${p.armor3}"/>
  <ellipse cx="135" cy="232" rx="6" ry="2" fill="${p.armor3}"/>
  <ellipse cx="105" cy="248" rx="5" ry="1.5" fill="${p.beard2}"/>
  <ellipse cx="135" cy="248" rx="5" ry="1.5" fill="${p.beard2}"/>
  ${beardLines}
</svg>`;
}

// ============================================================
// FIGURINE SVGs (120x200) — from characters.jsx
// ============================================================

function figurineElara(p) {
  return `<svg viewBox="0 0 120 200" xmlns="http://www.w3.org/2000/svg" class="ch-figurine">
  <defs>
    <radialGradient id="fig-shadow-e" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#000" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="figelara-dress" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="${p.dress2}"/>
      <stop offset="50%" stop-color="${p.dress}"/>
      <stop offset="100%" stop-color="${p.dress2}"/>
    </linearGradient>
    <linearGradient id="figelara-hair" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="${p.hair2}"/>
      <stop offset="50%" stop-color="${p.hair}"/>
      <stop offset="100%" stop-color="${p.hair2}"/>
    </linearGradient>
  </defs>
  <ellipse cx="60" cy="192" rx="32" ry="6" fill="url(#fig-shadow-e)"/>
  <path d="M40,170 Q34,130 50,110 L70,110 Q86,130 80,170 Z" fill="url(#figelara-dress)"/>
  <path d="M40,170 Q60,166 80,170 L78,176 Q60,172 42,176 Z" fill="${p.trim}" opacity="0.7"/>
  <path d="M60,114 L60,150" stroke="${p.trim}" stroke-width="0.6" opacity="0.6"/>
  <path d="M48,114 Q60,108 72,114 L70,124 Q60,118 50,124 Z" fill="${p.dress}" opacity="0.7"/>
  <ellipse cx="60" cy="100" rx="14" ry="6" fill="${p.skin}"/>
  <rect x="56" y="92" width="8" height="12" fill="${p.skin}"/>
  <path d="M44,80 Q40,140 50,160 L62,158 Q50,140 50,80 Z" fill="url(#figelara-hair)"/>
  <path d="M76,80 Q80,140 70,160 L58,158 Q70,140 70,80 Z" fill="url(#figelara-hair)"/>
  <ellipse cx="60" cy="78" rx="14" ry="16" fill="${p.skin}"/>
  <path d="M46,76 Q50,62 60,60 Q70,62 74,76 Q70,68 60,68 Q50,68 46,76 Z" fill="url(#figelara-hair)"/>
  <circle cx="55" cy="80" r="0.9" fill="${p.eye}"/>
  <circle cx="65" cy="80" r="0.9" fill="${p.eye}"/>
  <path d="M57,86 Q60,87 63,86" stroke="#9A2A1E" stroke-width="0.7" fill="none" stroke-linecap="round"/>
  <path d="M44,120 Q42,150 46,168" stroke="${p.dress2}" stroke-width="2" fill="none" opacity="0.6"/>
</svg>`;
}

function figurineKorrin(p) {
  return `<svg viewBox="0 0 120 200" xmlns="http://www.w3.org/2000/svg" class="ch-figurine">
  <defs>
    <radialGradient id="fig-shadow-k" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#000" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="figkorrin-robe" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="${p.robe2}"/>
      <stop offset="50%" stop-color="${p.robe}"/>
      <stop offset="100%" stop-color="${p.robe2}"/>
    </linearGradient>
  </defs>
  <ellipse cx="60" cy="192" rx="32" ry="6" fill="url(#fig-shadow-k)"/>
  <path d="M34,170 Q30,120 50,90 L70,90 Q90,120 86,170 Z" fill="url(#figkorrin-robe)"/>
  <path d="M60,94 L60,170" stroke="${p.robe2}" stroke-width="1" opacity="0.8"/>
  <path d="M40,100 Q50,76 60,72 Q70,76 80,100 Q70,90 60,90 Q50,90 40,100 Z" fill="${p.robe2}"/>
  <g transform="translate(60,140)">
    <path d="M-3,-2 Q-3,-5 0,-5 Q3,-5 3,-2 L4,1 L-4,1 Z" fill="${p.trim}"/>
    <rect x="-1" y="1" width="2" height="1.5" fill="${p.trim}"/>
  </g>
  <circle cx="60" cy="110" r="3" fill="${p.inner}" opacity="0.6"/>
  <ellipse cx="60" cy="76" rx="12" ry="13" fill="${p.skin}"/>
  <path d="M48,80 Q60,72 72,80 Q72,68 60,64 Q48,68 48,80 Z" fill="${p.robe2}" opacity="0.6"/>
  <path d="M55,80 Q57,82 59,80" stroke="${p.eye}" stroke-width="0.8" fill="none"/>
  <path d="M61,80 Q63,82 65,80" stroke="${p.eye}" stroke-width="0.8" fill="none"/>
  <circle cx="60" cy="74" r="1" fill="${p.inner}"/>
</svg>`;
}

function figurineVex(p) {
  return `<svg viewBox="0 0 120 200" xmlns="http://www.w3.org/2000/svg" class="ch-figurine">
  <defs>
    <radialGradient id="fig-shadow-v" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#000" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="figvex-coat" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="${p.coat2}"/>
      <stop offset="50%" stop-color="${p.coat}"/>
      <stop offset="100%" stop-color="${p.coat2}"/>
    </linearGradient>
  </defs>
  <ellipse cx="60" cy="192" rx="32" ry="6" fill="url(#fig-shadow-v)"/>
  <path d="M42,170 Q40,120 50,98 L70,98 Q80,120 78,170 Z" fill="url(#figvex-coat)"/>
  <path d="M50,98 L60,140 L70,98 L66,98 L60,128 L54,98 Z" fill="${p.coat2}"/>
  <rect x="44" y="140" width="32" height="3" fill="${p.hat2}"/>
  <rect x="58" y="139" width="4" height="5" fill="${p.trim}"/>
  <ellipse cx="60" cy="96" rx="11" ry="4" fill="${p.coat}"/>
  <rect x="57" y="86" width="6" height="12" fill="${p.skin}"/>
  <ellipse cx="60" cy="74" rx="11" ry="12" fill="${p.skin}"/>
  <path d="M50,72 Q60,68 70,72 L70,80 Q60,82 50,80 Z" fill="${p.mask}"/>
  <circle cx="56" cy="76" r="0.9" fill="${p.eye}"/>
  <circle cx="64" cy="76" r="0.9" fill="${p.eye}"/>
  <path d="M38,68 Q44,52 60,50 Q76,52 82,68 Q70,62 60,62 Q50,62 38,68 Z" fill="${p.hat}"/>
  <path d="M38,68 L42,58 L48,68 Z" fill="${p.hat2}"/>
  <path d="M82,68 L78,58 L72,68 Z" fill="${p.hat2}"/>
  <path d="M60,50 L57,57 L63,57 Z" fill="${p.hat2}"/>
  <path d="M74,58 Q82,46 86,46" stroke="${p.trim}" stroke-width="1" fill="none" stroke-linecap="round"/>
</svg>`;
}

function figurineBrann(p) {
  return `<svg viewBox="0 0 120 200" xmlns="http://www.w3.org/2000/svg" class="ch-figurine">
  <defs>
    <radialGradient id="fig-shadow-b" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#000" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="figbrann-armor" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="${p.armor2}"/>
      <stop offset="50%" stop-color="${p.armor3}"/>
      <stop offset="100%" stop-color="${p.armor2}"/>
    </linearGradient>
    <linearGradient id="figbrann-beard" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="${p.beard2}"/>
      <stop offset="50%" stop-color="${p.beard}"/>
      <stop offset="100%" stop-color="${p.beard2}"/>
    </linearGradient>
  </defs>
  <ellipse cx="60" cy="192" rx="32" ry="6" fill="url(#fig-shadow-b)"/>
  <path d="M32,170 Q28,130 42,108 L78,108 Q92,130 88,170 Z" fill="url(#figbrann-armor)"/>
  <rect x="32" y="140" width="56" height="5" fill="${p.armor2}"/>
  <rect x="58" y="139" width="4" height="7" fill="${p.beard}"/>
  <path d="M60,124 L56,132 L52,132 L57,138 L54,148 L60,144 L66,148 L63,138 L68,132 L64,132 Z" fill="${p.inner}"/>
  <ellipse cx="36" cy="112" rx="14" ry="11" fill="url(#figbrann-armor)"/>
  <ellipse cx="84" cy="112" rx="14" ry="11" fill="url(#figbrann-armor)"/>
  <path d="M48,98 Q54,120 52,140 Q58,134 60,142 Q62,134 68,140 Q66,120 72,98 Z" fill="url(#figbrann-beard)"/>
  <ellipse cx="55" cy="128" rx="3" ry="1" fill="${p.armor3}"/>
  <ellipse cx="65" cy="128" rx="3" ry="1" fill="${p.armor3}"/>
  <path d="M46,90 Q48,72 60,68 Q72,72 74,90 L74,98 L46,98 Z" fill="url(#figbrann-armor)"/>
  <path d="M60,68 L60,98" stroke="${p.armor2}" stroke-width="1"/>
  <rect x="50" y="84" width="20" height="3" rx="1" fill="${p.armor2}"/>
  <circle cx="55" cy="85.5" r="0.8" fill="${p.inner}"/>
  <circle cx="65" cy="85.5" r="0.8" fill="${p.inner}"/>
  <path d="M46,86 Q30,76 24,60 Q30,72 36,80 Q42,84 46,86 Z" fill="${p.horn}"/>
  <path d="M74,86 Q90,76 96,60 Q90,72 84,80 Q78,84 74,86 Z" fill="${p.horn}"/>
</svg>`;
}

// ============================================================
// PROP SVGs — from assets.jsx
// ============================================================

const props = {
  chest: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <path d="M10,30 L54,30 L54,54 L10,54 Z" fill="#7A4A22"/>
  <path d="M10,30 Q10,18 32,16 Q54,18 54,30 Z" fill="#9A5A2A"/>
  <rect x="10" y="36" width="44" height="3" fill="#3C2310"/>
  <rect x="28" y="30" width="8" height="14" fill="#C8B068"/>
  <circle cx="32" cy="38" r="1.5" fill="#3C2310"/>
  <ellipse cx="32" cy="58" rx="22" ry="2" fill="#000" opacity="0.4"/>
</svg>`,

  torch: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <path d="M28,38 L36,38 L34,58 L30,58 Z" fill="#5A3618"/>
  <ellipse cx="32" cy="36" rx="6" ry="3" fill="#3C2310"/>
  <path d="M28,36 Q24,22 32,12 Q40,22 36,36 Q34,28 32,32 Q30,28 28,36 Z" fill="#FFB347"/>
  <path d="M30,32 Q28,22 32,16 Q36,22 34,32 Q33,26 32,28 Q31,26 30,32 Z" fill="#FFE066"/>
  <ellipse cx="32" cy="60" rx="14" ry="2" fill="#000" opacity="0.4"/>
</svg>`,

  potion: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <path d="M26,18 L38,18 L38,28 Q46,32 46,42 Q46,54 32,54 Q18,54 18,42 Q18,32 26,28 Z" fill="#5BD4D0" opacity="0.85"/>
  <path d="M22,42 Q22,32 32,32 Q42,32 42,42" fill="none" stroke="#fff" stroke-width="1" opacity="0.4"/>
  <rect x="24" y="14" width="16" height="6" fill="#3A2E52"/>
  <rect x="22" y="12" width="20" height="4" fill="#221932"/>
  <ellipse cx="32" cy="58" rx="14" ry="2" fill="#000" opacity="0.4"/>
</svg>`,

  key: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="20" cy="32" r="10" fill="none" stroke="#C8B068" stroke-width="3"/>
  <circle cx="20" cy="32" r="3" fill="#0F0B18"/>
  <rect x="28" y="30" width="22" height="4" fill="#C8B068"/>
  <rect x="42" y="34" width="3" height="6" fill="#C8B068"/>
  <rect x="48" y="34" width="3" height="6" fill="#C8B068"/>
  <ellipse cx="32" cy="58" rx="20" ry="1.5" fill="#000" opacity="0.4"/>
</svg>`,

  scroll: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <rect x="14" y="22" width="36" height="22" fill="#EDE6D8"/>
  <line x1="20" y1="28" x2="44" y2="28" stroke="#6B8B1F" stroke-width="0.6"/>
  <line x1="20" y1="32" x2="44" y2="32" stroke="#6B8B1F" stroke-width="0.6"/>
  <line x1="20" y1="36" x2="38" y2="36" stroke="#6B8B1F" stroke-width="0.6"/>
  <ellipse cx="14" cy="33" rx="4" ry="11" fill="#D2C9B6"/>
  <ellipse cx="50" cy="33" rx="4" ry="11" fill="#D2C9B6"/>
  <ellipse cx="32" cy="58" rx="22" ry="2" fill="#000" opacity="0.4"/>
</svg>`,

  coin: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="32" cy="34" rx="14" ry="14" fill="#C8B068"/>
  <ellipse cx="32" cy="32" rx="14" ry="14" fill="#E8C870"/>
  <text x="32" y="38" text-anchor="middle" font-family="serif" font-size="14" fill="#7A5818" font-style="italic">K</text>
  <ellipse cx="32" cy="58" rx="14" ry="1.5" fill="#000" opacity="0.4"/>
</svg>`
};

// ============================================================
// TERRAIN SVGs (120x80) — from assets.jsx
// ============================================================

function terrainForest() {
  const trees = Array.from({length: 14}).map((_, i) => {
    const x = (i * 9 + (i % 2) * 4) % 120;
    const y = (i * 13) % 64 + 12;
    return `<g transform="translate(${x},${y})">
      <path d="M0,8 L4,-2 L8,8 Z" fill="#3D8A4F"/>
      <path d="M2,4 L4,-4 L6,4 Z" fill="#5BA862"/>
      <rect x="3" y="8" width="2" height="3" fill="#5A3618"/>
    </g>`;
  }).join('\n  ');
  return `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <rect width="120" height="80" fill="#22542F"/>
  ${trees}
</svg>`;
}

function terrainStone() {
  const stones = Array.from({length: 8}).map((_, i) =>
    `<ellipse cx="${(i*17+8)%120}" cy="${(i*11+12)%70}" rx="${6+(i%3)}" ry="${4+(i%2)}" fill="#6B7480" opacity="0.7"/>`
  ).join('\n  ');
  const highlights = Array.from({length: 6}).map((_, i) =>
    `<ellipse cx="${(i*22+12)%120}" cy="${(i*17+10)%70}" rx="3" ry="2" fill="#A8B0BB" opacity="0.4"/>`
  ).join('\n  ');
  return `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <rect width="120" height="80" fill="#3C434C"/>
  ${stones}
  ${highlights}
</svg>`;
}

function terrainWater() {
  const waves = Array.from({length: 5}).map((_, i) =>
    `<path d="M0,${10+i*16} Q30,${6+i*16} 60,${10+i*16} T120,${10+i*16}" stroke="#5BD4D0" stroke-width="1" fill="none" opacity="${(0.5 - i*0.06).toFixed(2)}"/>`
  ).join('\n  ');
  const bubbles = Array.from({length: 8}).map((_, i) =>
    `<circle cx="${(i*15+5)%120}" cy="${(i*9+15)%72}" r="1" fill="#82E2DF" opacity="0.7"/>`
  ).join('\n  ');
  return `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <rect width="120" height="80" fill="#1E4A5C"/>
  ${waves}
  ${bubbles}
</svg>`;
}

function terrainWood() {
  const planks = [0,16,32,48,64].map(y => `<g>
    <line x1="0" y1="${y}" x2="120" y2="${y}" stroke="#3C2310" stroke-width="1"/>
    <path d="M0,${y+8} Q60,${y+5} 120,${y+8}" stroke="#7A4A22" stroke-width="0.6" fill="none" opacity="0.6"/>
    <circle cx="${(y*3)%110+5}" cy="${y+8}" r="1" fill="#3C2310"/>
    <circle cx="${(y*3)%110+90}" cy="${y+8}" r="1" fill="#3C2310"/>
  </g>`).join('\n  ');
  return `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <rect width="120" height="80" fill="#5A3618"/>
  ${planks}
</svg>`;
}

function terrainSnow() {
  const dots = Array.from({length: 14}).map((_, i) =>
    `<circle cx="${(i*9+3)%120}" cy="${(i*7+5)%75}" r="1.5" fill="#fff" opacity="0.9"/>`
  ).join('\n  ');
  const drifts = [0,1,2].map(i =>
    `<path d="M${i*45+10},${50+i*8} Q${i*45+30},${44+i*8} ${i*45+50},${50+i*8}" stroke="#fff" stroke-width="2" fill="none" opacity="0.7"/>`
  ).join('\n  ');
  return `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="snow-g" x1="0" x2="0" y1="0" y2="1">
    <stop offset="0%" stop-color="#E8EEF2"/><stop offset="100%" stop-color="#A8B6C0"/>
  </linearGradient></defs>
  <rect width="120" height="80" fill="url(#snow-g)"/>
  ${dots}
  ${drifts}
</svg>`;
}

function terrainSand() {
  const ripples = Array.from({length: 4}).map((_, i) =>
    `<path d="M0,${20+i*15} Q60,${15+i*15} 120,${22+i*15}" stroke="#9A7E3C" stroke-width="0.7" fill="none" opacity="0.7"/>`
  ).join('\n  ');
  const grains = Array.from({length: 30}).map((_, i) =>
    `<circle cx="${(i*7+3)%120}" cy="${(i*11+4)%76}" r="0.6" fill="#7A5818" opacity="0.5"/>`
  ).join('\n  ');
  return `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="sand-g" x1="0" x2="0" y1="0" y2="1">
    <stop offset="0%" stop-color="#E8C878"/><stop offset="100%" stop-color="#B89A58"/>
  </linearGradient></defs>
  <rect width="120" height="80" fill="url(#sand-g)"/>
  ${ripples}
  ${grains}
</svg>`;
}

// ============================================================
// LOGO SVGs — from assets.jsx
// ============================================================

const logoAppIcon = `<svg width="160" height="160" viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg1" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#1a1a2e"/>
      <stop offset="100%" stop-color="#0c0c18"/>
    </radialGradient>
    <radialGradient id="core1" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#d4ff6e"/>
      <stop offset="40%" stop-color="#a8e040"/>
      <stop offset="100%" stop-color="#4a8010" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow1">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="softglow">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <clipPath id="rounded1">
      <rect width="160" height="160" rx="36" ry="36"/>
    </clipPath>
  </defs>
  <g clip-path="url(#rounded1)">
    <rect width="160" height="160" fill="url(#bg1)"/>
    <g transform="translate(62, 82)" fill="none" stroke="#b8ff4a" stroke-width="0.5">
      <circle r="20" opacity="0.25"/>
      <circle r="36" opacity="0.15"/>
      <circle r="52" opacity="0.10"/>
      <circle r="68" opacity="0.06"/>
    </g>
    <circle cx="62" cy="82" r="38" fill="#6aaa00" opacity="0.12" filter="url(#softglow)"/>
    <line x1="62" y1="82" x2="108" y2="34" stroke="#c8f050" stroke-width="9" stroke-linecap="round" filter="url(#glow1)" opacity="0.95"/>
    <line x1="62" y1="82" x2="108" y2="130" stroke="#c8f050" stroke-width="9" stroke-linecap="round" filter="url(#glow1)" opacity="0.95"/>
    <line x1="30" y1="30" x2="30" y2="134" stroke="#c8f050" stroke-width="9" stroke-linecap="round" filter="url(#glow1)" opacity="0.85"/>
    <circle cx="62" cy="82" r="10" fill="url(#core1)" class="core-glow" filter="url(#softglow)"/>
    <circle cx="62" cy="82" r="5" fill="#eeff88" filter="url(#glow1)"/>
  </g>
  <style>
    @keyframes glow-core { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
    .core-glow { animation: glow-core 2s ease-in-out infinite; }
  </style>
</svg>`;

const logoRadarPulse = `<svg width="160" height="160" viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg2" cx="45%" cy="52%" r="60%">
      <stop offset="0%" stop-color="#141428"/>
      <stop offset="100%" stop-color="#07070f"/>
    </radialGradient>
    <radialGradient id="core2" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="30%" stop-color="#d0ff60"/>
      <stop offset="100%" stop-color="#4a8010" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow2">
      <feGaussianBlur stdDeviation="2.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="softglow2"><feGaussianBlur stdDeviation="10"/></filter>
    <clipPath id="rounded2"><rect width="160" height="160" rx="36" ry="36"/></clipPath>
  </defs>
  <style>
    @keyframes pulse-ring { 0% { opacity: 0.6; r: 28; } 100% { opacity: 0; r: 72; } }
    @keyframes glow-core  { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
    .pulse-ring-1 { animation: pulse-ring 2.4s ease-out infinite; }
    .pulse-ring-2 { animation: pulse-ring 2.4s ease-out infinite 0.8s; }
    .pulse-ring-3 { animation: pulse-ring 2.4s ease-out infinite 1.6s; }
    .core-glow    { animation: glow-core 2s ease-in-out infinite; }
  </style>
  <g clip-path="url(#rounded2)">
    <rect width="160" height="160" fill="url(#bg2)"/>
    <g transform="translate(72, 80)" fill="none" stroke="#b0e840" stroke-width="1">
      <circle class="pulse-ring-1" r="28" opacity="0"/>
      <circle class="pulse-ring-2" r="28" opacity="0"/>
      <circle class="pulse-ring-3" r="28" opacity="0"/>
    </g>
    <g transform="translate(72, 80)" fill="none" stroke="#b8ff4a" stroke-width="0.5">
      <circle r="22" opacity="0.2"/>
      <circle r="40" opacity="0.12"/>
      <circle r="58" opacity="0.07"/>
    </g>
    <ellipse cx="72" cy="80" rx="36" ry="34" fill="#88cc00" opacity="0.1" filter="url(#softglow2)"/>
    <line x1="32" y1="28" x2="32" y2="132" stroke="#c0f040" stroke-width="8" stroke-linecap="round" filter="url(#glow2)"/>
    <line x1="72" y1="80" x2="116" y2="28" stroke="#c8f858" stroke-width="8" stroke-linecap="round" filter="url(#glow2)"/>
    <line x1="72" y1="80" x2="116" y2="132" stroke="#c8f858" stroke-width="8" stroke-linecap="round" filter="url(#glow2)"/>
    <circle cx="72" cy="80" r="12" fill="#88cc00" opacity="0.3" filter="url(#softglow2)" class="core-glow"/>
    <circle cx="72" cy="80" r="6" fill="url(#core2)" filter="url(#glow2)" class="core-glow"/>
    <circle cx="72" cy="80" r="3" fill="#ffffff"/>
  </g>
</svg>`;

// ============================================================
// WRITE ALL FILES
// ============================================================

// Characters: 4 × 2 files
const charMap = [
  ['elara',  'figure-01', palettes.elara,  portraitElara,  figurineElara],
  ['korrin', 'figure-02', palettes.korrin, portraitKorrin, figurineKorrin],
  ['vex',    'figure-03', palettes.vex,    portraitVex,    figurineVex],
  ['brann',  'figure-04', palettes.brann,  portraitBrann,  figurineBrann],
];
for (const [, slug, pal, portraitFn, figurineFn] of charMap) {
  dump(`characters/${slug}.portrait.svg`,  portraitFn(pal));
  dump(`characters/${slug}.figurine.svg`,  figurineFn(pal));
}

// Props: 6 files
for (const [id, svg] of Object.entries(props)) {
  dump(`props/${id}.svg`, svg);
}

// Terrain: 6 files
const terrainFns = [terrainForest, terrainStone, terrainWater, terrainWood, terrainSnow, terrainSand];
for (let i = 0; i < 6; i++) {
  const id = `ter-${String(i + 1).padStart(2, '0')}`;
  dump(`terrain/${id}.svg`, terrainFns[i]());
}

// Logos: 3 copies from handoff files + 2 generated
mkdirSync(join(OUT, 'logos'), { recursive: true });
for (const [src, dst] of [
  ['logo-mark.svg',         'logos/mark.svg'],
  ['logo-lockup-dark.svg',  'logos/lockup-dark.svg'],
  ['logo-lockup-light.svg', 'logos/lockup-light.svg'],
]) {
  copyFileSync(join(HANDOFF, src), join(OUT, dst));
  console.log('copy', dst);
}

dump('logos/app-icon.svg',    logoAppIcon);
dump('logos/radar-pulse.svg', logoRadarPulse);

console.log('Extraction done. Run `node validate-manifest.mjs` to verify.');
