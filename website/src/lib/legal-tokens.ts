import type { Stammdaten } from './website-db';

export const STAMMDATEN_FIELDS: (keyof Stammdaten)[] =
  ['name', 'role', 'email', 'phone', 'street', 'zip', 'city', 'ustId', 'website', 'avatarInitials'];

export const STAMMDATEN_TOKENS = STAMMDATEN_FIELDS.map((f) => `{{stammdaten.${f}}}`);

const TOKEN_RE = /\{\{\s*stammdaten\.([a-zA-Z]+)\s*\}\}/g;

export function resolveTokens(html: string, sd: Partial<Stammdaten>): string {
  return html.replace(TOKEN_RE, (_m, key: string) => String((sd as any)?.[key] ?? ''));
}
