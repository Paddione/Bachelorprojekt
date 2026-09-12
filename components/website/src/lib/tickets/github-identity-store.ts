import type { PoolClient } from 'pg';
import { pool } from '../db-pool.ts';
import { initTicketsSchema } from '../tickets-schema.ts';
import type { GitHubNumberedObjectKind, GitHubObjectKind } from './github-reference.ts';

export type WorkItemRefRole = 'canonical' | 'alias';
export type GitHubRelationKind = 'implements' | 'closes' | 'duplicate_of' | 'replaces' | 'transferred_to';
export type RedirectRelationKind = Exclude<GitHubRelationKind, 'implements' | 'closes'>;
export interface GitHubCoordinateInput { repositoryNodeId: string; owner: string; repository: string; number: number; url: string; }
export interface GitHubObjectRecord { id: string; githubNodeId: string; kind: GitHubObjectKind; providerNativeRef: string | null; createdAt: Date; }
export interface GitHubCoordinateRecord extends GitHubCoordinateInput { id: string; objectId: string; validFrom: Date; validUntil: Date | null; }
export interface WorkItemRefRecord { id: string; ticketId: string; objectId: string; role: WorkItemRefRole; validFrom: Date; validUntil: Date | null; reason: string | null; }
export interface GitHubRelationRecord { id: string; fromObjectId: string; toObjectId: string; kind: GitHubRelationKind; source: string; reason: string | null; createdAt: Date; }
export type GitHubIdentityStoreErrorCode = 'invalid_input' | 'data_integrity' | 'object_identity_conflict' | 'coordinate_conflict' | 'object_not_found' | 'ticket_not_found' | 'canonical_kind_forbidden' | 'canonical_binding_conflict' | 'current_coordinate_conflict' | 'provider_reference_conflict' | 'relation_conflict' | 'relation_kind_forbidden' | 'relation_self_edge' | 'redirect_cycle' | 'canonical_binding_missing';
export class GitHubIdentityStoreError extends Error { constructor(readonly code: GitHubIdentityStoreErrorCode, message: string) { super(message); } }
export interface RegisterNumberedGitHubObjectInput { githubNodeId: string; kind: GitHubNumberedObjectKind; providerNativeRef?: never; coordinate: GitHubCoordinateInput; observedAt?: Date; }
export interface RegisterAdvisoryGitHubObjectInput { githubNodeId: string; kind: 'advisory'; providerNativeRef: string; coordinate?: never; observedAt?: Date; }
export type RegisterGitHubObjectInput = RegisterNumberedGitHubObjectInput | RegisterAdvisoryGitHubObjectInput;
export interface RegisterGitHubObjectResult { object: GitHubObjectRecord; coordinate: GitHubCoordinateRecord | null; created: boolean; }
export interface ResolveGitHubObjectInput { repositoryNodeId: string; number: number; kind: GitHubNumberedObjectKind; }
export interface ResolvedGitHubObject { object: GitHubObjectRecord; matchedCoordinate: GitHubCoordinateRecord; currentCoordinate: GitHubCoordinateRecord; }
export interface BindWorkItemRefInput { ticketId: string; objectId: string; role: WorkItemRefRole; reason?: string; effectiveAt?: Date; }
export interface RecordDeliveryRelationInput { fromObjectId: string; toObjectId: string; kind: 'implements' | 'closes'; source: string; reason?: string; createdAt?: Date; }
export interface RecordRedirectRelationInput { fromObjectId: string; toObjectId: string; kind: RedirectRelationKind; source: string; reason: string; createdAt?: Date; }
export type RecordGitHubRelationInput = RecordDeliveryRelationInput | RecordRedirectRelationInput;
export interface TransferGitHubObjectInput { objectId: string; from: Pick<GitHubCoordinateInput, 'repositoryNodeId' | 'number'>; to: GitHubCoordinateInput; observedAt?: Date; }
export interface TransferGitHubObjectResult { object: GitHubObjectRecord; previousCoordinate: GitHubCoordinateRecord; currentCoordinate: GitHubCoordinateRecord; changed: boolean; }
export interface CorrectCanonicalWorkItemInput { ticketId: string; currentObjectId: string; replacementObjectId: string; relationKind: RedirectRelationKind; source: string; reason: string; correctedAt?: Date; }
export interface CorrectCanonicalWorkItemResult { previousCanonical: WorkItemRefRecord; alias: WorkItemRefRecord; canonical: WorkItemRefRecord; relation: GitHubRelationRecord; changed: boolean; }

