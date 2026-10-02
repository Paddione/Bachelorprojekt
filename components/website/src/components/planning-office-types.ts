// Gemeinsamer Typ fuer PlanningOffice, -Queue und -Detail (T900809).
// Vorher hatte jede Komponente eine eigene, abweichende Kopie.
export interface PlanItem {
  extId: string;
  title: string;
  type: string;
  valueProp: string | null;
  priority: string;
  effort: string | null;
  areas: string[];
  dependsOn: string[];
  rank: number | null;
  readiness: Record<string, boolean>;
  dorScore: number;
  isNextCandidate: boolean;
  pinned: boolean;
  requirementsList: string[];
  lastenheftLocked: boolean;
  triage: {
    type: string; priority: string; severity: string;
    areas: string[]; component: string | null;
    assignee_suggested: string; rationale: string;
    model: string; at: string;
  } | null;
}
