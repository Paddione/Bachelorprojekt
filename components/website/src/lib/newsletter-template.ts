// Branded transactional-email wrapper for newsletters.
//
// Used by BOTH the admin preview iframe (`/api/admin/newsletter/preview`)
// and the actual outbound campaign send (`lib/email.ts → sendNewsletterCampaign`).
// Keeping a single source of truth here is the entire point of fixing T000173 /
// T000171: previously the preview wrapped user HTML in a stub `<html><body>...`
// while the send path tacked on only a minimal footer — neither matched and
// neither carried the brand header or the German UWG / DSGVO mandatory legal
// footer (full Anbieterkennzeichnung + Abmelde-Link).
//
// All brand data is read from `process.env` per the "Legal data single source"
// rule in CLAUDE.md — no hardcoded addresses, phone numbers, or domains.

export interface NewsletterTemplateParams {
  /** User-authored HTML body (already AUSGABE-replaced for send, raw for preview). */
  bodyHtml: string;
  /** Subject line — used for the `<title>` tag. */
  subject: string;
  /**
   * Absolute unsubscribe URL. For the live preview we substitute a sample token
   * so the footer looks identical to the real send.
   */
  unsubscribeUrl: string;
  /** Optional: render a "this is just a preview" banner above the content. */
  isPreview?: boolean;
}

interface BrandLegalData {
  brandName: string;
  brandId: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  legalStreet: string;
  legalZip: string;
  legalCity: string;
  legalJobtitle: string;
  legalUstId: string;
  legalWebsite: string;
}

/**
 * Pure function — gets a snapshot of brand/legal env vars. Exposed so unit
 * tests can stub it via dependency injection (`renderNewsletterEmail({...},
 * stubbedBrand)`) without touching the global `process.env`.
 */
export function readBrandFromEnv(): BrandLegalData {
  return {
    brandName: process.env.BRAND_NAME || process.env.FROM_NAME || 'Workspace',
    brandId: process.env.BRAND_ID || process.env.BRAND || 'mentolder',
    contactName: process.env.CONTACT_NAME || '',
    contactEmail: process.env.CONTACT_EMAIL || '',
    contactPhone: process.env.CONTACT_PHONE || '',
    legalStreet: process.env.LEGAL_STREET || '',
    legalZip: process.env.LEGAL_ZIP || '',
    legalCity: process.env.CONTACT_CITY || '',
    legalJobtitle: process.env.LEGAL_JOBTITLE || '',
    legalUstId: process.env.LEGAL_UST_ID || '',
    legalWebsite: process.env.LEGAL_WEBSITE || process.env.PROD_DOMAIN || '',
  };
}

const escAttr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const escText = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Render the full branded newsletter as a complete HTML document.
 * Output includes:
 *   - `<html><head><title>...` with subject
 *   - branded header (brand name + tagline / job title)
 *   - main content slot (the user-authored bodyHtml, untouched)
 *   - mandatory footer with legal address (Anbieterkennzeichnung), unsubscribe link
 */
