import { pool } from './website-db';
import { canLock, normalizeRequirements, isLastenheftLocked, LASTENHEFT_LOCK_KEY } from './tickets/lastenheft';

export const DOR_KEYS = [
  'spec_skizziert', 'offene_fragen_geklaert', 'abhaengigkeiten_klar', 'aufwand_geschaetzt',
] as const;
export type DorKey = (typeof DOR_KEYS)[number];
export type Readiness = Partial<Record<DorKey, boolean>>;

export interface TriageSuggestion {
  type: string; priority: string; severity: string;
  areas: string[]; component: string | null;
  assignee_suggested: string; rationale: string;
  model: string; at: string;
}

export interface OfficeItem {
  extId: string; title: string; valueProp: string | null; priority: string;
  effort: string | null; areas: string[]; dependsOn: string[];
  rank: number | null; readiness: Readiness; dorScore: number;
  isNextCandidate: boolean; pinned: boolean; createdAt: string; updatedAt: string;
  // Pflichtenheft → Lastenheft: the requirements list + derived lock state.
  requirementsList: string[]; lastenheftLocked: boolean;
  // T000933: KI-Triage-Vorschlag aus grilling_meta
  triage: TriageSuggestion | null;
}

export function dorScore(r: Readiness | null): number {
  if (!r) return 0;
  return DOR_KEYS.reduce((n, k) => n + (r[k] === true ? 1 : 0), 0);
}

interface OfficeRow {
  external_id: string;
  title: string;
  value_prop: string | null;
  priority: string;
  effort: string | null;
  areas: string[] | null;
  depends_on: string[] | null;
  planning_rank: number | null;
  readiness: Readiness | null;
  pinned: boolean | null;
  created_at: string;
  updated_at: string;
  requirements_list: string[] | null;
  grilling_meta: Record<string, unknown> | null;
}

function mapRow(row: OfficeRow): OfficeItem {
  const readiness: Readiness = row.readiness ?? {};
  const grillingMeta: Record<string, unknown> = row.grilling_meta ?? {};
  return {
    extId: row.external_id, title: row.title, valueProp: row.value_prop,
    priority: row.priority, effort: row.effort,
    areas: row.areas ?? [], dependsOn: row.depends_on ?? [],
    rank: row.planning_rank, readiness, dorScore: dorScore(readiness),
    isNextCandidate: (row.planning_rank ?? 99) === 0 && dorScore(readiness) === 4,
    pinned: row.pinned ?? false, createdAt: row.created_at, updatedAt: row.updated_at,
    requirementsList: row.requirements_list ?? [],
    lastenheftLocked: isLastenheftLocked(readiness),
    triage: (grillingMeta.triage && typeof grillingMeta.triage === 'object')
      ? grillingMeta.triage as TriageSuggestion
      : null,
  };
}

export async function listOffice(): Promise<OfficeItem[]> {
  const r = await pool.query(
    `SELECT external_id, title, value_prop, priority, effort, areas, depends_on,
            planning_rank, readiness, pinned, created_at, updated_at, requirements_list,
            grilling_meta
       FROM tickets.tickets
      WHERE type = 'feature' AND status = 'planning'
      ORDER BY pinned DESC, COALESCE(planning_rank, 2147483647), created_at`,
  );
  return r.rows.map(mapRow);
}

export interface CreateInput {
  title: string; brand: string; valueProp?: string; priority?: string;
  effort?: string; areas?: string[];
}
export async function createIdea(inp: CreateInput): Promise<string> {
  const r = await pool.query(
    `INSERT INTO tickets.tickets
       (type, brand, title, status, value_prop, priority, effort, areas, planning_rank, readiness)
     VALUES ('feature', $1, $2, 'planning', $3, COALESCE($4,'mittel'), $5, $6,
       (SELECT COALESCE(MAX(planning_rank),0)+1 FROM tickets.tickets WHERE status='planning'),
       '{}'::jsonb)
     RETURNING external_id`,
    [inp.brand, inp.title, inp.valueProp ?? null, inp.priority ?? null,
     inp.effort ?? null, inp.areas ?? null],
  );
  return r.rows[0].external_id;
}

