// ── Führung & Persönlichkeit – Website-Inhalt ─────────────────────────────
// Verwaltet den editierbaren Inhalt der /fuehrung-persoenlichkeit-Seite.

import { getSiteSetting, setSiteSetting } from './website-db';

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
  /** Optionaler zweiter Einleitungs-Absatz (persönliche Notiz o.ä.) */
  introNote: string;
  forWhom: string[];
  process: FuehrungProcessStep[];
  ctaText: string;
  ctaHref: string;
  faq: FuehrungFaqItem[];
}

const DEFAULT_FUEHRUNG: FuehrungContent = {
  subheadline: 'Führung & Persönlichkeit',
  headline: 'Führen aus der Mitte.',
  intro:
    'Gute Führung beginnt nicht mit Methoden. Sie beginnt mit Haltung. Ich begleite Führungskräfte, die verstehen wollen, wer sie als Führungsperson sind – und wer sie sein möchten.',
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

export async function getFuehrungContent(brand: string): Promise<FuehrungContent | null> {
  const raw = await getSiteSetting(brand, 'fuehrung_page').catch(() => null);
  if (!raw) return null;
  try { return JSON.parse(raw) as FuehrungContent; } catch { return null; }
}

export async function saveFuehrungContent(brand: string, data: FuehrungContent): Promise<void> {
  await setSiteSetting(brand, 'fuehrung_page', JSON.stringify(data));
}

export async function getEffectiveFuehrung(brand: string): Promise<FuehrungContent> {
  const db = await getFuehrungContent(brand).catch(() => null);
  return db ?? DEFAULT_FUEHRUNG;
}