export function renderNewsletterEmail(
  params: NewsletterTemplateParams,
  brand: BrandLegalData = readBrandFromEnv(),
): string {
  const { bodyHtml, subject, unsubscribeUrl, isPreview } = params;
  const brandColor = brand.brandId === 'korczewski' ? '#1f3b3b' : '#b8973a';
  const brandColorMuted = brand.brandId === 'korczewski' ? '#5b7a7a' : '#9b7e2f';

  const addressLine = [brand.legalStreet, [brand.legalZip, brand.legalCity].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');

  const previewBanner = isPreview
    ? `<div style="background:#fff3cd;border-bottom:1px solid #ffe49a;color:#664d03;padding:8px 16px;font:13px/1.4 system-ui,sans-serif;text-align:center;">
  Vorschau — diese Ansicht entspricht der versendeten E-Mail (1:1).
</div>`
    : '';

  const headerHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${brandColor};">
  <tr>
    <td style="padding:24px 32px;">
      <div style="font:600 22px/1.2 Georgia,'Newsreader',serif;color:#fff;">
        ${escText(brand.brandName)}
      </div>
      ${
        brand.legalJobtitle
          ? `<div style="font:14px/1.4 system-ui,sans-serif;color:rgba(255,255,255,0.85);margin-top:4px;">${escText(brand.legalJobtitle)}</div>`
          : ''
      }
    </td>
  </tr>
</table>`;

  // Mandatory legal footer (German UWG §6 Abs. 2 Nr. 1 + TMG §5 Anbieterkennzeichnung).
  // Includes: Name, Anschrift, Kontakt, USt-ID/Steuernummer, Berufsbezeichnung,
  // and the mandatory unsubscribe link. Address fields fall back gracefully
  // if any env var is missing — but the unsubscribe link is ALWAYS rendered.
  const footerHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ee;border-top:3px solid ${brandColor};">
  <tr>
    <td style="padding:24px 32px;font:13px/1.6 system-ui,sans-serif;color:#4a4a4a;">
      <p style="margin:0 0 12px 0;">
        Du erhältst diese E-Mail, weil du den Newsletter von
        <strong>${escText(brand.brandName)}</strong> abonniert hast.
        <a href="${escAttr(unsubscribeUrl)}" style="color:${brandColorMuted};">Hier abmelden</a>.
      </p>
      <hr style="border:none;border-top:1px solid #ddd6c8;margin:12px 0;">
      <p style="margin:0;font-size:12px;color:#6b6b6b;">
        <strong>Anbieter</strong><br>
        ${brand.contactName ? escText(brand.contactName) + '<br>' : ''}
        ${brand.legalJobtitle ? escText(brand.legalJobtitle) + '<br>' : ''}
        ${addressLine ? escText(addressLine) + '<br>' : ''}
        ${
          brand.contactEmail
            ? `E-Mail: <a href="mailto:${escAttr(brand.contactEmail)}" style="color:${brandColorMuted};">${escText(brand.contactEmail)}</a><br>`
            : ''
        }
        ${brand.contactPhone ? `Telefon: ${escText(brand.contactPhone)}<br>` : ''}
        ${brand.legalUstId ? `Steuer-Nr. / USt-ID: ${escText(brand.legalUstId)}<br>` : ''}
        ${brand.legalWebsite ? `Web: <a href="https://${escAttr(brand.legalWebsite)}" style="color:${brandColorMuted};">${escText(brand.legalWebsite)}</a>` : ''}
      </p>
    </td>
  </tr>
</table>`;

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escText(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#e8e4d8;font-family:system-ui,sans-serif;">
${previewBanner}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e8e4d8;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td>${headerHtml}</td></tr>
        <tr>
          <td style="padding:32px;font:16px/1.6 system-ui,sans-serif;color:#1a1a1a;">
            ${bodyHtml}
          </td>
        </tr>
        <tr><td>${footerHtml}</td></tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * Plain-text counterpart for the multipart/alternative `text` slot.
 * Strips HTML tags from bodyHtml and appends the legal footer + unsubscribe link.
 */
export function renderNewsletterText(
  params: NewsletterTemplateParams,
  brand: BrandLegalData = readBrandFromEnv(),
): string {
  const { bodyHtml, unsubscribeUrl } = params;
  const plain = bodyHtml.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '').trim();
  const addressLine = [brand.legalStreet, [brand.legalZip, brand.legalCity].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  return `${plain}

---
Du erhältst diese E-Mail, weil du den Newsletter von ${brand.brandName} abonniert hast.
Abmelden: ${unsubscribeUrl}

Anbieter:
${brand.contactName ? brand.contactName + '\n' : ''}${brand.legalJobtitle ? brand.legalJobtitle + '\n' : ''}${addressLine ? addressLine + '\n' : ''}${brand.contactEmail ? 'E-Mail: ' + brand.contactEmail + '\n' : ''}${brand.contactPhone ? 'Telefon: ' + brand.contactPhone + '\n' : ''}${brand.legalUstId ? 'Steuer-Nr. / USt-ID: ' + brand.legalUstId + '\n' : ''}${brand.legalWebsite ? 'Web: https://' + brand.legalWebsite : ''}`;
}
