// website/src/lib/tickets-db.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// We assert against the SOURCE of initTicketsSchema(): the inert pg_notify trigger
// is present, fires only on feature inserts, and is explicitly marked NOT-CONSUMED.
// As of T001155 (G-RH01 Batch 2), the inert plumbing lives in
// `tickets/migrations.ts` (the legacy-migrations module owns the deprecated
// trigger function + drop/create pair). As of T001172 (G-CQ07 cycle #1),
// initTicketsSchema itself lives in `tickets-schema.ts`; tickets-db.ts is a
// thin facade that re-exports it and must not duplicate the body.
const THIS_DIR = dirname(fileURLToPath(import.meta.url))
const SCHEMA_SRC = readFileSync(resolve(THIS_DIR, 'tickets-schema.ts'), 'utf8')
const MIGRATIONS_SRC = readFileSync(resolve(THIS_DIR, 'tickets/migrations.ts'), 'utf8')
const ALL_SRC = SCHEMA_SRC + '\n' + MIGRATIONS_SRC

describe('factory: inert pg_notify trigger on feature inserts', () => {
  it('creates the notify function and trigger', () => {
    expect(ALL_SRC).toContain('CREATE OR REPLACE FUNCTION tickets.notify_feature_inserted')
    expect(ALL_SRC).toContain('factory_feature_inserted') // NOTIFY channel name
  })

  it('fires AFTER INSERT only for type=feature', () => {
    expect(ALL_SRC).toMatch(/AFTER INSERT ON tickets\.tickets/)
    expect(ALL_SRC).toMatch(/WHEN \(NEW\.type = 'feature'\)/)
  })

  it('documents that the trigger is NOT consumed in Phase 3', () => {
    // Load-bearing: keep the carve-out comment so nobody wires a phantom consumer.
    expect(ALL_SRC).toMatch(/NOT[- ]CONSUMED|not consumed in (P3|Phase 3)/i)
  })

  it('tickets-schema.ts still calls applyLegacyMigrations(pool) so the trigger installs', () => {
    // Regression guard for the G-RH01 Batch 2 + G-CQ07 cycle #1 splits: the
    // inert pg_notify plumbing is in tickets/migrations.ts now, and
    // initTicketsSchema() lives in tickets-schema.ts. Without this call,
    // initTicketsSchema would skip it and the trigger would never be installed.
    // The module takes `pool` as a parameter (no longer imports from website-db)
    // to break the import cycle that the monolithic file had implicitly avoided.
    expect(SCHEMA_SRC).toMatch(/applyLegacyMigrations\s*\(\s*pool\s*\)/)
  })
})
