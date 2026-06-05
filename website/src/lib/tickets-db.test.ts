// website/src/lib/tickets-db.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// We assert against the SOURCE of initTicketsSchema(): the inert pg_notify trigger
// is present, fires only on feature inserts, and is explicitly marked NOT-CONSUMED.
const SRC = readFileSync(
  fileURLToPath(new URL('./tickets-db.ts', import.meta.url)),
  'utf8',
)

describe('factory: inert pg_notify trigger on feature inserts', () => {
  it('creates the notify function and trigger', () => {
    expect(SRC).toContain('CREATE OR REPLACE FUNCTION tickets.notify_feature_inserted')
    expect(SRC).toContain('factory_feature_inserted') // NOTIFY channel name
  })

  it('fires AFTER INSERT only for type=feature', () => {
    expect(SRC).toMatch(/AFTER INSERT ON tickets\.tickets/)
    expect(SRC).toMatch(/WHEN \(NEW\.type = 'feature'\)/)
  })

  it('documents that the trigger is NOT consumed in Phase 3', () => {
    // Load-bearing: keep the carve-out comment so nobody wires a phantom consumer.
    expect(SRC).toMatch(/NOT[- ]CONSUMED|not consumed in (P3|Phase 3)/i)
  })
})
