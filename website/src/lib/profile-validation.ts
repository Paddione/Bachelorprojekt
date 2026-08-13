// Pure validation logic for the self-service customer profile API (T003144).
// Import-free leaf module: no DB, no Vite/Astro APIs — must stay loadable under
// plain tsx/node so tests/unit/portal-profile-update.bats runs offline.
// Re-exported from customer-crm-db.ts to keep that module's public API identical.

export const CONTACT_CHANNELS = ['email', 'phone', 'portal'] as const;
export const COMM_FREQUENCIES = ['wöchentlich', 'zweiwöchentlich', 'monatlich', 'bei_bedarf'] as const;
export const CUSTOMER_STATUSES = ['aktiv', 'inaktiv', 'potentiell', 'pausiert', 'abgeschlossen'] as const;
export const CONTACT_TYPES = ['email', 'phone', 'meeting', 'note'] as const;

export type ContactChannel = typeof CONTACT_CHANNELS[number];
export type CommFrequency = typeof COMM_FREQUENCIES[number];
export type CustomerStatus = typeof CUSTOMER_STATUSES[number];
export type ContactType = typeof CONTACT_TYPES[number];

export interface ProfileInput {
  phone?: string;
  company?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  preferred_contact_channel?: string;
  communication_frequency?: string;
  bio?: string;
}

const MAXLEN: Record<keyof ProfileInput, number> = {
  phone: 30, company: 100, address: 200, city: 100, postal_code: 10,
  country: 2, preferred_contact_channel: 20, communication_frequency: 20, bio: 500,
};

export function validateProfileInput(input: ProfileInput): { ok: true } | { ok: false; error: string } {
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string') return { ok: false, error: `${k}: ungültiger Typ` };
    const max = MAXLEN[k as keyof ProfileInput];
    if (max && v.length > max) return { ok: false, error: `${k}: zu lang (max. ${max} Zeichen)` };
  }
  if (input.preferred_contact_channel && !CONTACT_CHANNELS.includes(input.preferred_contact_channel as ContactChannel))
    return { ok: false, error: 'Ungültiger Kontaktkanal.' };
  if (input.communication_frequency && !COMM_FREQUENCIES.includes(input.communication_frequency as CommFrequency))
    return { ok: false, error: 'Ungültige Kommunikationsfrequenz.' };
  return { ok: true };
}
