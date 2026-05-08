// Snapshot-style tests for the branded newsletter template.
//
// Regression tests for T000173 / T000171 — the preview iframe used to render
// raw HTML without header or legal footer. These tests assert that BOTH a
// brand header AND the mandatory Anbieterkennzeichnung + unsubscribe link are
// always present in the rendered HTML, for both brands.

import { describe, expect, it } from 'vitest';
import { renderNewsletterEmail, renderNewsletterText } from './newsletter-template';

const mentolderBrand = {
  brandName: 'Mentolder',
  brandId: 'mentolder',
  contactName: 'Gerald Korczewski',
  contactEmail: 'info@mentolder.de',
  contactPhone: '+49 151 508 32 601',
  legalStreet: 'Ludwig-Erhard-Str. 18',
  legalZip: '20459',
  legalCity: 'Hamburg',
  legalJobtitle: 'Coach und digitaler Begleiter',
  legalUstId: '33/023/05100',
  legalWebsite: 'mentolder.de',
};

const korczewskiBrand = {
  brandName: 'Patrick Korczewski',
  brandId: 'korczewski',
  contactName: 'Patrick Korczewski',
  contactEmail: 'info@korczewski.de',
  contactPhone: '+49 151 000 00 000',
  legalStreet: 'In der Twiet 4',
  legalZip: '21360',
  legalCity: 'Vögelsen',
  legalJobtitle: 'Software Engineer, IT-Security-Berater',
  legalUstId: 'Kleinunternehmer gem. § 19 Abs. 1 UStG',
  legalWebsite: 'korczewski.de',
};

describe('renderNewsletterEmail', () => {
  const baseParams = {
    bodyHtml: '<h1>Hallo!</h1><p>Newsletter-Inhalt.</p>',
    subject: 'Test-Betreff',
    unsubscribeUrl: 'https://web.mentolder.de/api/newsletter/unsubscribe?token=abc123',
  };

  it('returns a complete HTML document', () => {
    const html = renderNewsletterEmail(baseParams, mentolderBrand);
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('<html lang="de">');
    expect(html).toContain('</html>');
    expect(html).toContain('<title>Test-Betreff</title>');
  });

  it('includes the brand header with brand name', () => {
    const html = renderNewsletterEmail(baseParams, mentolderBrand);
    expect(html).toContain('Mentolder');
    expect(html).toContain('Coach und digitaler Begleiter');
  });

  it('includes the user-authored body content untouched', () => {
    const html = renderNewsletterEmail(baseParams, mentolderBrand);
    expect(html).toContain('<h1>Hallo!</h1>');
    expect(html).toContain('<p>Newsletter-Inhalt.</p>');
  });

  it('includes the mandatory unsubscribe link', () => {
    const html = renderNewsletterEmail(baseParams, mentolderBrand);
    expect(html).toContain('https://web.mentolder.de/api/newsletter/unsubscribe?token=abc123');
    expect(html.toLowerCase()).toContain('abmelden');
  });

  it('includes the full legal Anbieterkennzeichnung (UWG/TMG §5)', () => {
    const html = renderNewsletterEmail(baseParams, mentolderBrand);
    // Name, address, contact, USt-ID
    expect(html).toContain('Gerald Korczewski');
    expect(html).toContain('Ludwig-Erhard-Str. 18');
    expect(html).toContain('20459 Hamburg');
    expect(html).toContain('info@mentolder.de');
    expect(html).toContain('+49 151 508 32 601');
    expect(html).toContain('33/023/05100');
    expect(html).toContain('mentolder.de');
  });

  it('renders the korczewski brand independently (different brand color + legal data)', () => {
    const html = renderNewsletterEmail(baseParams, korczewskiBrand);
    expect(html).toContain('Patrick Korczewski');
    expect(html).toContain('In der Twiet 4');
    expect(html).toContain('21360 Vögelsen');
    expect(html).toContain('Kleinunternehmer gem. § 19 Abs. 1 UStG');
    // korczewski uses a sage/teal accent, not brass
    expect(html).toMatch(/#1f3b3b/);
    expect(html).not.toMatch(/background:#b8973a/);
  });

  it('shows the preview banner when isPreview is set', () => {
    const html = renderNewsletterEmail({ ...baseParams, isPreview: true }, mentolderBrand);
    expect(html.toLowerCase()).toContain('vorschau');
  });

  it('does NOT show the preview banner for actual sends', () => {
    const html = renderNewsletterEmail(baseParams, mentolderBrand);
    expect(html).not.toMatch(/Vorschau — diese Ansicht/);
  });

  it('escapes HTML-unsafe characters in the unsubscribe URL', () => {
    const html = renderNewsletterEmail(
      { ...baseParams, unsubscribeUrl: 'https://x/?a=1&b=<script>' },
      mentolderBrand,
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('degrades gracefully when legal env vars are missing', () => {
    const html = renderNewsletterEmail(baseParams, {
      brandName: 'Workspace',
      brandId: 'mentolder',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      legalStreet: '',
      legalZip: '',
      legalCity: '',
      legalJobtitle: '',
      legalUstId: '',
      legalWebsite: '',
    });
    // Even without legal data, the unsubscribe link MUST always be present.
    expect(html).toContain(baseParams.unsubscribeUrl);
    expect(html.toLowerCase()).toContain('abmelden');
    // And the body still renders.
    expect(html).toContain('<h1>Hallo!</h1>');
  });
});

describe('renderNewsletterText', () => {
  it('strips HTML and appends legal footer + unsubscribe URL', () => {
    const text = renderNewsletterText(
      {
        bodyHtml: '<h1>Hallo!</h1><p>Inhalt.</p>',
        subject: 'X',
        unsubscribeUrl: 'https://web.mentolder.de/api/newsletter/unsubscribe?token=abc',
      },
      mentolderBrand,
    );
    expect(text).toContain('Hallo!');
    expect(text).toContain('Inhalt.');
    expect(text).not.toContain('<h1>');
    expect(text).toContain('Abmelden:');
    expect(text).toContain('https://web.mentolder.de/api/newsletter/unsubscribe?token=abc');
    expect(text).toContain('Gerald Korczewski');
    expect(text).toContain('Ludwig-Erhard-Str. 18');
  });
});
