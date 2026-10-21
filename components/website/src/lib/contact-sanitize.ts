export interface ContactInput {
  name?: string;
  email?: string;
  phone?: string | null;
  type?: string;
  message?: string;
}

export interface SanitizedContactData {
  name: string;
  email: string;
  phone: string | null;
  type: string;
  message: string;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function sanitizeContactInput(input: ContactInput): { data?: SanitizedContactData; error?: string } {
  const name = (input.name ?? '').trim().replace(/[\r\n\t]+/g, ' ').slice(0, 100);
  const email = (input.email ?? '').trim().slice(0, 254);
  const phone = input.phone ? String(input.phone).trim().replace(/[\r\n\t]+/g, '').slice(0, 50) : null;
  const message = (input.message ?? '').trim().slice(0, 5000);
  const type = (input.type ?? 'allgemein').trim().slice(0, 50);

  if (!name || !email || !message) {
    return { error: 'Bitte füllen Sie alle Pflichtfelder aus.' };
  }

  // RFC compliant basic email validation and rejection of header injection attempts
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\r\n]/.test(email)) {
    return { error: 'Bitte geben Sie eine gültige E-Mail-Adresse an.' };
  }

  return {
    data: {
      name,
      email,
      phone,
      type,
      message,
    },
  };
}
