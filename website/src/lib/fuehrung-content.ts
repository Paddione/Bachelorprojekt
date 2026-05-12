// ── Führung & Persönlichkeit – Website-Inhalt ─────────────────────────────
// Liest aus service_config (getEffectiveServices) damit Änderungen
// sofort auf /fuehrung-persoenlichkeit sichtbar sind.

import { getServiceConfig } from './website-db';
import { config } from '../config/index';

export interface FuehrungProcessStep {
  step: string;
  title: string;
  text: string;
}

export interface FuehrungFaqItem {
  question: string;
  answer: string;
}

export interface FuehrungContent {
  subheadline: string;
  headline: string;
  intro: string;
  introNote: string;
  forWhom: string[];
  process: FuehrungProcessStep[];
  ctaText: string;
  ctaHref: string;
  faq: FuehrungFaqItem[];
}

const SLUG = 'fuehrung-persoenlichkeit';

const DEFAULT_FUEHRUNG: FuehrungContent = {
  subheadline: 'Führung & Persönlichkeit',
  headline: 'Führen aus der Mitte.',
  intro: 'Gute Führung beginnt nicht mit Methoden. Sie beginnt mit Haltung. Ich begleite Führungskräfte, die verstehen wollen, wer sie als Führungsperson sind – und wer sie sein möchten.',
  introNote:
    'Meine Tochter ist Führungskraft. Wir sprechen regelmäßig und offen über die Realität, die Frauen in Führungspositionen erleben – trotz aller Fortschritte. Das hat meinen Blick geschärft.\n\nWenn ich Frauen in Führung begleite, geht es mir nicht darum, ihnen einen männlichen Führungsstil beizubringen. Sondern darum, ihren eigenen zu stärken – und die Strukturen zu verstehen, in denen sie sich bewegen.',
  forWhom: [
    'Frauen und Männer in Führung – seit Jahren in Verantwortung',
    'Frauen und Männer in Führung – gerade neu in der Rolle',
    'Menschen in Führung, die merken: Technik und Strategie allein reichen nicht.',
  ],
  process: [
    { step: '01 — Standortbestimmung', title: 'Wer bin ich als Führungsperson?', text: 'Wir schauen auf Ihre Haltung, Ihre Muster, Ihre Stärken – und auf das, was Sie vielleicht noch nicht sehen.' },
    { step: '02 — Klarheit', title: 'Was möchte ich verändern?', text: 'Gemeinsam definieren wir, wo Sie hinwollen – und was Sie dafür brauchen.' },
    { step: '03 — Begleitung', title: 'Der Weg dorthin', text: 'Individuelle Sessions – ehrlich, direkt, auf Augenhöhe.' },
    { step: '04 — Transfer', title: 'Wirkung in der Praxis', text: 'Was Sie hier entwickeln, wirkt in Ihrem Alltag – in Meetings, Entscheidungen, Gesprächen.' },
  ],
  ctaText: 'Kostenloses Erstgespräch buchen',
  ctaHref: '/termin',
  faq: [],
};

/**
 * Liest den Service-Override für 'fuehrung-persoenlichkeit' aus service_config
 * und wandelt ihn in FuehrungContent um. Fällt auf Defaults zurück wenn nichts
 * in der DB steht.
 */
export async function getEffectiveFuehrung(brand: string): Promise<FuehrungContent> {
  try {
    const overrides = await getServiceConfig(brand);
    const svc = overrides?.find(o => o.slug === SLUG);
    const staticSvc = config.services.find(s => s.slug === SLUG);
    const pc = svc?.pageContent;

    if (!pc) return DEFAULT_FUEHRUNG;

    // introNote: erster Section-Eintrag mit Titel '__introNote__'
    const introNoteSection = pc.sections?.find(s => s.title === '__introNote__');
    const introNote = introNoteSection?.items?.join('\n\n') ?? DEFAULT_FUEHRUNG.introNote;

    // Restliche Sections → Process-Steps
    const processSections = (pc.sections ?? []).filter(s => s.title !== '__introNote__');
    const process: FuehrungProcessStep[] = processSections.length > 0
      ? processSections.map(s => {
          const parts = s.title.split(' — ');
          return {
            step: parts[0] ?? s.title,
            title: parts[1] ?? '',
            text: s.items[0] ?? '',
          };
        })
      : DEFAULT_FUEHRUNG.process;

    return {
      subheadline: DEFAULT_FUEHRUNG.subheadline,
      headline: pc.headline ?? DEFAULT_FUEHRUNG.headline,
      intro: pc.intro ?? DEFAULT_FUEHRUNG.intro,
      introNote,
      forWhom: pc.forWhom ?? DEFAULT_FUEHRUNG.forWhom,
      process,
      ctaText: pc.pricing?.[0]?.label ?? DEFAULT_FUEHRUNG.ctaText,
      ctaHref: staticSvc?.pageContent?.faqTitle ?? '/termin',
      faq: pc.faq ?? DEFAULT_FUEHRUNG.faq,
    };
  } catch {
    return DEFAULT_FUEHRUNG;
  }
}

/** Legacy: direkt in site_settings schreiben (jetzt über API/save) */
export type { FuehrungContent as default };
