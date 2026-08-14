import { test } from '@playwright/test';

let sdlcReachable: boolean | null = null;

export async function guardSdlc(request: any) {
  if (sdlcReachable === null) {
    const base = (process.env.WEBSITE_URL || 'https://web.mentolder.de').replace(/\/$/, '');
    sdlcReachable = await request.get(`${base}/sdlc/cockpit`, { timeout: 10_000, maxRedirects: 0 })
      .then((r: any) => r.status() !== 404 && r.status() < 500)
      .catch(() => false);
  }
  if (!sdlcReachable) {
    test.skip(true, 'SDLC routes (/sdlc/*) not deployed on this build target');
  }
}