export interface PatchInput {
  valueProp?: string; priority?: string; effort?: string;
  areas?: string[]; dependsOn?: string[]; rank?: number; readiness?: Readiness; pinned?: boolean;
  // Pflichtenheft → Lastenheft. `requirements` overwrites the list; `lastenheftLocked`
  // toggles the lock (locking needs >=1 requirement, else throws 'lastenheft_empty',
  // and forward-transitions the status into the autopilot lane).
  requirements?: string[]; lastenheftLocked?: boolean;
}
export async function patchItem(extId: string, p: PatchInput): Promise<boolean> {
  // Lock precondition: a Lastenheft may only be locked with >=1 requirement.
  if (p.lastenheftLocked === true) {
    let effective = p.requirements;
    if (effective === undefined) {
      const cur = await pool.query(
        `SELECT requirements_list FROM tickets.tickets WHERE external_id = $1 AND status = 'planning'`,
        [extId]);
      effective = cur.rows[0]?.requirements_list ?? [];
    }
    if (!canLock(effective)) throw new Error('lastenheft_empty');
  }

  const sets: string[] = []; const vals: unknown[] = []; let i = 1;
  const add = (col: string, v: unknown) => { sets.push(`${col} = $${i++}`); vals.push(v); };
  if (p.valueProp !== undefined) add('value_prop', p.valueProp);
  if (p.priority !== undefined) add('priority', p.priority);
  if (p.effort !== undefined) add('effort', p.effort);
  if (p.areas !== undefined) add('areas', p.areas);
  if (p.dependsOn !== undefined) add('depends_on', p.dependsOn);
  if (p.rank !== undefined) add('planning_rank', p.rank);
  if (p.pinned !== undefined) add('pinned', p.pinned);
  if (p.requirements !== undefined) add('requirements_list', normalizeRequirements(p.requirements));
  // Accumulate all readiness changes (DOR flags + lock flag) into ONE JSONB merge,
  // so toggling a DOR checkbox never clobbers lastenheft_locked and vice-versa.
  const readinessMerge: Record<string, boolean> = {};
  if (p.readiness !== undefined)
    for (const k of DOR_KEYS) if (p.readiness[k] !== undefined) readinessMerge[k] = !!p.readiness[k];
  if (p.lastenheftLocked !== undefined) readinessMerge[LASTENHEFT_LOCK_KEY] = p.lastenheftLocked;
  if (Object.keys(readinessMerge).length) {
    sets.push(`readiness = COALESCE(readiness, '{}'::jsonb) || $${i++}::jsonb`);
    vals.push(JSON.stringify(readinessMerge));
  }
  // Locking releases the ticket into the autopilot lane; forward-only, never regresses.
  if (p.lastenheftLocked === true)
    sets.push(`status = CASE WHEN status IN ('triage','planning','plan_staged') THEN 'backlog' ELSE status END`);

  if (!sets.length) return false;
  vals.push(extId);
  const r = await pool.query(
    `UPDATE tickets.tickets SET ${sets.join(', ')}, updated_at = now()
      WHERE external_id = $${i} AND status = 'planning'`,
    vals,
  );
  return (r.rowCount ?? 0) > 0;
}

export async function promoteItem(extId: string, override: boolean): Promise<{ ok: boolean; reason?: string }> {
  const r = await pool.query(
    `SELECT id, title, value_prop, priority, effort, areas, depends_on, readiness
       FROM tickets.tickets WHERE external_id = $1 AND status = 'planning'`,
    [extId],
  );
  const t = r.rows[0];
  if (!t) return { ok: false, reason: 'not_found' };
  if (!override && dorScore(t.readiness) < 4) return { ok: false, reason: 'dor_incomplete' };

  await pool.query(`UPDATE tickets.tickets SET planning_rank = 0, updated_at = now() WHERE id = $1`, [t.id]);
  const ctx = [
    `DEVFLOW-PLAN-CONTEXT`,
    `Titel: ${t.title}`,
    `Kern-Nutzen: ${t.value_prop ?? '—'}`,
    `Priorität: ${t.priority} · Aufwand: ${t.effort ?? '—'}`,
    `Bereiche: ${(t.areas ?? []).join(', ') || '—'}`,
    `Abhängigkeiten: ${(t.depends_on ?? []).join(', ') || '—'}`,
  ].join('\n');
  await pool.query(
    `INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
     VALUES ($1, 'planning-office', $2, 'internal')`,
    [t.id, ctx],
  );
  return { ok: true };
}

