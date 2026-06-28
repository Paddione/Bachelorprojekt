import * as fs from 'fs';
import * as path from 'path';
import type { Page } from '@playwright/test';

export type AuthTier = 'public' | 'portal' | 'admin';
export type Brand = 'mentolder' | 'korczewski';
export type Viewport = 'desktop' | 'mobile';

export interface RouteEntry {
  route: string;
  authTier: AuthTier;
  brand: 'both' | Brand;
  dynamic: boolean;
  resolver?: {
    indexUrl: string;
    selector: string;
    exclude?: string;
    auth: 'public' | 'customer' | 'admin';
    source: 'dom' | 'db' | 'none';
  };
  excludeFromSweep: boolean;
  media: boolean;
}

export interface Manifest {
  generatedFrom: string;
  count: number;
  routes: RouteEntry[];
}

export interface ResultRow {
  route: string;
  brand: Brand;
  viewport: Viewport;
  status: 'ok' | 'redirect' | 'skip' | 'error' | 'timeout';
  redirectedTo?: string;
  reason?: string;
  screenshot: string;
  navFailures: unknown[];
  deadLinks: unknown[];
}

export const MANIFEST_PATH = path.join(__dirname, '..', '..', '..', 'website', 'src', 'data', 'route-manifest.json');
export const AUTH_DIR      = path.join(__dirname, '..', '.auth');
export const RESULTS_ROOT  = path.join(__dirname, '..', '..', 'results', 'visual-sweep');

export const VIEWPORTS: Record<Viewport, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  mobile:  { width: 390, height: 844 },
};

export const VIDEO_ENABLED = !!process.env.VISUAL_SWEEP_VIDEO;

export const manifest: Manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));

export function parseProject(name: string): { brand: Brand; viewport: Viewport } {
  const m = /^visual-sweep-(mentolder|korczewski)-(desktop|mobile)$/.exec(name);
  if (!m) {
    throw new Error(
      `[visual-sweep] cannot derive brand/viewport from project "${name}". ` +
      `Run via one of: visual-sweep-{mentolder,korczewski}-{desktop,mobile}.`,
    );
  }
  return { brand: m[1] as Brand, viewport: m[2] as Viewport };
}

export function safeRoute(route: string): string {
  if (route === '/') return 'index';
  return route
    .replace(/\//g, '__')
    .replace(/^__+/, '')
    .replace(/\[/g, '')
    .replace(/\]/g, '');
}

export function authStateFile(brand: Brand, tier: 'admin' | 'customer'): string {
  if (tier === 'admin') return path.join(AUTH_DIR, `${brand}-website-admin.json`);
  return path.join(AUTH_DIR, `${brand}-website-user.json`);
}

export function readStateOrNull(file: string): { cookies: unknown[]; origins: unknown[] } | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

export function isEmptyState(state: { cookies: unknown[]; origins: unknown[] } | null): boolean {
  if (!state) return true;
  return (state.cookies?.length ?? 0) === 0 && (state.origins?.length ?? 0) === 0;
}

export function applicableRoutes(brand: Brand): RouteEntry[] {
  const base = manifest.routes.filter(
    (r) => !r.excludeFromSweep && (r.brand === 'both' || r.brand === brand),
  );
  return process.env.VISUAL_SWEEP_PUBLIC_ONLY
    ? base.filter((r) => r.authTier === 'public')
    : base;
}

export function assertAuthReady(brand: Brand, routes: RouteEntry[]): void {
  const needsAdmin  = routes.some((r) => r.authTier === 'admin');
  const needsPortal = routes.some((r) => r.authTier === 'portal');
  const missing: string[] = [];

  if (needsAdmin) {
    const f = authStateFile(brand, 'admin');
    if (isEmptyState(readStateOrNull(f))) {
      missing.push(
        `ADMIN routes are in scope but ${path.basename(f)} is empty-state ` +
        `({cookies:[],origins:[]}). Set ${brand === 'mentolder' ? 'E2E_ADMIN_PASS' : 'TEST_ADMIN_PASSWORD'} ` +
        `and re-run the ${brand}-setup project so it mints a real session.`,
      );
    }
  }
  if (needsPortal) {
    const portalCredsExpected = brand === 'mentolder';
    const f = authStateFile(brand, 'customer');
    if (portalCredsExpected && isEmptyState(readStateOrNull(f))) {
      missing.push(
        `PORTAL routes are in scope but ${path.basename(f)} is empty-state. ` +
        `Set E2E_USER_PASS and re-run the ${brand}-setup project.`,
      );
    }
  }

  if (missing.length) {
    throw new Error(
      `[visual-sweep] PRECONDITION FAILED for brand "${brand}":\n  - ` +
      missing.join('\n  - '),
    );
  }
}

export function storageStateFor(brand: Brand, tier: AuthTier): string | undefined | 'SKIP' {
  if (tier === 'public') return undefined;
  const file = tier === 'admin' ? authStateFile(brand, 'admin') : authStateFile(brand, 'customer');
  if (isEmptyState(readStateOrNull(file))) return 'SKIP';
  return file;
}

export function authStatesMap(brand: Brand): { admin?: string; customer?: string } {
  const out: { admin?: string; customer?: string } = {};
  const adminF = authStateFile(brand, 'admin');
  if (!isEmptyState(readStateOrNull(adminF))) out.admin = adminF;
  const custF = authStateFile(brand, 'customer');
  if (!isEmptyState(readStateOrNull(custF))) out.customer = custF;
  return out;
}

export async function robustGoto(
  page: Page,
  url: string,
): Promise<{ resp: Awaited<ReturnType<Page['goto']>>; note?: string }> {
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 18_000 });
    return { resp };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/Timeout/i.test(msg)) throw err;
    const resp = await page.goto(url, { waitUntil: 'commit', timeout: 18_000 });
    return {
      resp,
      note: 'slow-lifecycle: domcontentloaded never fired (server HTTP/2 stream not closed cleanly); captured via commit + settle',
    };
  }
}
