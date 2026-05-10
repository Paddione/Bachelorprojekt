export const MAX_QUOTE_CHARS = 280;

export type QuoteValidation =
  | { ok: true }
  | { ok: false; violation: { kind: 'quote_too_long'; matchedChars: number; sample: string } };

/**
 * Returns ok=true if `candidate` does not contain a verbatim run of
 * more than MAX_QUOTE_CHARS characters from `source`. Whitespace is
 * normalized and matching is case-insensitive (lossy normalization).
 */
export function validateQuoteLength(args: { source: string; candidate: string }): QuoteValidation {
  const src = normalize(args.source);
  const cand = normalize(args.candidate);
  if (cand.length === 0) return { ok: true };

  let longestStart = 0;
  let longestLen = 0;
  for (let i = 0; i < cand.length; i++) {
    let j = 0;
    while (
      i + j < cand.length &&
      src.indexOf(cand.slice(i, i + j + 1)) !== -1 &&
      j < cand.length
    ) {
      j++;
    }
    if (j > longestLen) {
      longestLen = j;
      longestStart = i;
    }
    if (longestLen > MAX_QUOTE_CHARS) break;
  }

  if (longestLen > MAX_QUOTE_CHARS) {
    return {
      ok: false,
      violation: {
        kind: 'quote_too_long',
        matchedChars: longestLen,
        sample: cand.slice(longestStart, longestStart + Math.min(longestLen, 80)) + '…',
      },
    };
  }
  return { ok: true };
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}
