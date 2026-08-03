import type { OfficeItem, DorKey } from './planning-office';

export interface ClarificationField {
  key: string;
  label: string;
  type: 'text' | 'radio' | 'checkboxes';
  options?: string[];
  multiline?: boolean;
}

export interface ClarificationSection {
  title: string;
  dorFlag: DorKey;
  fields: ClarificationField[];
}

const isReady = (item: OfficeItem, flag: DorKey): boolean => item.readiness?.[flag] === true;

const AREA_QUESTIONS: Record<string, ClarificationField[]> = {
  brett: [
    { key: 'brett_rollen', label: 'Betroffene Rollen?', type: 'checkboxes', options: ['Leiter', 'Teilnehmer', 'Zuschauer'] },
    { key: 'brett_mobile', label: 'Mobile-Support?', type: 'radio', options: ['Pflicht', 'Nice-to-have', 'Nein'] },
    { key: 'brett_disconnect', label: 'Verbindungsabbruch-Verhalten?', type: 'radio', options: ['Auto-Retry', 'Manuell', 'Egal'] },
  ],
  website: [
    { key: 'web_pages', label: 'Welche Seiten/Routen sind betroffen?', type: 'text' },
    { key: 'web_auth', label: 'Login/Admin-geschützt?', type: 'radio', options: ['Öffentlich', 'Login', 'Admin'] },
  ],
  chat: [
    { key: 'chat_realtime', label: 'Echtzeit-Anforderung?', type: 'radio', options: ['WebSocket', 'Polling', 'Egal'] },
    { key: 'chat_scope', label: 'Betroffene Chat-Bereiche?', type: 'text' },
  ],
  infra: [
    { key: 'infra_brands', label: 'Beide Brands betroffen?', type: 'radio', options: ['Beide', 'Nur mentolder', 'Nur korczewski'] },
    { key: 'infra_deploy', label: 'Deploy-Auswirkung?', type: 'text' },
  ],
  auth: [
    { key: 'auth_flow', label: 'Betroffener Auth-Flow?', type: 'radio', options: ['OIDC/Keycloak', 'Admin-Passwort', 'Session'] },
    { key: 'auth_scope', label: 'Welche Rollen/Claims?', type: 'text' },
  ],
  ai: [
    { key: 'ai_model', label: 'Modell-Klasse?', type: 'radio', options: ['Embedding', 'Chat', 'Rerank'] },
    { key: 'ai_fallback', label: 'Cloud-Fallback erlaubt?', type: 'radio', options: ['Ja', 'Nein'] },
  ],
};

const GENERIC_OPEN: ClarificationField[] = [
  { key: 'open_questions', label: 'Welche offenen Fragen gibt es?', type: 'text', multiline: true },
  { key: 'open_acceptance', label: 'Wann gilt das Feature als fertig (Akzeptanz)?', type: 'text', multiline: true },
];

export function deriveSections(item: OfficeItem): ClarificationSection[] {
  const sections: ClarificationSection[] = [];

  if (!isReady(item, 'abhaengigkeiten_klar')) {
    sections.push({
      title: 'Abhängigkeiten',
      dorFlag: 'abhaengigkeiten_klar',
      fields: [
        { key: 'abhaengigkeiten', label: 'Welche Tickets müssen vorher fertig sein?', type: 'text' },
        { key: 'externe_abh', label: 'Externe Dienste nötig?', type: 'radio', options: ['Keine', 'DB-Schema', 'Sealed-Secret', 'OIDC-Client', 'Sonstige'] },
      ],
    });
  }

  if (!isReady(item, 'spec_skizziert')) {
    sections.push({
      title: 'Spec-Skizze',
      dorFlag: 'spec_skizziert',
      fields: [
        { key: 'spec_kernflow', label: 'Kern-Flow / Hauptablauf?', type: 'text', multiline: true },
        { key: 'spec_notscope', label: 'Was ist explizit NICHT im Scope?', type: 'text', multiline: true },
      ],
    });
  }

  if (!isReady(item, 'offene_fragen_geklaert')) {
    const areas = (item.areas ?? []).filter(Boolean);
    if (areas.length === 0) {
      sections.push({ title: 'Offene Fragen', dorFlag: 'offene_fragen_geklaert', fields: GENERIC_OPEN });
    } else {
      for (const area of areas) {
        const fields = AREA_QUESTIONS[area] ?? GENERIC_OPEN;
        sections.push({ title: `Offene Fragen (${area})`, dorFlag: 'offene_fragen_geklaert', fields });
      }
    }
  }

  if (!isReady(item, 'aufwand_geschaetzt')) {
    sections.push({
      title: 'Aufwand',
      dorFlag: 'aufwand_geschaetzt',
      fields: [{ key: 'effort', label: 'Aufwand?', type: 'radio', options: ['klein', 'mittel', 'gross'] }],
    });
  }

  return sections;
}

export function buildCommentBody(
  answers: Record<string, string | string[]>,
  labels: Record<string, string>,
  date: string,
): string {
  const rows: string[] = [];
  for (const [key, raw] of Object.entries(answers)) {
    const val = Array.isArray(raw) ? raw.join(', ') : (raw ?? '');
    if (!val || val.trim() === '') continue;
    const label = labels[key] ?? key;
    rows.push(`| ${label} | ${val} |`);
  }
  return [
    `## Klärungsrunde ${date}`,
    '',
    '| Frage | Antwort |',
    '|-------|---------|',
    ...rows,
  ].join('\n');
}
