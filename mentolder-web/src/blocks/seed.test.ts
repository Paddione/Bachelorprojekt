import { describe, it, expect } from 'vitest';
import { HomepageBlocksDocument } from './schema';

describe('homepage seed', () => {
  it('exports a valid HomepageBlocksDocument', async () => {
    const { homepageSeed } = await import('./seed');
    const result = HomepageBlocksDocument.safeParse(homepageSeed);
    if (!result.success) {
      console.error(result.error.message);
    }
    expect(result.success).toBe(true);
  });

  it('contains all 7 catalog blocks in order', async () => {
    const { homepageSeed } = await import('./seed');
    const types = homepageSeed.blocks.map((b: { type: string }) => b.type);
    expect(types).toEqual([
      'hero',
      'stats',
      'services',
      'whyMe',
      'process',
      'faq',
      'cta',
    ]);
  });

  it('includes the author quote (Gerald Korczewski)', async () => {
    const { homepageSeed } = await import('./seed');
    const whyMe = homepageSeed.blocks.find((b: { type: string }) => b.type === 'whyMe');
    const props = whyMe!.props as { quoteName: string; quoteRole: string };
    expect(props.quoteName).toBe('Gerald Korczewski');
    expect(props.quoteRole).toContain('Coach');
  });

  it('has inline WhyMe points matching the mentolder brand', async () => {
    const { homepageSeed } = await import('./seed');
    const whyMe = homepageSeed.blocks.find((b: { type: string }) => b.type === 'whyMe');
    const points = (whyMe!.props as { points: Array<{ title: string }> }).points;
    expect(points).toHaveLength(3);
    expect(points[0].title).toBe('Erste deutsche Polizeibehörde mit KI');
    expect(points[1].title).toBe('Systemischer Coach');
    expect(points[2].title).toBe('Generation 65+ digital aus eigener Erfahrung');
  });

  it('uses structured intro with "beide Welten" emphasis', async () => {
    const { homepageSeed } = await import('./seed');
    const whyMe = homepageSeed.blocks.find((b: { type: string }) => b.type === 'whyMe');
    const intro = (whyMe!.props as { intro: { prefix: string; emphasis: string; suffix: string } }).intro;
    expect(intro.prefix).toBe('Ich kenne beide Welten: ');
    expect(intro.emphasis).toBe('40 Jahre etablierte Strukturen');
    expect(intro.suffix).toContain('KI-Tools');
  });
});
