#!/usr/bin/env node
// Invoke via `tsx scripts/export-site-content.mjs` (or via the
// `task content:export` wrapper in Taskfile.yml). The script imports
// the Zod schema from the TypeScript content-schema module; tsx strips
// the types at load.
// scripts/export-site-content.mjs
// One-shot DB → JSON exporter that seeds `website/content/<brand>/`.
// Connects via SESSIONS_DATABASE_URL, reads each brand's effective content
// (site_settings rows + service_config + leistungen_config + referenzen_config),
// projects it through the same helpers the live `getEffective*` uses, validates
// each result against `ContentBundleSchema[domain]`, and writes JSON.
//
// Re-runnable: each run overwrites the existing files (idempotent).
//
// Usage:  ENV=<brand> node scripts/export-site-content.mjs
//         ENV=mentolder node scripts/export-site-content.mjs
//
// Each brand arg writes 13 JSON files. Re-run with no args to export every
// brand in `public.brands` (the SSOT brand registry).
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'node:process';

import pg from 'pg';
import { ContentBundleSchema, DOMAINS } from '../website/src/content-schema/index.ts';

// ESM __dirname shim
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const CONTENT_DIR = resolve(REPO_ROOT, 'website', 'content');

const DB_URL = process.env.SESSIONS_DATABASE_URL
  || 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website';

const REQUESTED_BRANDS = (process.env.ENV
  ? [process.env.ENV]
  : ['mentolder', 'korczewski']);

async function listBrands(client) {
  const r = await client.query('SELECT id FROM public.brands ORDER BY id ASC');
  return r.rows.map((row) => row.id);
}

async function readSiteSetting(client, brand, key) {
  const r = await client.query(
    'SELECT value FROM site_settings WHERE brand = $1 AND key = $2',
    [brand, key]
  );
  return r.rows[0]?.value ?? null;
}

