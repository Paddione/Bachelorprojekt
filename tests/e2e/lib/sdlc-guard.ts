import { test } from '@playwright/test';

let sdlcReachable: boolean | null = null;

/** Prod-Ziele, auf denen die SDLC-Routen im Build absichtlich fehlen. */
function isProdBuildTarget(base: string): boolean {
  return /mentolder\.de|korczewski\.de/.test(base);
}

export async function guardSdlc(request: any) {
  const base = (process.env.WEBSITE_URL || 'https://web.mentolder.de').replace(/\/$/, '');
  if (sdlcReachable === null) {
    sdlcReachable = await request.get(`${base}/sdlc/cockpit`, { timeout: 10_000, maxRedirects: 0 })
      .then((r: any) => r.status() !== 404 && r.status() < 500)
      .catch(() => false);
  }
  if (!sdlcReachable) {
    // T013329 F3/D2: fail-loud statt fail-silent. Gegen einen Prod-Build
    // skippt der Guard weiterhin (die Routen sind dort absichtlich entfernt);
    // gegen eine lokale/Dev-Instanz, die sie hätte liefern müssen, ist die
    // fehlende Route ein Fehler — "explicitly unsupported, not silently empty".
    if (isProdBuildTarget(base)) {
      test.skip(true, 'SDLC routes (/sdlc/*) not deployed on this build target');
    }
    throw new Error(
      `SDLC routes (/sdlc/*) not reachable on ${base} — a non-prod target must serve them. `
      + 'Point WEBSITE_URL at a prod domain to skip instead.',
    );
  }
}
