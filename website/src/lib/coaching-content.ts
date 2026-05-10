// ── Coaching Website Content ──────────────────────────────────────────────────
// Separate from coaching-db.ts (which handles the coaching knowledge pipeline).
// This module manages the editable content of the /coaching page via the admin.

import { getSiteSetting, setSiteSetting } from './website-db';

export interface CoachingProcessStep {
  step: string;   // e.g. "01 — Erstgespräch"
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

export async function getCoachingContent(brand: string): Promise<CoachingContent | null> {
  const raw = await getSiteSetting(brand, 'coaching_page').catch(() => null);
  if (!raw) return null;
  try { return JSON.parse(raw) as CoachingContent; } catch { return null; }
}

export async function saveCoachingContent(brand: string, data: CoachingContent): Promise<void> {
  await setSiteSetting(brand, 'coaching_page', JSON.stringify(data));
}

export async function getEffectiveCoaching(brand: string): Promise<CoachingContent> {
  const db = await getCoachingContent(brand).catch(() => null);
  return db ?? DEFAULT_COACHING;
}