async function readJsonSetting(client, brand, key) {
  const raw = await readSiteSetting(client, brand, key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function readServiceConfig(client, brand) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS service_config (
      brand TEXT PRIMARY KEY REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      services_json JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const r = await client.query(
    'SELECT services_json FROM service_config WHERE brand = $1',
    [brand]
  );
  return r.rows[0]?.services_json ?? null;
}

async function readLeistungenConfig(client, brand) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS leistungen_config (
      brand TEXT PRIMARY KEY REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      categories_json JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const r = await client.query(
    'SELECT categories_json FROM leistungen_config WHERE brand = $1',
    [brand]
  );
  return r.rows[0]?.categories_json ?? null;
}

async function readReferenzen(client, brand) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS referenzen_config (
      brand TEXT PRIMARY KEY REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      items_json JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const r = await client.query(
    'SELECT items_json FROM referenzen_config WHERE brand = $1',
    [brand]
  );
  const raw = r.rows[0]?.items_json ?? null;
  if (!raw) return { types: [], items: [] };
  if (Array.isArray(raw)) return { types: [], items: raw };
  return {
    heading: raw.heading,
    subheading: raw.subheading,
    types: Array.isArray(raw.types) ? raw.types : [],
    items: Array.isArray(raw.items) ? raw.items : [],
  };
}

async function readHomepageBlocks(client, brand) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS homepage_block_documents (
      brand TEXT PRIMARY KEY,
      document JSONB NOT NULL,
      version INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const r = await client.query(
    'SELECT document, version FROM homepage_block_documents WHERE brand = $1',
    [brand]
  );
  if (!r.rows.length) return { schemaVersion: 1, blocks: [] };
  const doc = r.rows[0].document ?? { schemaVersion: 1, blocks: [] };
  if (typeof doc === 'string') {
    try { return JSON.parse(doc); } catch { return { schemaVersion: 1, blocks: [] }; }
  }
  return doc;
}

async function readAllSeoForBrand(client, brand) {
  const r = await client.query(
    `SELECT key, value FROM site_settings
      WHERE brand = $1
        AND (key LIKE 'seo_title_%' OR key LIKE 'seo_meta_desc_%' OR key LIKE 'seo_og_image_%')`,
    [brand]
  );
  const titles = {};
  const descriptions = {};
  const ogImages = {};
  for (const row of r.rows) {
    const k = row.key;
    if (k.startsWith('seo_title_'))      titles[k.slice('seo_title_'.length)]      = row.value;
    else if (k.startsWith('seo_meta_desc_')) descriptions[k.slice('seo_meta_desc_'.length)] = row.value;
    else if (k.startsWith('seo_og_image_'))  ogImages[k.slice('seo_og_image_'.length)]      = row.value;
  }
  return { titles, descriptions, ogImages };
}

async function deriveContent(client, brand) {
  // 13 content domains
  const [homepage, faq, kontakt, uebermich, services, leistungen,
    stammdaten, navigation, footer, referenzen, koreFlags, seo, homepageBlocks,
  ] = await Promise.all([
    readJsonSetting(client, brand, 'homepage'),
    readJsonSetting(client, brand, 'faq'),
    readJsonSetting(client, brand, 'kontakt'),
    readJsonSetting(client, brand, 'uebermich'),
    readServiceConfig(client, brand),
    readLeistungenConfig(client, brand),
    readJsonSetting(client, brand, 'stammdaten'),
    readJsonSetting(client, brand, 'navigation'),
    readJsonSetting(client, brand, 'footer'),
    readReferenzen(client, brand),
    readJsonSetting(client, brand, 'kore_flags'),
    readAllSeoForBrand(client, brand),
    readHomepageBlocks(client, brand),
  ]);

  return {
    'homepage':        homepage        ?? defaultHomepage(brand),
    'homepage-blocks': homepageBlocks,
    'seo':             seo,
    'faq':             faq             ?? [],
    'kontakt':         kontakt         ?? defaultKontakt(brand),
    'ueber-mich':      uebermich       ?? {},
    'services':        services        ?? [],
    'leistungen':      leistungen      ?? [],
    'stammdaten':      stammdaten      ?? defaultStammdaten(brand),
    'navigation':      navigation      ?? defaultNavigation(brand),
    'footer':          footer          ?? defaultFooter(brand),
    'referenzen':      referenzen,
    'kore-flags':      koreFlags       ?? { timeline: false },
  };
}

function defaultHomepage(brand) {
  return brand === 'mentolder'
    ? {
        hero: {
          title: 'Digital Coach & Führungskräfte-Mentor –',
          titleEmphasis: 'der Mensch und Technologie wieder verbindet.',
          subtitle: 'Ich kenne beide Welten: 40 Jahre etablierte Strukturen UND modernste KI-Tools.',
          tagline: 'Praxisnah. Strukturiert. Auf Augenhöhe.',
        },
        stats: [
          { value: '30+', label: 'Jahre Führungserfahrung' },
          { value: '50+', label: 'Begleitete Teilnehmer' },
          { value: '40', label: 'Jahre Praxis in IT & Sicherheit' },
          { value: 'KI', label: 'Pionier der ersten Stunde' },
        ],
        servicesHeadline: 'Meine Angebote',
        servicesSubheadline: 'Sie suchen jemanden, der Menschen, Prozesse und Technik verbindet?',
        whyMeHeadline: 'Warum ich?',
        whyMeIntro: 'Ich kenne beide Welten: 40 Jahre etablierte Strukturen UND modernste KI-Tools.',
        whyMePoints: [],
        quote: 'Ich stelle unbequeme Fragen – weil echte Lösungen manchmal unbequeme Wahrheiten brauchen.',
        quoteName: 'Gerald Korczewski',
      }
    : {
        hero: { title: 'Kore', subtitle: '', tagline: '' },
        stats: [], servicesHeadline: '', servicesSubheadline: '',
        whyMeHeadline: '', whyMeIntro: '', whyMePoints: [],
        quote: '', quoteName: '',
      };
}
function defaultKontakt(brand) {
  return brand === 'mentolder'
    ? { intro: '', sidebarTitle: '', sidebarText: '', sidebarCta: '', showPhone: true }
    : { intro: '', sidebarTitle: '', sidebarText: '', sidebarCta: '', showPhone: false };
}
function defaultStammdaten(brand) {
  return {
    name: brand === 'mentolder' ? 'Gerald Korczewski' : '',
    role: '', email: '', phone: '', street: '', zip: '',
    city: '', ustId: '', website: brand === 'mentolder' ? 'mentolder.de' : 'korczewski.de',
    avatarInitials: brand === 'mentolder' ? 'GK' : 'PK',
  };
}
function defaultNavigation(brand) {
  if (brand === 'mentolder') {
    return [
      { label: 'Angebote',   href: '/#angebote', order: 0 },
      { label: 'Über mich',  href: '/ueber-mich', order: 1 },
      { label: 'Referenzen', href: '/referenzen', order: 2 },
      { label: 'Kontakt',    href: '/kontakt', order: 3 },
    ];
  }
  return [];
}
function defaultFooter(brand) {
  if (brand === 'mentolder') {
    return {
      columns: [
        { heading: 'Rechtliches', links: [
          { label: 'Referenzen', href: '/referenzen' },
          { label: 'Impressum',  href: '/impressum' },
          { label: 'Datenschutz', href: '/datenschutz' },
        ] },
      ],
      copyright: `© ${new Date().getFullYear()} mentolder — Alle Rechte vorbehalten`,
    };
  }
  return { columns: [], copyright: `© ${new Date().getFullYear()} ${brand}` };
}

async function writeValidated(brand, domain, value) {
  const schema = ContentBundleSchema[domain];
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`[${brand}/${domain}] schema-invalid: ${issues.join('; ')}`);
  }
  const outPath = resolve(CONTENT_DIR, brand, `${domain}.json`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(parsed.data, null, 2) + '\n', 'utf8');
  return { domain, path: outPath };
}

async function exportBrand(client, brand) {
  console.log(`→ exporting ${brand}…`);
  const content = await deriveContent(client, brand);
  const written = [];
  for (const domain of DOMAINS) {
    if (!(domain in content)) {
      throw new Error(`[${brand}] missing content for domain ${domain}`);
    }
    const r = await writeValidated(brand, domain, content[domain]);
    written.push(r);
  }
  console.log(`  wrote ${written.length} files for ${brand}`);
  return written;
}

async function main() {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    const knownBrands = await listBrands(client);
    const brands = REQUESTED_BRANDS.filter((b) => knownBrands.includes(b));
    if (brands.length === 0) {
      console.error(`ERROR: no overlap between requested [${REQUESTED_BRANDS.join(', ')}] and known [${knownBrands.join(', ')}]`);
      process.exit(1);
    }
    let total = 0;
    for (const brand of brands) {
      const written = await exportBrand(client, brand);
      total += written.length;
    }
    console.log(`✓ exported ${total} files for ${brands.length} brand(s) → ${CONTENT_DIR}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('FATAL:', err?.message ?? err);
  process.exit(1);
});
