import type { Stammdaten } from './website-db';

export const STAMMDATEN_FIELDS: (keyof Stammdaten)[] =
  ['name', 'role', 'email', 'phone', 'street', 'zip', 'city', 'ustId', 'website', 'avatarInitials'];

export const STAMMDATEN_TOKENS = STAMMDATEN_FIELDS.map((f) => `{{stammdaten.${f}}}`);

const TOKEN_RE = /\{\{\s*stammdaten\.([a-zA-Z]+)\s*\}\}/g;

export function resolveTokens(html: string, sd: Partial<Stammdaten>): string {
  return html.replace(TOKEN_RE, (_m, key: string) => String(sd[key as keyof Stammdaten] ?? ''));
}

export function proposeRetokenize(html: string, sd: Partial<Stammdaten>): { result: string; replacements: { from: string; to: string }[] } {
  const replacements: { from: string; to: string }[] = [];
  let result = html;
  // Process longest values first to avoid partial overlaps
  const entries = STAMMDATEN_FIELDS
    .map((f) => ({ field: f, value: sd[f] as string }))
    .filter((e) => e.value && e.value.length > 2)
    .sort((a, b) => b.value.length - a.value.length);
  for (const { field, value } of entries) {
    const token = `{{stammdaten.${field}}}`;
    if (result.includes(value)) {
      replacements.push({ from: value, to: token });
      result = result.replaceAll(value, token);
    }
  }
  return { result, replacements };
}
