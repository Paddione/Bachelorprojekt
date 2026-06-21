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

  it('includes the inline testimonial (Dr. M. Albers)', async () => {
    const { homepageSeed } = await import('./seed');
    const whyMe = homepageSeed.blocks.find((b: { type: string }) => b.type === 'whyMe');
    const props = whyMe!.props as { quoteName: string; quoteRole: string };
    expect(props.quoteName).toBe('Dr. M. Albers');
    expect(props.quoteRole).toContain('CTO');
  });

  it('has inline WhyMe points (not content.ts version)', async () => {
    const { homepageSeed } = await import('./seed');
    const whyMe = homepageSeed.blocks.find((b: { type: string }) => b.type === 'whyMe');
    const points = (whyMe!.props as { points: Array<{ title: string }> }).points;
    expect(points).toHaveLength(4);
    expect(points[0].title).toBe('30+ Jahre Führungserfahrung');
    expect(points[1].title).toBe('Technik trifft Empathie');
    expect(points[2].title).toBe('Pragmatismus statt Hype');
    expect(points[3].title).toBe('Diskretion ist selbstverständlich');
  });

  it('uses structured intro with emphasis at correct position', async () => {
    const { homepageSeed } = await import('./seed');
    const whyMe = homepageSeed.blocks.find((b: { type: string }) => b.type === 'whyMe');
    const intro = (whyMe!.props as { intro: { prefix: string; emphasis: string; suffix: string } }).intro;
    expect(intro.prefix).toBe('Ich ');
    expect(intro.emphasis).toBe('verbinde');
    expect(intro.suffix).toContain('technische Tiefe');
  });
});
