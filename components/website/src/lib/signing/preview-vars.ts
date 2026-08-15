import { renderTemplate } from './template-renderer';

/** Mock placeholder values used for admin template previews (no real customer data). */
export const MOCK_PREVIEW_VARS: Record<string, string> = (() => {
  const now = new Date();
  return {
    KUNDENNAME: 'Max Mustermann',
    KUNDENNUMMER: 'K-001',
    EMAIL: 'max@beispiel.de',
    TELEFON: '+49 000 000 0000',
    FIRMA: 'Muster GmbH',
    VORNAME: 'Max',
    NACHNAME: 'Mustermann',
    DATUM: now.toLocaleDateString('de-DE'),
    JAHR: String(now.getFullYear()),
  };
})();

/**
 * Substitute every placeholder in `html` with the supplied vars.
 * Handles both fixed `{{KEY}}` and editable `{{EDIT:KEY}}` placeholders,
 * flattening editable fields to plain text (no <input> elements in a PDF preview).
 */
export function substituteTemplatePlaceholders(
  html: string,
  vars: Record<string, string>,
): string {
  const rendered = renderTemplate(html, vars, vars);
  return rendered.replace(
    /<input[^>]*name="([A-Z_]+)"[^>]*value="([^"]*)"[^>]*\/>/g,
    (_m, _name, value) => value,
  );
}

export interface CustomerVarsInput {
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  customer_number?: string | null;
}

/** Map a customer row to the template-variable keys used by contract templates. */
export function buildCustomerVars(c: CustomerVarsInput): Record<string, string> {
  const parts = (c.name ?? '').trim().split(/\s+/);
  const vorname = parts[0] ?? '';
  const nachname = parts.length > 1 ? parts.slice(1).join(' ') : '';
  const now = new Date();
  return {
    KUNDENNAME: c.name ?? '',
    KUNDENNUMMER: c.customer_number ?? '',
    EMAIL: c.email ?? '',
    TELEFON: c.phone ?? '',
    FIRMA: c.company ?? '',
    VORNAME: vorname,
    NACHNAME: nachname,
    DATUM: now.toLocaleDateString('de-DE'),
    JAHR: String(now.getFullYear()),
  };
}
