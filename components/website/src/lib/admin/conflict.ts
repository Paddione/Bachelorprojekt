export function isConflict(currentVersion: number | null, baseVersion: number): boolean {
  if (currentVersion === null) return baseVersion !== 0;
  return currentVersion !== baseVersion;
}

export function nextVersion(currentVersion: number | null): number {
  return (currentVersion ?? 0) + 1;
}
