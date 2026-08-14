// http(s)-Scheme-Allowlist für user-kontrollierte URLs (T005901).
// Wird vom WissenHub-Link-Rendering UND der crawl-config-API-Validierung geteilt.
export function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
