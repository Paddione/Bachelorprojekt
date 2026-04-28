// Leitweg-ID nach Spezifikation der Koordinierungsstelle für IT-Standards (KoSIT) v2.0.2:
// <Grobadressierung>[-<Feinadressierung>]-<Prüfziffer>
//   Grobadressierung: 2..12 Zeichen, [A-Z0-9]
//   Feinadressierung: 1..30 Zeichen, erstes [A-Z0-9], danach [A-Z0-9._-] (optional, mit eigenem Bindestrich davor)
//   Prüfziffer: genau 2 Ziffern
// Gesamtlänge inkl. Trennstriche: max 46 Zeichen.
const LEITWEG_RE = /^[A-Z0-9]{2,12}(-[A-Z0-9][A-Z0-9._-]{0,29})?-\d{2}$/;

export interface LeitwegResult { ok: boolean; reason?: string }

export function formatLeitwegId(raw: string): string {
  return raw.trim().toUpperCase();
}

export function validateLeitwegId(raw: string | null | undefined): LeitwegResult {
  if (!raw) return { ok: false, reason: 'leer' };
  const v = formatLeitwegId(raw);
  if (v.length > 46) return { ok: false, reason: 'länger als 46 Zeichen' };
  if (!LEITWEG_RE.test(v)) return { ok: false, reason: 'Format ungültig' };
  return { ok: true };
}
