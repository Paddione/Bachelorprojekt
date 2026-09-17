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
