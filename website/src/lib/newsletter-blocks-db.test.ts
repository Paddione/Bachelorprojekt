import { describe, it, expect, beforeAll } from 'vitest';
import { newDb, DataType } from 'pg-mem';
import type { Pool } from 'pg';
import {
  listContentBlocks,
  getContentBlock,
  createContentBlock,
  updateContentBlock,
  deleteContentBlock,
} from './newsletter-blocks-db';

let pool: Pool;

beforeAll(async () => {
  // noAstCoverageCheck: pg-mem throws on CREATE TABLE IF NOT EXISTS when the
  // table already exists (re-parses inline constraints on the skipped stmt).
  // Real Postgres is fine; this flag relaxes pg-mem's strict AST coverage check.
  const db = newDb({ noAstCoverageCheck: true });
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    impure: true,
    implementation: () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      }),
  });
  const { Pool: PgMemPool } = db.adapters.createPg();
  pool = new PgMemPool() as unknown as Pool;
});

describe('createContentBlock + listContentBlocks', () => {
  it('creates a block and lists it', async () => {
    const block = await createContentBlock(
      { title: 'Willkommens-Header', block_type: 'header', html_body: '<h1>Hallo!</h1>' },
      pool,
    );
    expect(block.id).toBeTruthy();
    expect(block.title).toBe('Willkommens-Header');
    expect(block.block_type).toBe('header');
    expect(block.html_body).toBe('<h1>Hallo!</h1>');

    const list = await listContentBlocks(pool);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some(b => b.id === block.id)).toBe(true);
  });

  it('creates multiple blocks of different types', async () => {
    await createContentBlock({ title: 'CTA-Block', block_type: 'cta', html_body: '<a>Jetzt buchen</a>' }, pool);
    await createContentBlock({ title: 'Footer-Gruss', block_type: 'footer', html_body: '<p>MfG</p>' }, pool);
    const list = await listContentBlocks(pool);
    expect(list.length).toBeGreaterThanOrEqual(3);
  });
});

describe('getContentBlock', () => {
  it('returns a block by id', async () => {
    const created = await createContentBlock(
      { title: 'Angebot-Block', block_type: 'angebot', html_body: '<div>Angebot</div>' },
      pool,
    );
    const fetched = await getContentBlock(created.id, pool);
    expect(fetched).not.toBeNull();
    expect(fetched!.title).toBe('Angebot-Block');
  });

  it('returns null for unknown id', async () => {
    const result = await getContentBlock('00000000-0000-4000-8000-000000000000', pool);
    expect(result).toBeNull();
  });
});

describe('updateContentBlock', () => {
  it('updates title and html_body', async () => {
    const block = await createContentBlock(
      { title: 'Alt', block_type: 'text', html_body: '<p>alt</p>' },
      pool,
    );
    const updated = await updateContentBlock(
      block.id,
      { title: 'Neu', html_body: '<p>neu</p>' },
      pool,
    );
    expect(updated).not.toBeNull();
    expect(updated!.title).toBe('Neu');
    expect(updated!.html_body).toBe('<p>neu</p>');
    expect(updated!.block_type).toBe('text'); // unchanged
  });

  it('returns null for unknown id', async () => {
    const result = await updateContentBlock(
      '00000000-0000-4000-8000-000000000001',
      { title: 'X' },
      pool,
    );
    expect(result).toBeNull();
  });
});

describe('deleteContentBlock', () => {
  it('removes the block so it no longer appears in list', async () => {
    const block = await createContentBlock(
      { title: 'Zu löschen', block_type: 'text', html_body: '<p>bye</p>' },
      pool,
    );
    await deleteContentBlock(block.id, pool);
    const fetched = await getContentBlock(block.id, pool);
    expect(fetched).toBeNull();
  });
});
