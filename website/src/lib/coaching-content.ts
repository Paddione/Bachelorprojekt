// ── Coaching Website Content ──────────────────────────────────────────────────
// Liest aus service_config (getEffectiveServices) damit Änderungen
// sofort auf /coaching sichtbar sind.

import { getServiceConfig } from './website-db';
import { config } from '../config/index';

export interface CoachingProcessStep {
  step: string;
  title: string;
  text: string;
}

export interface CoachingFaqItem {
  question: string;
  answer: string;
}

export interface CoachingContent {
  subheadline: string;
  headline: string;
  intro: string;
  forWhom: string[];
  process: CoachingProcessStep[];
  ctaText: string;
  ctaHref: string;
  faq: CoachingFaqItem[];
}

const SLUG = 'coaching';

const DEFAULT_COACHING: CoachingContent = {
  subheadline: 'Coaching & Begleitung',
  headline: 'Gemeinsam weiter.',
  intro: 'Coaching bedeutet für mich: auf Augenhöhe arbeiten, ehrlich sein und nachhaltige Veränderung ermöglichen.',
  forWhom: [
    'Führungskräfte in Veränderungsprozessen',
    'Menschen, die beruflich neu ausrichten möchten',
    'Teams, die besser zusammenarbeiten wollen',
  ],
  process: [
    { step: '01 — Erstgespräch', title: 'Kennenlernen', text: '30 Minuten, kostenlos. Wir klären Ihre Situation und Ihre Herausforderung.' },
    { step: '02 — Klarheit', title: 'Zieldefinition', text: 'Gemeinsam entscheiden wir: Was ist das richtige Format, was der richtige Rahmen?' },
    { step: '03 — Begleitung', title: 'Arbeitsphase', text: 'Individuelle Sessions in Ihrem Tempo – online oder vor Ort.' },
    { step: '04 — Transfer', title: 'Nachhaltigkeit', text: 'Was Sie hier lernen, bleibt bei Ihnen. Nicht als Wissen, sondern als Haltung.' },
  ],
  ctaText: 'Kostenloses Erstgespräch buchen',
  ctaHref: '/termin',
  faq: [],
};

/**
 * Liest den Service-Override für 'coaching' aus service_config
 * und wandelt ihn in CoachingContent um.
 */
export async function getEffectiveCoaching(brand: string): Promise<CoachingContent> {
  try {
    const overrides = await getServiceConfig(brand);
    const svc = overrides?.find(o => o.slug === SLUG);
    const pc = svc?.pageContent;

    if (!pc) return DEFAULT_COACHING;

    // Sections → Process-Steps
    const process: CoachingProcessStep[] = (pc.sections ?? []).length > 0
      ? (pc.sections ?? []).map(s => {
          const parts = s.title.split(' — ');
          return {
            step: parts[0] ?? s.title,
            title: parts[1] ?? '',
            text: s.items[0] ?? '',
          };
        })
      : DEFAULT_COACHING.process;

    return {
      subheadline: DEFAULT_COACHING.subheadline,
      headline: pc.headline ?? DEFAULT_COACHING.headline,
      intro: pc.intro ?? DEFAULT_COACHING.intro,
      forWhom: pc.forWhom ?? DEFAULT_COACHING.forWhom,
      process,
      ctaText: pc.pricing?.[0]?.label ?? DEFAULT_COACHING.ctaText,
      ctaHref: '/termin',
      faq: pc.faq ?? DEFAULT_COACHING.faq,
    };
  } catch {
    return DEFAULT_COACHING;
  }
}
