import data from './learning-assets.generated.json';

type AssetType = 'illustration' | 'icon' | 'diagram' | 'motion' | 'sfx' | 'voice' | 'ambient';
export type Register = 'technical' | 'coaching' | 'neutral';
export type Tone = 'active' | 'calm';

interface AssetEntry {
  id: string;
  type: AssetType;
  register: Register;
  tone: Tone;
  concept: string[];
  guideItem?: string;
  formats: { svg?: string; svgInline?: string; webp?: string; lottie?: string; ogg?: string; vtt?: string };
  brandable: false | { tokens: string[] };
  a11y: { alt?: string; caption?: string; transcript?: string };
  provenance: { source: string; license: string; attribution: string | null };
  reducedMotion?: string | null;
}

interface AssetQuery {
  type?: AssetType;
  register?: Register;
  tone?: Tone;
  concept?: string;
  guideItem?: string;
}

const assets: AssetEntry[] = (data.assets ?? []) as AssetEntry[];
const byId = new Map(assets.map((a) => [a.id, a]));

export function queryAssets(q: AssetQuery): AssetEntry[] {
  return assets.filter(
    (a) =>
      (q.type ? a.type === q.type : true) &&
      (q.register ? a.register === q.register : true) &&
      (q.tone ? a.tone === q.tone : true) &&
      (q.guideItem ? a.guideItem === q.guideItem : true) &&
      (q.concept ? a.concept.includes(q.concept) : true),
  );
}

export function getAsset(sel: string | AssetQuery): AssetEntry | null {
  if (typeof sel === 'string') return byId.get(sel) ?? null;
  return queryAssets(sel)[0] ?? null;
}
