import type { SignatureData } from './types';

const EDITABLE_PATTERN = /\{\{EDIT:([A-Z_]+)\}\}/g;
const FIXED_PATTERN = (key: string) => new RegExp(`\\{\\{${key}\\}\\}`, 'g');

/** Escapes user-controlled text for HTML sinks (F3: PDF-HTML wird von
 *  Chromium gerendert — unescapte Eingaben wären XSS/SSRF). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Nur echte Bild-data-URLs sind als Signaturbild erlaubt — alles andere
 *  (z. B. `javascript:`-URIs) wird verworfen. */
const SAFE_IMAGE_RE = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;

export function safeSignatureImage(imageData: string | undefined): string | null {
  if (!imageData) return null;
  return SAFE_IMAGE_RE.test(imageData) ? imageData : null;
}

export function renderTemplate(
  htmlBody: string,
  fixedVars: Record<string, string>,
  editableDefaults: Record<string, string> = {}
): string {
  let html = htmlBody;

  // Substitute fixed variables
  for (const [key, value] of Object.entries(fixedVars)) {
    html = html.replace(FIXED_PATTERN(key), value);
  }

  // Render editable fields as styled inputs
  html = html.replace(EDITABLE_PATTERN, (_match, fieldName) => {
    const defaultValue = editableDefaults[fieldName] ?? '';
    return `<input
      class="doc-edit-field"
      name="${fieldName}"
      value="${escapeHtml(defaultValue)}"
      style="border:none;border-bottom:1px solid #666;background:transparent;font:inherit;width:auto;min-width:120px;padding:0 2px"
    />`;
  });

  return html;
}

export function embedSignature(
  html: string,
  signatureData: SignatureData,
  editableValues: Record<string, string> = {}
): string {
  // Finalise editable field substitutions (replace inputs with plain text).
  // Werte stammen aus User-Input und werden immer escapet; bereits gerenderte
  // <input>-Felder waren bei renderTemplate schon escapet und bleiben unverändert.
  let finalHtml = html.replace(EDITABLE_PATTERN, (_match, fieldName) => {
    return escapeHtml(editableValues[fieldName] ?? '');
  });
  // Also replace any remaining <input> edit fields (in case renderTemplate was called)
  finalHtml = finalHtml.replace(
    /<input[^>]*name="([A-Z_]+)"[^>]*value="([^"]*)"[^>]*\/>/g,
    (_match, _name, value) => `<span>${value}</span>`
  );

  const safeImage = safeSignatureImage(signatureData.imageData);
  const sigVisual =
    signatureData.type === 'canvas' && safeImage
      ? `<img src="${safeImage}" style="display:block;max-width:200px;height:60px;border-bottom:1px solid #000;margin-bottom:4px" alt="Unterschrift" />`
      : `<span style="font-style:italic">✓ Elektronisch bestätigt</span>`;

  const ts = new Date(signatureData.signedAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });

  const block = `
<div class="signature-block" style="border-top:2px solid #ccc;margin-top:40px;padding-top:16px;font-family:sans-serif;font-size:13px">
  <p style="margin:0 0 8px 0"><strong>Elektronische Unterschrift</strong></p>
  ${sigVisual}
  <p style="margin:4px 0 0 0;color:#555">${escapeHtml(signatureData.signerName)} &nbsp;·&nbsp; ${ts} &nbsp;·&nbsp; IP: ${escapeHtml(signatureData.ip)}</p>
</div>`;

  return finalHtml + block;
}
