import { describe, it, expect } from 'vitest';
import { validateLeitwegId, formatLeitwegId } from './leitweg';

describe('validateLeitwegId', () => {
  it('akzeptiert Grobadressierung + Prüfziffer (Bund-Beispiel)', () => {
    expect(validateLeitwegId('991-01234-44').ok).toBe(true);
  });
  it('akzeptiert Grob-Fein-Prüfziffer mit alphanumerischer Feinadresse', () => {
    expect(validateLeitwegId('04011000-1234512345-06').ok).toBe(true);
  });
  it('lehnt ab bei fehlender Prüfziffer', () => {
    expect(validateLeitwegId('991-01234').ok).toBe(false);
  });
  it('lehnt ab bei Länge > 46', () => {
    expect(validateLeitwegId('9'.repeat(47)).ok).toBe(false);
  });
  it('lehnt ab bei nicht-zifferigen Prüfziffern', () => {
    expect(validateLeitwegId('991-01234-AB').ok).toBe(false);
  });
  it('formatLeitwegId trimmt und uppercased Feinadresse', () => {
    expect(formatLeitwegId('  991-abc-12  ')).toBe('991-ABC-12');
  });
});
