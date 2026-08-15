export const KEEP_PER_KEY = 50;

export function idsToPrune(idsNewestFirst: number[]): number[] {
  if (idsNewestFirst.length <= KEEP_PER_KEY) return [];
  return idsNewestFirst.slice(KEEP_PER_KEY);
}