type Row = Record<string, unknown>;
const objectOf = (r: Row): GitHubObjectRecord => ({ id: String(r.id), githubNodeId: String(r.github_node_id), kind: r.kind as GitHubObjectKind, providerNativeRef: r.provider_ref as string | null, createdAt: new Date(String(r.created_at)) });
const coordinateOf = (r: Row): GitHubCoordinateRecord => ({ id: String(r.id), objectId: String(r.github_object_id), repositoryNodeId: String(r.repository_node_id), owner: String(r.repository_owner), repository: String(r.repository_name), number: Number(r.object_number), url: String(r.url), validFrom: new Date(String(r.valid_from)), validUntil: r.valid_until ? new Date(String(r.valid_until)) : null });
const bindingOf = (r: Row): WorkItemRefRecord => ({ id: String(r.id), ticketId: String(r.ticket_id), objectId: String(r.github_object_id), role: r.role as WorkItemRefRole, validFrom: new Date(String(r.valid_from)), validUntil: r.valid_until ? new Date(String(r.valid_until)) : null, reason: r.reason as string | null });
const relationOf = (r: Row): GitHubRelationRecord => ({ id: String(r.id), fromObjectId: String(r.from_object_id), toObjectId: String(r.to_object_id), kind: r.kind as GitHubRelationKind, source: String(r.source), reason: r.reason as string | null, createdAt: new Date(String(r.created_at)) });
function domain(code: GitHubIdentityStoreErrorCode, message: string): never { throw new GitHubIdentityStoreError(code, message); }
function pgError(error: unknown, fallback: GitHubIdentityStoreErrorCode): never {
  if (error instanceof GitHubIdentityStoreError) throw error;
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (code === '23505') domain(fallback, 'GitHub identity uniqueness constraint failed');
  throw error;
}
async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> { await initTicketsSchema(); const client = await pool.connect(); try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } }
async function getObject(client: PoolClient, id: string): Promise<GitHubObjectRecord> { const q = await client.query('SELECT * FROM tickets.github_objects WHERE id=$1 FOR UPDATE', [id]); if (!q.rows[0]) domain('object_not_found', 'GitHub object was not found'); return objectOf(q.rows[0]); }
async function currentCoordinate(client: PoolClient, objectId: string): Promise<GitHubCoordinateRecord> { const q = await client.query('SELECT * FROM tickets.github_object_coordinates WHERE github_object_id=$1 AND valid_until IS NULL FOR UPDATE', [objectId]); if (q.rows.length !== 1) domain('data_integrity', 'GitHub object must have exactly one current coordinate'); return coordinateOf(q.rows[0]); }

