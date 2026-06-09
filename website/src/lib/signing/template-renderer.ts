import type { SignatureData } from './types';

const EDITABLE_PATTERN = /\{\{EDIT:([A-Z_]+)\}\}/g;
const FIXED_PATTERN = (key: string) => new RegExp(`\\{\\{${key}\\}\\}`, 'g');

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
      value="${defaultValue.replace(/"/g, '&quot;')}"
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
  // Finalise editable field substitutions (replace inputs with plain text)
  let finalHtml = html.replace(EDITABLE_PATTERN, (_match, fieldName) => {
    return editableValues[fieldName] ?? '';
  });
  // Also replace any remaining <input> edit fields (in case renderTemplate was called)
  finalHtml = finalHtml.replace(
    /<input[^>]*name="([A-Z_]+)"[^>]*value="([^"]*)"[^>]*\/>/g,
    (_match, _name, value) => `<span>${value}</span>`
  );

  const sigVisual =
    signatureData.type === 'canvas' && signatureData.imageData
      ? `<img src="${signatureData.imageData}" style="display:block;max-width:200px;height:60px;border-bottom:1px solid #000;margin-bottom:4px" alt="Unterschrift" />`
      : `<span style="font-style:italic">✓ Elektronisch bestätigt</span>`;

  const ts = new Date(signatureData.signedAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });

  const block = `
<div class="signature-block" style="border-top:2px solid #ccc;margin-top:40px;padding-top:16px;font-family:sans-serif;font-size:13px">
  <p style="margin:0 0 8px 0"><strong>Elektronische Unterschrift</strong></p>
  ${sigVisual}
  <p style="margin:4px 0 0 0;color:#555">${signatureData.signerName} &nbsp;·&nbsp; ${ts} &nbsp;·&nbsp; IP: ${signatureData.ip}</p>
</div>`;

  return finalHtml + block;
}
