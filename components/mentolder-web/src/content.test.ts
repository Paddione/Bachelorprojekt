import { describe, it, expect } from 'vitest';
import { ueberMich, leistungenKategorien, referenzenConfig } from '@/content';

describe('ueberMich', () => {
  it('has at least one milestone', () => {
    expect(ueberMich.milestones.length).toBeGreaterThan(0);
  });
  it('every milestone has year, title and desc', () => {
    for (const m of ueberMich.milestones) {
      expect(m.year).toBeTruthy();
      expect(m.title).toBeTruthy();
      expect(m.desc).toBeTruthy();
    }
  });
  it('has at least one section', () => {
    expect(ueberMich.sections.length).toBeGreaterThan(0);
  });
  it('has at least one notDoing item', () => {
    expect(ueberMich.notDoing.length).toBeGreaterThan(0);
  });
});

describe('leistungenKategorien', () => {
  it('has at least one category with at least one service', () => {
    expect(leistungenKategorien.length).toBeGreaterThan(0);
    expect(leistungenKategorien[0].services.length).toBeGreaterThan(0);
  });
  it('every service has a unique slug', () => {
    const allSlugs = leistungenKategorien.flatMap((k) => k.services.map((s) => s.slug));
    expect(new Set(allSlugs).size).toBe(allSlugs.length);
  });
  it('every service icon is a valid IconName', () => {
    const valid = ['fuehrung', 'digitalisierung', 'team', 'strategie', 'kommunikation', 'resilienz'];
    for (const kat of leistungenKategorien) {
      for (const svc of kat.services) {
        expect(valid).toContain(svc.icon);
      }
    }
  });
  it('every service has non-empty pageContent.headline', () => {
    for (const kat of leistungenKategorien) {
      for (const svc of kat.services) {
        expect(svc.pageContent.headline).toBeTruthy();
      }
    }
  });
});

describe('referenzenConfig', () => {
  it('has heading and subheading', () => {
    expect(referenzenConfig.heading).toBeTruthy();
    expect(referenzenConfig.subheading).toBeTruthy();
  });
  it('items and types are arrays', () => {
    expect(Array.isArray(referenzenConfig.items)).toBe(true);
    expect(Array.isArray(referenzenConfig.types)).toBe(true);
  });
});