export async function registerGitHubObject(input: RegisterGitHubObjectInput): Promise<RegisterGitHubObjectResult> { return transaction(async client => {
  if (!input.githubNodeId.trim()) domain('invalid_input', 'GitHub node ID is required');
  const ref = input.kind === 'advisory' ? input.providerNativeRef.toUpperCase() : null;
  if (input.kind === 'advisory' && !ref) domain('invalid_input', 'Advisory provider reference is required');
  const found = await client.query('SELECT * FROM tickets.github_objects WHERE github_node_id=$1 FOR UPDATE', [input.githubNodeId]);
  if (found.rows[0]) {
    const object = objectOf(found.rows[0]);
    if (object.kind !== input.kind || object.providerNativeRef !== ref) domain('object_identity_conflict', 'GitHub node ID is immutable');
    const incomingCoordinate = input.kind === 'advisory' ? undefined : input.coordinate;
    const coordinate = incomingCoordinate ? await currentCoordinate(client, object.id) : null;
    if (coordinate && incomingCoordinate && (coordinate.repositoryNodeId !== incomingCoordinate.repositoryNodeId || coordinate.number !== incomingCoordinate.number)) domain('current_coordinate_conflict', 'Use transferGitHubObject for a coordinate change');
    return { object, coordinate, created: false };
  }
  try {
    const inserted = await client.query('INSERT INTO tickets.github_objects (github_node_id,kind,provider_ref) VALUES ($1,$2,$3) RETURNING *', [input.githubNodeId, input.kind, ref]);
    const object = objectOf(inserted.rows[0]);
    if (input.kind === 'advisory') return { object, coordinate: null, created: true };
    const c = input.coordinate; const at = input.observedAt ?? new Date();
    const coordinate = await client.query('INSERT INTO tickets.github_object_coordinates (github_object_id,repository_node_id,repository_owner,repository_name,object_number,url,valid_from) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [object.id,c.repositoryNodeId,c.owner,c.repository,c.number,c.url,at]);
    return { object, coordinate: coordinateOf(coordinate.rows[0]), created: true };
  } catch (error) { pgError(error, input.kind === 'advisory' ? 'provider_reference_conflict' : 'coordinate_conflict'); }
}); }

export async function resolveGitHubObject(input: ResolveGitHubObjectInput): Promise<ResolvedGitHubObject | null> { return transaction(async client => {
  const q = await client.query(`SELECT o.*, c.id coordinate_id, c.github_object_id coordinate_object_id, c.repository_node_id, c.repository_owner, c.repository_name, c.object_number, c.url, c.valid_from, c.valid_until FROM tickets.github_object_coordinates c JOIN tickets.github_objects o ON o.id=c.github_object_id WHERE c.repository_node_id=$1 AND c.object_number=$2 AND o.kind=$3`, [input.repositoryNodeId,input.number,input.kind]);
  if (!q.rows.length) return null; if (q.rows.length !== 1) domain('data_integrity', 'Coordinate resolves to multiple objects');
  const row = q.rows[0] as Row; const matched = coordinateOf({ ...row, id: row.coordinate_id, github_object_id: row.coordinate_object_id }); const object = objectOf(row); return { object, matchedCoordinate: matched, currentCoordinate: await currentCoordinate(client, object.id) };
}); }

export async function bindWorkItemRef(input: BindWorkItemRefInput): Promise<WorkItemRefRecord> { return transaction(async client => {
  const object = await getObject(client, input.objectId); if (object.kind === 'pull_request') domain('canonical_kind_forbidden', 'Pull requests cannot be work items');
  const ticket = await client.query('SELECT id FROM tickets.tickets WHERE id=$1 FOR UPDATE', [input.ticketId]); if (!ticket.rows[0]) domain('ticket_not_found', 'Ticket was not found');
  if (input.role === 'alias' && !input.reason?.trim()) domain('invalid_input', 'Aliases require a reason');
  const existing = await client.query('SELECT * FROM tickets.work_item_refs WHERE ticket_id=$1 AND github_object_id=$2 AND role=$3 AND valid_until IS NULL', [input.ticketId,input.objectId,input.role]); if (existing.rows[0]) return bindingOf(existing.rows[0]);
  if (input.role === 'canonical') { const collision = await client.query("SELECT id FROM tickets.work_item_refs WHERE (ticket_id=$1 OR github_object_id=$2) AND role='canonical' AND valid_until IS NULL", [input.ticketId,input.objectId]); if (collision.rows[0]) domain('canonical_binding_conflict', 'Current canonical binding already exists'); }
  try { const q = await client.query('INSERT INTO tickets.work_item_refs (ticket_id,github_object_id,role,reason,valid_from) VALUES ($1,$2,$3,$4,$5) RETURNING *', [input.ticketId,input.objectId,input.role,input.reason ?? null,input.effectiveAt ?? new Date()]); return bindingOf(q.rows[0]); } catch (error) { pgError(error, 'canonical_binding_conflict'); }
}); }

async function assertRelation(client: PoolClient, input: RecordGitHubRelationInput): Promise<void> { if (input.fromObjectId === input.toObjectId) domain('relation_self_edge', 'Relation cannot point to itself'); const [from,to] = await Promise.all([getObject(client,input.fromObjectId),getObject(client,input.toObjectId)]); if ((input.kind === 'implements' || input.kind === 'closes') && (from.kind !== 'pull_request' || !['issue','advisory'].includes(to.kind))) domain('relation_kind_forbidden', 'Delivery relations require PR to Issue/Advisory'); if (input.kind !== 'implements' && input.kind !== 'closes' && from.kind !== to.kind) domain('relation_kind_forbidden', 'Redirect relations require like object kinds'); }
export async function recordGitHubRelation(input: RecordGitHubRelationInput): Promise<GitHubRelationRecord> { return transaction(async client => { await assertRelation(client,input); if (input.kind !== 'implements' && input.kind !== 'closes') { const cycle = await client.query(`WITH RECURSIVE walk(id) AS (SELECT $1::uuid UNION SELECT r.to_object_id FROM tickets.github_object_relations r JOIN walk w ON r.from_object_id=w.id WHERE r.kind IN ('duplicate_of','replaces','transferred_to')) SELECT 1 FROM walk WHERE id=$2`, [input.toObjectId,input.fromObjectId]); if (cycle.rows[0]) domain('redirect_cycle', 'Redirect relation would create a cycle'); }
  const old = await client.query('SELECT * FROM tickets.github_object_relations WHERE from_object_id=$1 AND to_object_id=$2 AND kind=$3', [input.fromObjectId,input.toObjectId,input.kind]); if (old.rows[0]) { const same = old.rows[0].source === input.source && old.rows[0].reason === (input.reason ?? null); if (!same) domain('relation_conflict', 'Relation replay changes provenance'); return relationOf(old.rows[0]); }
  const q = await client.query('INSERT INTO tickets.github_object_relations (from_object_id,to_object_id,kind,source,reason,created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [input.fromObjectId,input.toObjectId,input.kind,input.source,input.reason ?? null,input.createdAt ?? new Date()]); return relationOf(q.rows[0]);
}); }

export async function transferGitHubObject(input: TransferGitHubObjectInput): Promise<TransferGitHubObjectResult> { return transaction(async client => { const object = await getObject(client,input.objectId); if (object.kind === 'advisory') domain('invalid_input', 'Advisories do not have coordinates'); const previous = await currentCoordinate(client,object.id); const destination = input.to; if (previous.repositoryNodeId === destination.repositoryNodeId && previous.number === destination.number) return { object, previousCoordinate: previous, currentCoordinate: previous, changed: false }; if (previous.repositoryNodeId !== input.from.repositoryNodeId || previous.number !== input.from.number) domain('current_coordinate_conflict','Transfer source is not current'); const occupied = await client.query('SELECT github_object_id FROM tickets.github_object_coordinates WHERE repository_node_id=$1 AND object_number=$2 AND valid_until IS NULL FOR UPDATE',[destination.repositoryNodeId,destination.number]); if (occupied.rows[0]) domain('coordinate_conflict','Destination coordinate is already occupied'); const at=input.observedAt ?? new Date(); await client.query('UPDATE tickets.github_object_coordinates SET valid_until=$1 WHERE id=$2',[at,previous.id]); const q=await client.query('INSERT INTO tickets.github_object_coordinates (github_object_id,repository_node_id,repository_owner,repository_name,object_number,url,valid_from) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',[object.id,destination.repositoryNodeId,destination.owner,destination.repository,destination.number,destination.url,at]); return { object, previousCoordinate: { ...previous, validUntil: at }, currentCoordinate: coordinateOf(q.rows[0]), changed:true }; }); }

export async function correctCanonicalWorkItem(input: CorrectCanonicalWorkItemInput): Promise<CorrectCanonicalWorkItemResult> { return transaction(async client => { if (!input.reason.trim()) domain('invalid_input','Correction requires a reason'); await client.query("SELECT pg_advisory_xact_lock(hashtext('tickets:github-identity-redirects'))"); const priorQ=await client.query("SELECT * FROM tickets.work_item_refs WHERE ticket_id=$1 AND role='canonical' AND valid_until IS NULL FOR UPDATE",[input.ticketId]); if (!priorQ.rows[0]) domain('canonical_binding_missing','Current canonical binding is missing'); const prior=bindingOf(priorQ.rows[0]); if (prior.objectId !== input.currentObjectId) domain('canonical_binding_conflict','Current canonical binding changed'); const replacement=await getObject(client,input.replacementObjectId); if (replacement.kind === 'pull_request') domain('canonical_kind_forbidden','Pull request cannot become canonical'); await assertRelation(client,{...input,fromObjectId:input.currentObjectId,toObjectId:input.replacementObjectId,kind:input.relationKind}); const at=input.correctedAt ?? new Date(); await client.query('UPDATE tickets.work_item_refs SET valid_until=$1 WHERE id=$2',[at,prior.id]); const aliasQ=await client.query('INSERT INTO tickets.work_item_refs (ticket_id,github_object_id,role,reason,valid_from) VALUES ($1,$2,$3,$4,$5) RETURNING *',[input.ticketId,input.currentObjectId,'alias',input.reason,at]); const canonicalQ=await client.query('INSERT INTO tickets.work_item_refs (ticket_id,github_object_id,role,valid_from) VALUES ($1,$2,$3,$4) RETURNING *',[input.ticketId,input.replacementObjectId,'canonical',at]); const relation=await recordRelationInTransaction(client,{fromObjectId:input.currentObjectId,toObjectId:input.replacementObjectId,kind:input.relationKind,source:input.source,reason:input.reason,createdAt:at}); return {previousCanonical:{...prior,validUntil:at},alias:bindingOf(aliasQ.rows[0]),canonical:bindingOf(canonicalQ.rows[0]),relation,changed:true}; }); }
async function recordRelationInTransaction(client: PoolClient,input: RecordGitHubRelationInput): Promise<GitHubRelationRecord> { const cycle=await client.query(`WITH RECURSIVE walk(id) AS (SELECT $1::uuid UNION SELECT r.to_object_id FROM tickets.github_object_relations r JOIN walk w ON r.from_object_id=w.id WHERE r.kind IN ('duplicate_of','replaces','transferred_to')) SELECT 1 FROM walk WHERE id=$2`,[input.toObjectId,input.fromObjectId]); if(cycle.rows[0]) domain('redirect_cycle','Redirect relation would create a cycle'); const q=await client.query('INSERT INTO tickets.github_object_relations (from_object_id,to_object_id,kind,source,reason,created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',[input.fromObjectId,input.toObjectId,input.kind,input.source,input.reason ?? null,input.createdAt ?? new Date()]); return relationOf(q.rows[0]); }
