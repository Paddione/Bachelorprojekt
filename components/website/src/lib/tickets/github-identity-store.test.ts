import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { applyGitHubIdentitySchema } from './tables/github-identities.ts';

const databaseUrl = process.env.GITHUB_IDENTITY_TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);
let testPool: pg.Pool;
let store: typeof import('./github-identity-store.ts');
const issue = (node: string, number: number, repositoryNodeId = 'R_a') => ({
  githubNodeId: node, kind: 'issue' as const,
  coordinate: { repositoryNodeId, owner: 'Paddione', repository: 'Bachelorprojekt', number, url: `https://github.com/Paddione/Bachelorprojekt/issues/${number}` },
});

integration('GitHub identity store (real PostgreSQL)', () => {
  beforeAll(async () => {
    testPool = new pg.Pool({ connectionString: databaseUrl });
    await testPool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE SCHEMA tickets; CREATE TABLE tickets.tickets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), external_id text NOT NULL)');
    await applyGitHubIdentitySchema(testPool);
    vi.doMock('../db-pool.ts', () => ({ pool: testPool }));
    vi.doMock('../tickets-schema.ts', () => ({ initTicketsSchema: async () => undefined }));
    store = await import('./github-identity-store.ts');
  });
  afterAll(async () => { await testPool?.end(); vi.doUnmock('../db-pool.ts'); vi.doUnmock('../tickets-schema.ts'); });
  async function ticket(externalId: string): Promise<string> { return String((await testPool.query('INSERT INTO tickets.tickets (external_id) VALUES ($1) RETURNING id', [externalId])).rows[0].id); }

  it('replays additive schema and does not bind legacy tickets', async () => {
    const legacy = await ticket('T900159'); await applyGitHubIdentitySchema(testPool); await applyGitHubIdentitySchema(testPool);
    expect((await testPool.query('SELECT * FROM tickets.work_item_refs WHERE ticket_id=$1', [legacy])).rowCount).toBe(0);
    expect((await testPool.query('SELECT external_id FROM tickets.tickets WHERE id=$1', [legacy])).rows[0].external_id).toBe('T900159');
  });
  it('enforces node, coordinate and canonical uniqueness without partial writes', async () => {
    const first = await store.registerGitHubObject(issue('I_node_1', 12));
    await expect(store.registerGitHubObject(issue('I_node_2', 12))).rejects.toMatchObject({ code: 'coordinate_conflict' });
    await expect(store.registerGitHubObject({ ...issue('I_node_1', 12), kind: 'pull_request' })).rejects.toMatchObject({ code: 'object_identity_conflict' });
    const a = await ticket('T900160'); const b = await ticket('T900161'); await store.bindWorkItemRef({ ticketId: a, objectId: first.object.id, role: 'canonical' });
    await expect(store.bindWorkItemRef({ ticketId: b, objectId: first.object.id, role: 'canonical' })).rejects.toMatchObject({ code: 'canonical_binding_conflict' });
    expect((await testPool.query("SELECT count(*)::int n FROM tickets.work_item_refs WHERE role='canonical' AND valid_until IS NULL")).rows[0].n).toBe(1);
  });
  it('handles advisory identity and coordinate transfer history', async () => {
    const advisory = await store.registerGitHubObject({ githubNodeId: 'GHSA_node', kind: 'advisory', providerNativeRef: 'ghsa-2345-2345-2345' }); expect(advisory.object.providerNativeRef).toBe('GHSA-2345-2345-2345');
    const source = await store.registerGitHubObject(issue('I_node_transfer', 13)); const moved = await store.transferGitHubObject({ objectId: source.object.id, from: { repositoryNodeId: 'R_a', number: 13 }, to: { ...issue('x', 34, 'R_b').coordinate } });
    expect(moved.previousCoordinate.validUntil).not.toBeNull(); expect(moved.currentCoordinate.repositoryNodeId).toBe('R_b'); expect((await store.resolveGitHubObject({ repositoryNodeId: 'R_a', number: 13, kind: 'issue' }))?.object.id).toBe(source.object.id);
    expect((await store.transferGitHubObject({ objectId: source.object.id, from: { repositoryNodeId: 'R_a', number: 13 }, to: { ...issue('x', 34, 'R_b').coordinate } })).changed).toBe(false);
    await expect(store.transferGitHubObject({ objectId: source.object.id, from: { repositoryNodeId: 'R_wrong', number: 99 }, to: { ...issue('x', 34, 'R_b').coordinate } })).rejects.toMatchObject({ code: 'current_coordinate_conflict' });
  });
  it('corrects a canonical issue atomically and rejects redirect cycles', async () => {
    const old = await store.registerGitHubObject(issue('I_node_old', 14)); const replacement = await store.registerGitHubObject(issue('I_node_new', 15)); const id = await ticket('T900162'); await store.bindWorkItemRef({ ticketId: id, objectId: old.object.id, role: 'canonical' });
    const corrected = await store.correctCanonicalWorkItem({ ticketId: id, currentObjectId: old.object.id, replacementObjectId: replacement.object.id, relationKind: 'duplicate_of', source: 'test', reason: 'duplicate' }); expect(corrected.alias.objectId).toBe(old.object.id); expect(corrected.canonical.objectId).toBe(replacement.object.id);
    expect((await store.correctCanonicalWorkItem({ ticketId: id, currentObjectId: old.object.id, replacementObjectId: replacement.object.id, relationKind: 'duplicate_of', source: 'test', reason: 'duplicate' })).changed).toBe(false);
    await expect(store.recordGitHubRelation({ fromObjectId: replacement.object.id, toObjectId: old.object.id, kind: 'duplicate_of', source: 'test', reason: 'cycle' })).rejects.toMatchObject({ code: 'redirect_cycle' }); expect((await testPool.query('SELECT count(*)::int n FROM tickets.github_object_relations')).rows[0].n).toBe(1);
  });
  it('rejects direct history mutation and validates delivery orientation', async () => {
    const target = await store.registerGitHubObject(issue('I_node_guard', 16)); const id = await ticket('T900163'); const ref = await store.bindWorkItemRef({ ticketId: id, objectId: target.object.id, role: 'canonical' });
    const coordinate = (await testPool.query('SELECT id FROM tickets.github_object_coordinates WHERE github_object_id=$1', [target.object.id])).rows[0].id;
    await expect(testPool.query('UPDATE tickets.github_object_coordinates SET url=$1 WHERE id=$2', ['https://invalid.example', coordinate])).rejects.toThrow(/only an open coordinate/i);
    await expect(testPool.query("UPDATE tickets.work_item_refs SET role='alias' WHERE id=$1", [ref.id])).rejects.toThrow(/only an open canonical/i);
    const pr = await store.registerGitHubObject({ githubNodeId: 'PR_node_guard', kind: 'pull_request', coordinate: { ...issue('x', 17).coordinate, url: 'https://github.com/Paddione/Bachelorprojekt/pull/17' } });
    const delivery = await store.recordGitHubRelation({ fromObjectId: pr.object.id, toObjectId: target.object.id, kind: 'implements', source: 'test' }); expect(delivery.fromObjectId).toBe(pr.object.id); expect(delivery.toObjectId).toBe(target.object.id);
    await expect(store.recordGitHubRelation({ fromObjectId: target.object.id, toObjectId: pr.object.id, kind: 'implements', source: 'test' })).rejects.toMatchObject({ code: 'relation_kind_forbidden' });
  });
  it('rejects a three-node mixed redirect cycle', async () => {
    const a = await store.registerGitHubObject(issue('I_cycle_a', 18)); const b = await store.registerGitHubObject(issue('I_cycle_b', 19)); const c = await store.registerGitHubObject(issue('I_cycle_c', 20));
    await store.recordGitHubRelation({ fromObjectId: a.object.id, toObjectId: b.object.id, kind: 'duplicate_of', source: 'test', reason: 'a-b' }); await store.recordGitHubRelation({ fromObjectId: b.object.id, toObjectId: c.object.id, kind: 'replaces', source: 'test', reason: 'b-c' });
    await expect(store.recordGitHubRelation({ fromObjectId: c.object.id, toObjectId: a.object.id, kind: 'transferred_to', source: 'test', reason: 'c-a' })).rejects.toMatchObject({ code: 'redirect_cycle' });
  });
});
