export interface ScrubOptions { names: string[]; emails?: string[]; replacement: string; }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Case-insensitive, Unicode/Umlaut-safe, word-boundary scrub of client PII. */
export function scrubClientPii(text: string, opts: ScrubOptions): string {
  const { names, emails = [], replacement } = opts;
  // Build token set: full names + name components ≥ 3 chars; longest first so a full
  // name is replaced before its parts (avoids leaving a dangling half).
  const nameTokens = new Set<string>();
  for (const n of names) {
    const trimmed = n.trim();
    if (trimmed.length >= 3) nameTokens.add(trimmed);
    for (const part of trimmed.split(/\s+/)) if (part.length >= 3) nameTokens.add(part);
  }
  let out = text;
  const sorted = [...nameTokens].sort((a, b) => b.length - a.length);
  for (const tok of sorted) {
    // Unicode letter/number boundaries so "Beispielhannes" ⊉ "Hannes".
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(tok)}(?![\\p{L}\\p{N}])`, 'giu');
    out = out.replace(re, replacement);
  }
  for (const email of emails) {
    if (!email.trim()) continue;
    out = out.replace(new RegExp(escapeRe(email.trim()), 'gi'), replacement);
  }
  return out;
}
