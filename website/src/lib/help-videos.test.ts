import { describe, it, expect } from 'vitest';
import { HelpVideoSchema, loadHelpVideos, resolveHelpVideos } from './help-videos';

describe('HelpVideoSchema', () => {
  it('accepts a minimal valid video (vendored VideoSource shape)', () => {
    const ok = HelpVideoSchema.safeParse({ id: 'v1', url: 'https://x/v.mp4', title: 'T', duration: 12 });
    expect(ok.success).toBe(true);
  });

  it('rejects posterUrl/durationSec (wrong field names from the spec draft)', () => {
    const bad = HelpVideoSchema.safeParse({ id: 'v1', url: 'https://x/v.mp4', title: 'T', posterUrl: 'p', durationSec: 12 });
    // duration is required → fails even though extra keys are stripped
    expect(bad.success).toBe(false);
  });

  it('requires a non-empty id, url and title', () => {
    expect(HelpVideoSchema.safeParse({ id: '', url: 'https://x', title: 'T', duration: 1 }).success).toBe(false);
  });
});

describe('loadHelpVideos', () => {
  it('parses the shipped manifest into a typed array', () => {
    const videos = loadHelpVideos();
    expect(Array.isArray(videos)).toBe(true);
    expect(videos.length).toBeGreaterThan(0);
    for (const v of videos) {
      expect(typeof v.id).toBe('string');
      expect(typeof v.url).toBe('string');
      expect(typeof v.duration).toBe('number');
    }
  });
});

// T000879 — mediaviewer streamt nicht bei Sessions (fleet).
// G4: help-videos.json zeigt hart auf videovault.localhost (Dev). In Prod muss der
// Host der konfigurierte VideoVault-Host sein (z.B. videovault.mentolder.de), sonst
// lädt im Portal-iframe keine Quelle → "streamt nicht". resolveHelpVideos() schreibt
// den Dev-Host auf den übergebenen Prod-Host um.
// Synthetic, non-brand host on purpose: the rewrite must work for ANY configured
// host. Using a real brand domain (videovault.mentolder.de) would trip the S3
// hardcoded-host scanner; the assertion is on the passed-in `host` variable, so the
// literal is never a brand domain.
describe('resolveHelpVideos (G4 — Prod-Host-Rewrite)', () => {
  it('rewrites the dev videovault host to the configured prod host', () => {
    const host = 'videovault.example.test';
    const videos = resolveHelpVideos(host);
    expect(videos.length).toBeGreaterThan(0);
    for (const v of videos) {
      expect(v.url.startsWith(`https://${host}/`)).toBe(true);
      expect(v.url).not.toContain('videovault.localhost');
    }
  });

  it('never yields a .localhost host in prod', () => {
    const videos = resolveHelpVideos('vv.example.test');
    for (const v of videos) {
      expect(v.url).not.toContain('.localhost');
    }
  });
});
