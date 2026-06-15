/**
 * Deterministic video ID generation — shared between client and server.
 *
 * ID = sha256(rootKey + ':' + relativePath), truncated to 36 hex chars.
 *
 * This ensures the same physical file always gets the same ID regardless
 * of whether it was first scanned by the client or the server.
 */

/**
 * Generate a deterministic video ID from rootKey and relative path.
 * Uses Web Crypto API (works in both browsers and Node.js 18+).
 */
export async function generateVideoId(rootKey: string, relativePath: string): Promise<string> {
  const input = `${rootKey}:${relativePath}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  const hashHex = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.slice(0, 36);
}

/**
 * Synchronous version for server-side only.
 * Accepts the Node.js crypto module as a parameter to avoid dynamic require/import.
 *
 * Usage: generateVideoIdSync(crypto, 'movies', 'SomeDir/video.mp4')
 */
export function generateVideoIdSync(
  cryptoModule: { createHash(alg: string): { update(data: string): { digest(enc: string): string } } },
  rootKey: string,
  relativePath: string,
): string {
  return cryptoModule.createHash('sha256').update(`${rootKey}:${relativePath}`).digest('hex').slice(0, 36);
}
