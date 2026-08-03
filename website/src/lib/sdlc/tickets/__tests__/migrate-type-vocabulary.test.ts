import { describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import { applyTypeVocabularyMigration, TICKET_TYPES } from '../../../tickets/migrate-type-vocabulary.ts';

// Fake-Pool statt echter DB: geprüft wird die REIHENFOLGE der abgesetzten
// Statements, und die ist der eigentliche Fallstrick — ein UPDATE vor dem
// erweiterten CHECK scheitert am noch geltenden alten Constraint. Die BATS-Tests
// prüfen dieselbe Invariante nur statisch über Zeilennummern.
function fakePool(): { pool: Pool; statements: string[] } {
  const statements: string[] = [];
  const pool = {
    query: async (sql: string) => { statements.push(sql); return { rows: [], rowCount: 0 }; },
  } as unknown as Pool;
  return { pool, statements };
}

describe('applyTypeVocabularyMigration', () => {
  it('droppt den Constraint, erweitert ihn und migriert danach die Daten', async () => {
    const { pool, statements } = fakePool();
    await applyTypeVocabularyMigration(pool);

    const drop = statements.findIndex((s) => s.includes('DROP CONSTRAINT IF EXISTS tickets_type_check'));
    const add = statements.findIndex((s) => s.includes('ADD CONSTRAINT tickets_type_check'));
    const update = statements.findIndex((s) => s.includes('UPDATE tickets.tickets SET type'));

    expect(drop).toBeGreaterThanOrEqual(0);
    expect(add).toBeGreaterThan(drop);
    expect(update).toBeGreaterThan(add);
  });

  // [T002497] Der Test hiess "der CHECK trägt alle dreizehn Werte" und prüfte
  // toHaveLength(13). Mit dem incident-Typ (T002407) wurden es 14, und der Test
  // war seit dem 29.07. rot. Die Zahl steckte in Name UND Assertion — zwei
  // Stellen, die auseinanderlaufen können. Der Name führt sie jetzt nicht mehr.
  //
  // Die Längenprüfung bleibt trotzdem, als Positiv-Anker: wäre TICKET_TYPES
  // leer, liefe die Schleife darunter null Mal und der Test bestünde vakuos.
  // Sie ist bewusst exakt und kein >=, damit ein Hinzufügen oder Entfernen von
  // Typen hier sichtbar wird statt still durchzugehen.
  it('der CHECK trägt jeden Wert aus TICKET_TYPES', async () => {
    const { pool, statements } = fakePool();
    await applyTypeVocabularyMigration(pool);
    const check = statements.find((s) => s.includes('ADD CONSTRAINT tickets_type_check'))!;

    expect(TICKET_TYPES).toHaveLength(14); // 11 Conventional-Commit-Typen + 3 Altwerte
    for (const t of TICKET_TYPES) expect(check).toContain(`'${t}'`);
  });

  it('das UPDATE ist per WHERE-Filter idempotent', async () => {
    const { pool, statements } = fakePool();
    await applyTypeVocabularyMigration(pool);
    const update = statements.find((s) => s.includes('UPDATE tickets.tickets SET type'))!;

    // Ohne diesen Filter würde der zweite Pod-Boot alle Zeilen anfassen und das
    // CASE ohne ELSE würde type auf NULL setzen.
    expect(update).toContain("WHERE type IN ('bug','feature','task')");
    expect(update).toContain("WHEN 'bug'     THEN 'fix'");
    expect(update).toContain("WHEN 'feature' THEN 'feat'");
    expect(update).toContain("WHEN 'task'    THEN 'chore'");
  });
});