export async function officeCount(): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM tickets.tickets WHERE type='feature' AND status='planning'`,
  );
  return r.rows[0]?.n ?? 0;
}

// Löscht alle nicht-gepinnten planning-Ideen — wird vor jedem neuen Ideengenerierungslauf
// aufgerufen, damit nur explizit bewahrte Ideen erhalten bleiben.
export async function cleanupEphemeral(): Promise<number> {
  const r = await pool.query(
    `DELETE FROM tickets.tickets
      WHERE status = 'planning' AND pinned = false
     RETURNING id`,
  );
  return r.rowCount ?? 0;
}

export const CLARIFY_EFFORTS = ['klein', 'mittel', 'gross'] as const;

export async function clarifyItem(
  extId: string,
  commentBody: string,
  readinessUpdates: Partial<Record<DorKey, boolean>>,
  opts?: { dependsOn?: string[]; effort?: string },
): Promise<boolean> {
  const r = await pool.query(
    `SELECT id FROM tickets.tickets WHERE external_id = $1 AND status = 'planning'`,
    [extId],
  );
  const id = r.rows[0]?.id;
  if (!id) return false;

  if (commentBody && commentBody.trim() !== '') {
    await pool.query(
      `INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
       VALUES ($1, 'planning-office', $2, 'internal')`,
      [id, commentBody],
    );
  }

  const clean: Readiness = {};
  for (const k of DOR_KEYS) if (readinessUpdates[k] !== undefined) clean[k] = !!readinessUpdates[k];
  if (Object.keys(clean).length > 0) {
    await pool.query(
      `UPDATE tickets.tickets SET readiness = readiness || $1::jsonb, updated_at = now() WHERE id = $2`,
      [JSON.stringify(clean), id],
    );
  }

  if (opts?.dependsOn && opts.dependsOn.length > 0) {
    await pool.query(
      `UPDATE tickets.tickets SET depends_on = $1, updated_at = now() WHERE id = $2`,
      [opts.dependsOn, id],
    );
  }

  if (opts?.effort) {
    await pool.query(
      `UPDATE tickets.tickets SET effort = $1, updated_at = now() WHERE id = $2`,
      [opts.effort, id],
    );
  }

  return true;
}

// ── T000933: Triage apply/discard ─────────────────────────────────────────

const VALID_TYPES = ['bug', 'feature', 'task', 'project'];
const VALID_PRIORITIES = ['hoch', 'mittel', 'niedrig'];
const VALID_SEVERITIES = ['critical', 'major', 'minor', 'trivial'];

export async function applyTriage(extId: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT grilling_meta FROM tickets.tickets
      WHERE external_id = $1 AND status = 'planning'`,
    [extId],
  );
  const triage = r.rows[0]?.grilling_meta?.triage;
  if (!triage || typeof triage !== 'object') return false;

  const t = triage as Record<string, unknown>;
  const type = t.type; const priority = t.priority; const severity = t.severity;
  const areas = t.areas; const component = t.component;

  if (typeof type !== 'string' || !VALID_TYPES.includes(type)) return false;
  if (typeof priority !== 'string' || !VALID_PRIORITIES.includes(priority)) return false;
  if (typeof severity !== 'string' || !VALID_SEVERITIES.includes(severity)) return false;
  if (areas !== undefined && areas !== null && !Array.isArray(areas)) return false;
  if (component !== undefined && component !== null && typeof component !== 'string') return false;

  const res = await pool.query(
    `UPDATE tickets.tickets
        SET type = $1, priority = $2, severity = $3,
            areas = $4, component = $5, updated_at = now()
      WHERE external_id = $6 AND status = 'planning'`,
    [type, priority, severity, areas ?? null, component ?? null, extId],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function discardTriage(extId: string): Promise<boolean> {
  const res = await pool.query(
    `UPDATE tickets.tickets
        SET grilling_meta = grilling_meta - 'triage', updated_at = now()
      WHERE external_id = $1 AND status = 'planning'
        AND grilling_meta ? 'triage'`,
    [extId],
  );
  return (res.rowCount ?? 0) > 0;
}
