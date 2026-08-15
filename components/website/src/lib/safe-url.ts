// website/src/lib/safe-url.ts
// T005900: Wächter gegen Stored-XSS über Link-Schemata. Ein Wert darf nur dann
// als <a href> gerendert werden, wenn er eine http/https-URL ist. Alles andere
// (javascript:, data:, vbscript:, Nicht-URLs, non-strings) ergibt null, damit
// aus dem Wert kein klickbarer Link gebaut werden kann.
//
// Reines URL-Parsing — kein Node-only-Code, deshalb im Client-Bundle sicher
// (vgl. knowledge-db-types.ts zur Server/Client-Trennung).

export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
    return null;
  } catch {
    return null;
  }
}
