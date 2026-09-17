// brett/src/client/ui/applications-board.ts — Phase 4 (T900233)
//
// Applications Kanban board. The view-model builder is PURE (no DOM) so it
// is unit-testable under node/tsx — Vorbild: ui/lobby.ts buildLobbyViewModel.
// No top-level DOM/`window` access.

export interface ApplicationCard {
  id: number;
  company: string;
  role_title: string;
  dossier_count: number;
}

export type ApplicationStatus = 'found' | 'drafting' | 'applied' | 'interviewing' | 'offered';

export type ApplicationsData = Record<ApplicationStatus, ApplicationCard[]>;

export interface ApplicationsColumn {
  status: ApplicationStatus;
  label: string;
  cards: ApplicationCard[];
}

export interface ApplicationsBoardViewModel {
  columns: ApplicationsColumn[];
}

export interface ApplicationsBoardHandlers {
  onSubmitTimeline: (jobId: number, eventType: string, notes: string) => Promise<void>;
}

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  found: 'Gefunden',
  drafting: 'In Erstellung',
  applied: 'Beworben',
  interviewing: 'Interview',
  offered: 'Angebot',
};

const STATUS_ORDER: ApplicationStatus[] = ['found', 'drafting', 'applied', 'interviewing', 'offered'];

/**
 * Pure: derive the Kanban board render-model from the grouped applications
 * data returned by GET /api/applications. Every status yields a column, even
 * when it has zero cards, so the board layout never shifts.
 */
export function renderApplicationsBoard(data: ApplicationsData): ApplicationsBoardViewModel {
  const columns: ApplicationsColumn[] = STATUS_ORDER.map((status) => ({
    status,
    label: STATUS_LABEL[status],
    cards: data[status] ?? [],
  }));
  return { columns };
}

/** Mount the operator-facing Kanban with one timeline-note form per job card. */
export function mountApplicationsBoard(
  container: HTMLElement,
  data: ApplicationsData,
  handlers: ApplicationsBoardHandlers,
): void {
  container.replaceChildren();
  const heading = document.createElement('h1');
  heading.textContent = 'Bewerbungs-Cockpit';
  const back = document.createElement('a');
  back.href = '/';
  back.textContent = '← Zurück zum Brett';
  const board = document.createElement('div');
  board.className = 'applications-board';

  for (const column of renderApplicationsBoard(data).columns) {
    const columnElement = document.createElement('section');
    columnElement.className = 'applications-board__column';
    const title = document.createElement('h2');
    title.textContent = column.label;
    columnElement.appendChild(title);
    for (const card of column.cards) columnElement.appendChild(createApplicationCard(card, handlers));
    board.appendChild(columnElement);
  }
  container.append(heading, back, board);
}

function createApplicationCard(card: ApplicationCard, handlers: ApplicationsBoardHandlers): HTMLElement {
  const element = document.createElement('article');
  element.className = 'applications-board__card';
  const title = document.createElement('h3');
  title.textContent = card.company;
  const role = document.createElement('p');
  role.textContent = `${card.role_title} · ${card.dossier_count} Dossiers`;
  const form = document.createElement('form');
  const eventType = document.createElement('input');
  eventType.name = 'event_type';
  eventType.required = true;
  eventType.maxLength = 100;
  eventType.placeholder = 'Ereignis, z. B. interview_feedback';
  const notes = document.createElement('textarea');
  notes.name = 'notes';
  notes.maxLength = 10_000;
  notes.placeholder = 'Notiz oder Feedback';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Timeline-Eintrag speichern';
  form.append(eventType, notes, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      await handlers.onSubmitTimeline(card.id, eventType.value, notes.value);
      form.reset();
    } finally {
      submit.disabled = false;
    }
  });
  element.append(title, role, form);
  return element;
}

export function applicationsBoardCss(): string {
  return [
    '#brett-applications{position:fixed;inset:0;z-index:300;overflow:auto;padding:32px;background:var(--brett-ink-900,#0b111c);color:var(--brett-fg);}',
    '#brett-applications[hidden]{display:none;}',
    '.applications-board{display:grid;grid-template-columns:repeat(5,minmax(220px,1fr));gap:16px;margin-top:24px;align-items:start;}',
    '.applications-board__column{padding:12px;border:1px solid var(--brett-brass);border-radius:8px;background:var(--brett-ink-800);}',
    '.applications-board__column h2{font-size:16px;margin:0 0 12px;}',
    '.applications-board__card{padding:12px;margin:8px 0;background:var(--brett-ink-900);border-radius:6px;}',
    '.applications-board__card h3,.applications-board__card p{margin:0 0 8px;}',
    '.applications-board__card form{display:grid;gap:8px;}',
    '.applications-board__card input,.applications-board__card textarea{width:100%;box-sizing:border-box;}',
    '@media(max-width:900px){.applications-board{grid-template-columns:1fr;}}',
  ].join('\n');
}

const APPLICATIONS_STYLE_ID = 'brett-applications-styles';

export function injectApplicationsBoardStyles(doc: Document = document): void {
  let style = doc.getElementById(APPLICATIONS_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = APPLICATIONS_STYLE_ID;
    doc.head.appendChild(style);
  }
  style.textContent = applicationsBoardCss();
}
